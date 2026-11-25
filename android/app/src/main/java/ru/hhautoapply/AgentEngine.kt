package ru.hhautoapply

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.FileProvider
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.io.File
import kotlin.coroutines.coroutineContext

/**
 * Движок агента — живёт в процессе приложения, а не в окне. Его запускает фоновая задача (RunWorker),
 * поэтому он работает и при выключенном экране. Окно «Агент» только показывает его браузер и отвечает на вопросы.
 */
object AgentEngine {
    sealed class Prompt {
        data class Human(val reason: String) : Prompt()
        data class Confirm(val question: String) : Prompt()
    }

    val status = MutableStateFlow("Агент не запущен")
    private val pageLoads = MutableStateFlow(0)
    val running = MutableStateFlow(false)
    /** Какой агент сейчас работает: "hh" или "linkedin" ("" — никакой). */
    val target = MutableStateFlow("")
    val prompt = MutableStateFlow<Prompt?>(null)
    private var answer: CompletableDeferred<Boolean>? = null

    @Volatile var web: WebView? = null
        private set
    private var agent: BrowserAgent? = null
    @Volatile private var resumeLang = "ru"

    /** Ответ пользователя на текущий вопрос (Готово/Пропустить, Отправить/Нет). */
    fun answer(v: Boolean) { answer?.complete(v) }

    // ---------- браузер ----------
    @SuppressLint("SetJavaScriptEnabled")
    /** true — выбор файла отдаёт оба PDF резюме (рассылка в Telegram). */
    @Volatile var attachBoth = false

    suspend fun ensureWeb(ctx: Context): WebView = withContext(Dispatchers.Main) {
        web ?: WebView(ctx.applicationContext).also { w ->
            w.settings.javaScriptEnabled = true
            w.settings.domStorageEnabled = true
            w.settings.userAgentString = Text.chromeUa(ctx)
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(w, true)
            w.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    request.url.scheme != "http" && request.url.scheme != "https"
                override fun onPageFinished(view: WebView, url: String) { agent?.onPageFinished(); pageLoads.value = pageLoads.value + 1 }
            }
            w.webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    val app = view.context.applicationContext
                    // Рассылка HR в Telegram: оба резюме (русское и английское) одним выбором
                    if (attachBoth) {
                        // копии с понятными именами — так их и увидит HR: «Имя — резюме RU.pdf», «Name — CV EN.pdf»
                        val dir = File(app.filesDir, "tg").apply { mkdirs() }
                        val who = Prefs.get(app, "name").replace(Regex("[\\\\/:*?\"<>|]"), "").trim()
                        val files = listOf("ru", "en").mapNotNull { lang ->
                            val src = File(app.filesDir, "resume_$lang.pdf").takeIf { it.exists() } ?: return@mapNotNull null
                            val nice = (if (who.isNotBlank()) "$who — " else "") + if (lang == "ru") "резюме RU.pdf" else "CV EN.pdf"
                            File(dir, nice).also { src.copyTo(it, overwrite = true) }
                        }
                        val pick = if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) files else files.take(1)
                        callback.onReceiveValue(pick.map { FileProvider.getUriForFile(app, "${app.packageName}.files", it) }.toTypedArray().takeIf { it.isNotEmpty() })
                        return true
                    }
                    val file = listOf(File(app.filesDir, "resume_$resumeLang.pdf"), File(app.filesDir, "resume_ru.pdf")).firstOrNull { it.exists() }
                    callback.onReceiveValue(file?.let { arrayOf(FileProvider.getUriForFile(app, "${app.packageName}.files", it)) })
                    return true
                }
            }
            keepSize(w)
            web = w
        }
    }

    /** Когда окно агента закрыто, браузер живёт без экрана — задаём ему размер телефона, чтобы страницы верстались. */
    fun keepSize(w: WebView) {
        val dm = w.context.resources.displayMetrics
        w.measure(View.MeasureSpec.makeMeasureSpec(dm.widthPixels, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(dm.heightPixels, View.MeasureSpec.EXACTLY))
        w.layout(0, 0, dm.widthPixels, dm.heightPixels)
    }

    fun attach(container: ViewGroup) {
        val w = web ?: return
        (w.parent as? ViewGroup)?.removeView(w)
        container.addView(w, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    fun detach() {
        val w = web ?: return
        (w.parent as? ViewGroup)?.removeView(w)
        keepSize(w)
    }

    // ---------- чтение контактов со страницы (ODS) — без нейросети ----------
    private val agentJsCache = mutableMapOf<String, String>()

    private suspend fun evalJs(w: WebView, code: String): String = withContext(Dispatchers.Main) {
        kotlinx.coroutines.suspendCancellableCoroutine { cont ->
            w.evaluateJavascript(code) { r -> if (cont.isActive) cont.resumeWith(Result.success(r ?: "null")) }
        }
    }

    /** Открывает страницу во встроенном браузере (с вашими входами на сайты) и достаёт контакты HR. null — агент занят. */
    suspend fun readContacts(ctx: Context, url: String): JSONObject? {
        if (running.value) return null
        val w = ensureWeb(ctx)
        val js = agentJsCache.getOrPut("agent") { ctx.assets.open("agent.js").bufferedReader().readText() }
        val before = withContext(Dispatchers.Main) {
            if (running.value) return@withContext null
            pageLoads.value.also { w.loadUrl(url) }
        } ?: return null
        withTimeoutOrNull(30_000) { pageLoads.first { it > before } } ?: return JSONObject()
        delay(2500)
        if (running.value) return null

        val expected = JSONObject.quote(url)
        suspend fun grab(): JSONObject {
            val raw = evalJs(w, js + "\nwindow.__ag.contacts($expected)")
            return runCatching { JSONObject(org.json.JSONTokener(raw).nextValue() as String) }.getOrDefault(JSONObject())
        }
        var c = grab()
        if (c.optString("state") == "hidden" && !running.value &&
            evalJs(w, "window.__ag && window.__ag.contactsReveal($expected)") == "true") {
            delay(1000)
            if (running.value) return null
            c = grab()
        }
        return c.takeUnless { running.value }
    }

    // ---------- вопросы к человеку ----------
    private suspend fun ask(ctx: Context, p: Prompt, text: String): Boolean {
        val d = CompletableDeferred<Boolean>()
        answer = d
        prompt.value = p
        // статистика: сколько раз агент просил помощи (капча, вход, подтверждение…) — по ресурсу
        val fallback = when (target.value) { "hh" -> "hh_site"; "habr" -> "habr_agent"; "linkedin" -> "linkedin_agent"; "single" -> "single"; else -> target.value }
        Timing.addHelp(ctx, fallback, Timing.helpKind(text, p is Prompt.Confirm))
        RunWorker.attention(ctx, text)
        RunLog.add(ctx, "  ✋ $text")
        try {
            // Ждём до 15 минут; если никто не ответил — пропускаем и идём дальше
            return withTimeoutOrNull(15 * 60_000L) { d.await() } ?: false.also {
                RunLog.add(ctx, "  нет ответа 15 минут — пропуск"); Timing.helpMissed(ctx, fallback)
            }
        } finally {
            // и при отмене (например, капча исчезла сама) убираем вопрос и уведомление
            if (answer === d) { prompt.value = null; answer = null }
            RunWorker.clearAttention(ctx)
        }
    }

    // ---------- сессия ----------
    private fun statusOf(o: Outcome) = when (o) {
        Outcome.DONE, Outcome.HUMAN_DONE -> "applied"
        Outcome.SKIPPED -> "manual"
        Outcome.FAILED -> "failed"
    }

    private fun needConfirm(ctx: Context, sourceKey: String) =
        when (sourceKey) { "linkedin" -> Prefs.bool(ctx, "linkedin_confirm"); "ods_tg" -> Prefs.bool(ctx, "ods_tg_confirm"); else -> Prefs.bool(ctx, "agent_confirm") }

    private suspend fun letterFor(ctx: Context, llm: Llm, title: String, employer: String, description: String, lang: String): String =
        withContext(Dispatchers.IO) {
            val v = JSONObject().put("name", title).put("employer", JSONObject().put("name", employer)).put("description", description)
            val resume = Prefs.get(ctx, if (lang == "en") "en_resume_text" else "ru_resume_text").ifBlank { Prefs.get(ctx, "ru_resume_text") }
            Letters.write(llm, v, lang, resume, Prefs.get(ctx, if (lang == "en") "name_en" else "name"), Prefs.get(ctx, "en_cv_url"))
        }

    /** Подходит ли вакансия под целевые роли (нейросеть). Не подходит — пишем в журнал как «пропущена» с причиной. */
    private suspend fun fits(ctx: Context, llm: Llm, db: Db, id: String, title: String, company: String, url: String,
                             desc: String, channel: String): Boolean {
        status.value = "Проверяю, подходит ли «$title»…"
        val resume = Prefs.get(ctx, "ru_resume_text").ifBlank { Prefs.get(ctx, "en_resume_text") }
        val (ok, reason) = withContext(Dispatchers.IO) { Letters.assess(llm, title, desc, Prefs.get(ctx, "target_roles"), resume) }
        Timing.assessed(ctx, channel, ok)
        if (!ok) {
            db.record(id, title, company, url, url, "", "skipped", channel, error = "не подходит: $reason")
            RunLog.add(ctx, "  ✗ $title — не подходит: $reason")
        }
        return ok
    }

    private suspend fun pause(ctx: Context, linkedin: Boolean = false) {
        val lo = if (linkedin) maxOf(30, Prefs.int(ctx, "linkedin_delay_min")) else maxOf(15, Prefs.int(ctx, "delay_min"))
        val hi = maxOf(lo, Prefs.int(ctx, if (linkedin) "linkedin_delay_max" else "delay_max"))
        val sec = (lo..hi).random()
        status.value = "Пауза $sec с, чтобы не выглядеть как бот…"
        delay(sec * 1000L)
    }

    /**
     * Запуск агента. single=true — один отклик на странице, которая сейчас открыта в браузере агента.
     * Возвращает краткий итог.
     */
    suspend fun run(ctx: Context, single: Boolean, source: String = "", target: String = "hh"): String {
        if (!running.compareAndSet(expect = false, update = true)) {
            val name = when (this.target.value) { "linkedin" -> "LinkedIn"; "habr" -> "Хабр Карьера"; "ods_tg" -> "ODS → HR"; "hh" -> "hh"; else -> Sites.byKey(this.target.value)?.name ?: "hh" }
            val msg = "Уже работает агент $name — сначала остановите его"
            RunLog.add(ctx, msg)
            return msg
        }
        this.target.value = if (single) "single" else target
        try {
            val llm by lazy { Llm(ctx) { RunLog.add(ctx, it) } }
            val w = ensureWeb(ctx)
            val a = BrowserAgent(ctx, w, { llm }, { status.value = it },
                { reason -> ask(ctx, Prompt.Human(reason), reason) },
                { q -> ask(ctx, Prompt.Confirm(q), q) })
            agent = a
            return when {
                single -> runSingle(ctx, a, llm, source)
                target == "linkedin" -> try { a.desktopMode(true); runLinkedIn(ctx, a, llm) } finally { a.desktopMode(false) }
                target == "habr" -> runHabr(ctx, a, llm)
                target == "ods_tg" -> runOdsOutreach(ctx, a)
                Sites.byKey(target) != null -> runSite(ctx, a, llm, Sites.byKey(target)!!)
                else -> runSession(ctx, a, llm)
            }
        } catch (e: StopSessionException) {
            status.value = "⛔ ${e.message}"
            RunLog.add(ctx, "⛔ ${e.message}")
            RunWorker.notify(ctx, "Агент остановлен", e.message.orEmpty())
            return e.message.orEmpty()
        } finally {
            Timing.end(ctx, applied = false) // последняя вакансия, если сессию прервали
            agent = null
            this.target.value = ""
            prompt.value = null
            running.value = false
        }
    }

    private suspend fun runSingle(ctx: Context, a: BrowserAgent, llm: Llm, source: String): String {
        status.value = "Читаю вакансию и пишу письмо…"
        Timing.begin(ctx, source.ifBlank { "single" })
        val title = withContext(Dispatchers.Main) { web?.title.orEmpty() }
        val text = a.call("window.__ag.bodyText()")
        val lang = Text.detectLanguage("$title $text").also { resumeLang = it }
        val letter = letterFor(ctx, llm, title, "", text, lang)
        val outcome = a.runGoal(AgentGoal(title, "", letter, lang), needConfirm(ctx, source))
        val url = a.currentUrl()
        val st = statusOf(outcome)
        Db(ctx).record("$source:${url.hashCode()}", title, "", url, url, lang, st, source, letter)
        val msg = "Готово: ${Db.STATUS_RU[st]} — $title (${Timing.dur(Timing.end(ctx, st == "applied"))})"
        status.value = "$msg. Можно открыть следующую вакансию и снова нажать «Старт»."
        return msg
    }

    /** Название содержит все слова запроса (дефис = пробел): Хабр ищет и по описанию, а нам нужно по названию. */
    private fun titleMatches(title: String, query: String): Boolean {
        val norm = { x: String -> x.lowercase().replace('-', ' ').replace('ё', 'е') }
        val t = norm(title)
        return norm(query).split(' ').filter { it.isNotBlank() }.all { t.contains(it) }
    }

    /** Общий агент сайта (SuperJob, сайты компаний, США, ОАЭ, Европа): поиск → вакансия → проверка → письмо → отклик. */
    private suspend fun runSite(ctx: Context, a: BrowserAgent, llm: Llm, def: SiteDef): String {
        val db = Db(ctx)
        val limit = Sites.limit(ctx, def).coerceAtLeast(1)
        val dailyCap = Prefs.int(ctx, "site_daily_limit").coerceAtLeast(1)
        val include = Prefs.list(ctx, "title_include")
        val exclude = Prefs.list(ctx, "title_exclude")
        val maxPages = if (def.paged) Prefs.int(ctx, "max_pages").coerceIn(1, 40) else 1
        var done = 0
        RunLog.add(ctx, "Агент ${def.name}: старт, лимит $limit (в сутки $dailyCap)")
        fun capReached(): Boolean {
            if (done >= limit) return true
            if (db.appliedTodayIn(def.key) >= dailyCap) { RunLog.add(ctx, "${def.name}: дневной лимит ($dailyCap) достигнут"); return true }
            return false
        }
        val queries = if (def.noQuery) listOf("") else Sites.queries(ctx, def)
        queries@ for (query in queries) {
            val pageSeen = mutableSetOf<String>()
            for (page in 0 until maxPages) {
                coroutineContext.ensureActive()
                if (capReached()) break@queries
                val links = a.siteSearch(def, query, page, llm) ?: break@queries
                if (links.isEmpty()) break
                if (links.count { pageSeen.add(it.id) } == 0) break
                links.filter { it.applied }.forEach { db.markAppliedElsewhere("${def.key}:${it.id}", it.title, it.url, def.key) }
                val fresh = links.filter {
                    !it.applied && !db.seen("${def.key}:${it.id}") &&
                        (it.title.isBlank() || Text.titleOk(it.title, include, exclude))
                }
                Timing.listing(ctx, def.key, links.filter { !it.applied && !db.seen("${def.key}:${it.id}") }.map { it.id to (it in fresh) })
                RunLog.add(ctx, "${def.name} ${if (query.isBlank()) "лента" else "«$query»"}, стр. ${page + 1}: вакансий ${links.size}, новых подходящих ${fresh.size}")
                for (v in fresh) {
                    coroutineContext.ensureActive()
                    if (capReached()) break@queries
                    val id = "${def.key}:${v.id}"
                    Timing.begin(ctx, def.key)
                    status.value = "${def.name}: «${v.title.ifBlank { "вакансия" }}» (откликов $done из $limit)"
                    if (!a.open(v.url)) { db.record(id, v.title, "", v.url, v.url, "", "manual", def.key, error = "не открылась"); continue }
                    if (a.pageApplied()) { db.markAppliedElsewhere(id, v.title, v.url, def.key); continue }
                    val title = v.title.ifBlank { a.pageTitle() }.take(150)
                    if (!Text.titleOk(title, if (v.title.isBlank()) emptyList() else include, exclude)) {
                        db.record(id, title, "", v.url, v.url, "", "skipped", def.key, error = "не подходит по названию"); continue
                    }
                    val desc = a.call("window.__ag.bodyText()")
                    if (Text.isCvHeavy(desc)) { db.record(id, title, "", v.url, "", "", "skipped", def.key, error = "computer vision"); continue }
                    if (!fits(ctx, llm, db, id, title, "", v.url, desc, def.key)) continue
                    val lang = Text.detectLanguage("$title $desc").also { resumeLang = it }
                    status.value = "${def.name}: пишу письмо — «$title»"
                    val letter = try { letterFor(ctx, llm, title, "", desc, lang) } catch (e: StopSessionException) { throw e } catch (e: Exception) {
                        RunLog.add(ctx, "  ! письмо не сгенерировано: ${e.message}"); continue
                    }
                    val outcome = a.runGoal(AgentGoal(title, "", letter, lang), needConfirm(ctx, def.key))
                    val st = statusOf(outcome)
                    db.record(id, title, "", v.url, v.url, lang, st, def.key, letter)
                    val ms = Timing.end(ctx, st == "applied")
                    RunLog.add(ctx, "• [${def.name}] [$lang] $title → ${Db.STATUS_RU[st]} (${Timing.dur(ms)})")
                    if (st == "applied") { done++; pause(ctx) }
                }
            }
        }
        val summary = "Агент ${def.name} закончил: откликов $done."
        RunLog.add(ctx, summary)
        status.value = "$summary Подробности — в «Журнале»."
        return summary
    }

    private suspend fun runOdsOutreach(ctx: Context, browser: BrowserAgent): String {
        attachBoth = true
        try {
            return OdsOutreach.run(ctx, browser, status = { status.value = it }) { question ->
                !needConfirm(ctx, "ods_tg") || ask(ctx, Prompt.Confirm(question), question)
            }
        } finally {
            attachBoth = false
        }
    }

    /** Агент Хабр Карьеры: ваш список «Что искать» → все страницы → вакансия → письмо → «Откликнуться». */
    private suspend fun runHabr(ctx: Context, a: BrowserAgent, llm: Llm): String {
        val db = Db(ctx)
        val net = Net()
        val limit = Prefs.int(ctx, "habr_limit").coerceAtLeast(1)
        val dailyCap = Prefs.int(ctx, "habr_daily_limit").coerceAtLeast(1)
        val exclude = Prefs.list(ctx, "title_exclude")
        val include = Prefs.list(ctx, "title_include")
        val maxPages = Prefs.int(ctx, "max_pages").coerceIn(1, 40)
        var done = 0
        RunLog.add(ctx, "Агент Хабр Карьеры: старт, лимит $limit (в сутки $dailyCap)")
        fun capReached(): Boolean {
            if (done >= limit) return true
            if (db.appliedTodayIn("habr_agent") >= dailyCap) { RunLog.add(ctx, "Хабр: дневной лимит ($dailyCap) достигнут"); return true }
            return false
        }
        if (!a.habrEnsureLogin()) { RunLog.add(ctx, "Хабр: вход не выполнен"); return "Хабр: вход не выполнен" }
        queries@ for (query in Prefs.list(ctx, "habr_queries", Regex("\n"))) {
            var page = 0
            while (page < maxPages) {
                coroutineContext.ensureActive()
                if (capReached()) break@queries
                status.value = "Хабр: ищу «$query», стр. ${page + 1}"
                val (list, totalPages) = try { withContext(Dispatchers.IO) { Sources.habrPage(net, query, page) } } catch (e: Exception) {
                    RunLog.add(ctx, "Хабр: ошибка поиска — ${e.message}"); break
                }
                if (list.isEmpty()) break
                val fresh = list.filter {
                    !it.junior && (titleMatches(it.title, query) || Text.titleOk(it.title, include, emptyList())) &&
                        Text.titleOk(it.title, emptyList(), exclude) && !db.seen("habr:${it.id}")
                }
                Timing.listing(ctx, "habr_agent", list.filter { !db.seen("habr:${it.id}") }.map { it.id to (it in fresh) })
                RunLog.add(ctx, "Хабр «$query», стр. ${page + 1}/$totalPages: вакансий ${list.size}, новых подходящих ${fresh.size}")
                for (v in fresh) {
                    coroutineContext.ensureActive()
                    if (capReached()) break@queries
                    val id = "habr:${v.id}"
                    Timing.begin(ctx, "habr_agent")
                    status.value = "Хабр: «${v.title}» (откликов $done из $limit)"
                    val (company0, desc) = a.habrOpen(v.id)
                    val company = company0.ifBlank { v.company }
                    if (a.habrApplied()) { db.markAppliedElsewhere(id, v.title, v.url, "habr_agent"); continue } // отклик уже есть
                    if (Text.isCvHeavy(desc)) { db.record(id, v.title, company, v.url, "", "", "skipped", "habr_agent", error = "computer vision"); continue }
                    if (!fits(ctx, llm, db, id, v.title, company, v.url, desc, "habr_agent")) continue
                    val lang = Text.detectLanguage("${v.title} $desc").also { resumeLang = it }
                    status.value = "Хабр: пишу письмо — «${v.title}»"
                    val letter = try { letterFor(ctx, llm, v.title, company, desc, lang) } catch (e: StopSessionException) { throw e } catch (e: Exception) {
                        RunLog.add(ctx, "  ! письмо не сгенерировано: ${e.message}"); continue
                    }
                    val (outcome, note) = a.habrApply(AgentGoal(v.title, company, letter, lang), needConfirm(ctx, "habr"))
                    val st = if (outcome == Outcome.FAILED && note.isNotBlank()) "skipped" else statusOf(outcome)
                    db.record(id, v.title, company, v.url, v.url, lang, st, "habr_agent", letter, note)
                    val ms = Timing.end(ctx, st == "applied" && note.isBlank())
                    RunLog.add(ctx, "• [Хабр] [$lang] ${v.title} — $company → ${Db.STATUS_RU[st]}${if (note.isNotBlank()) " ($note)" else ""} (${Timing.dur(ms)})")
                    if (st == "applied" && note.isBlank()) { done++; pause(ctx) }
                }
                page++
                if (page >= totalPages) break
            }
        }
        val summary = "Агент Хабр Карьеры закончил: откликов $done."
        RunLog.add(ctx, summary)
        status.value = "$summary Подробности — в «Журнале»."
        return summary
    }

    /** LinkedIn-агент: поиск (Easy Apply) → вакансия → письмо → шаги Easy Apply. Отдельные лимиты и паузы. */
    private suspend fun runLinkedIn(ctx: Context, a: BrowserAgent, llm: Llm): String {
        val db = Db(ctx)
        val limit = Prefs.int(ctx, "linkedin_limit").coerceAtLeast(1)
        val dailyCap = Prefs.int(ctx, "linkedin_daily_limit").coerceAtLeast(1)
        val exclude = Prefs.list(ctx, "title_exclude")
        val include = Prefs.list(ctx, "title_include")
        var done = 0
        RunLog.add(ctx, "LinkedIn-агент: старт, лимит $limit (в сутки $dailyCap)")
        fun capReached(): Boolean {
            if (done >= limit) return true
            if (db.appliedTodayIn("linkedin_agent") >= dailyCap) { RunLog.add(ctx, "LinkedIn: дневной лимит ($dailyCap) достигнут"); return true }
            return false
        }
        if (!a.liEnsureLogin()) { RunLog.add(ctx, "LinkedIn: вход не выполнен"); return "LinkedIn: вход не выполнен" }
        val maxPages = Prefs.int(ctx, "linkedin_pages").coerceIn(1, 40)

        suspend fun applyAll(list: List<BrowserAgent.HhVacancy>, label: String, requireEasy: Boolean) {
            list.filter { it.applied }.forEach { db.markAppliedElsewhere("li:${it.id}", it.title, "https://www.linkedin.com/jobs/view/${it.id}/", "linkedin_agent") }
            val fresh = list.filter { !it.applied && Text.titleOk(it.title, include, exclude) && !db.seen("li:${it.id}") }
            Timing.listing(ctx, "linkedin_agent", list.filter { !it.applied && !db.seen("li:${it.id}") }.map { it.id to (it in fresh) })
            RunLog.add(ctx, "LinkedIn $label: вакансий ${list.size}, новых ${fresh.size}")
            for (v in fresh) {
                coroutineContext.ensureActive()
                if (capReached()) return
                val id = "li:${v.id}"
                val url = "https://www.linkedin.com/jobs/view/${v.id}/"
                Timing.begin(ctx, "linkedin_agent")
                status.value = "LinkedIn: «${v.title}» (откликов $done из $limit)"
                val (company, desc, applied) = a.liOpen(v.id)
                if (applied) { db.markAppliedElsewhere(id, v.title, url, "linkedin_agent"); continue }
                if (Text.isCvHeavy(desc)) { db.record(id, v.title, company, url, "", "", "skipped", "linkedin_agent", error = "computer vision"); continue }
                if (!fits(ctx, llm, db, id, v.title, company, url, desc, "linkedin_agent")) continue
                val lang = Text.detectLanguage("${v.title} $desc").also { resumeLang = it }
                status.value = "LinkedIn: пишу письмо — «${v.title}»"
                val letter = try { letterFor(ctx, llm, v.title, company, desc, lang) } catch (e: StopSessionException) { throw e } catch (e: Exception) {
                    RunLog.add(ctx, "  ! письмо не сгенерировано: ${e.message}"); continue
                }
                val outcome = a.liApply(AgentGoal(v.title, company, letter, lang), needConfirm(ctx, "linkedin"), requireEasy)
                val st = if (outcome == Outcome.FAILED && requireEasy) "skipped" else statusOf(outcome)
                db.record(id, v.title, company, url, url, lang, st, "linkedin_agent", letter)
                val ms = Timing.end(ctx, st == "applied")
                RunLog.add(ctx, "• [LinkedIn] [$lang] ${v.title} — $company → ${Db.STATUS_RU[st]} (${Timing.dur(ms)})")
                if (st == "applied") { done++; pause(ctx, linkedin = true) }
            }
        }

        // 1. Рекомендации LinkedIn (берём только вакансии с Easy Apply)
        val pageSeen = mutableSetOf<String>()
        recs@ for (page in 0 until maxPages) {
            coroutineContext.ensureActive()
            if (capReached()) break@recs
            val list = a.liRecommendedPage(page) ?: break@recs
            if (list.isEmpty()) break
            // Страница не принесла ничего нового (сайт повторяет последнюю) — дальше не листаем
            if (list.count { pageSeen.add(it.id) } == 0) break
            applyAll(list, "рекомендации, стр. ${page + 1}", requireEasy = true)
        }
        // 2. Ваши запросы (поиск только Easy Apply), все страницы
        queries@ for (query in Prefs.list(ctx, "linkedin_queries", Regex("\n"))) {
            val pageSeen = mutableSetOf<String>()
            for (page in 0 until maxPages) {
                coroutineContext.ensureActive()
                if (capReached()) break@queries
                val list = a.liSearchPage(query, page) ?: break@queries
                if (list.isEmpty()) break
                // Страница не принесла ничего нового (сайт повторяет последнюю) — дальше не листаем
                if (list.count { pageSeen.add(it.id) } == 0) break
                applyAll(list, "«$query», стр. ${page + 1}", requireEasy = false)
            }
        }
        val summary = "LinkedIn-агент закончил: откликов $done."
        RunLog.add(ctx, summary)
        status.value = "$summary Подробности — в «Журнале»."
        return summary
    }

    private suspend fun runSession(ctx: Context, a: BrowserAgent, llm: Llm): String {
        val db = Db(ctx)
        val limit = Prefs.int(ctx, "agent_limit").coerceAtLeast(1)
        val dailyCap = Prefs.int(ctx, "daily_limit")
        var done = 0
        RunLog.add(ctx, "Агент: старт, лимит $limit откликов")

        fun capReached(): Boolean {
            if (done >= limit) return true
            if (db.appliedToday() >= dailyCap) { RunLog.add(ctx, "Дневной лимит откликов ($dailyCap) достигнут"); return true }
            return false
        }

        // 1. hh.ru через сайт: рекомендации по резюме и запросы по кругу, по hh_batch (30) вакансий на каждый.
        val hh = Sources.byKey("hh")
        if (hh != null && Sources.isOn(ctx, hh) && !HhMode.useApi(ctx)) {
            if (a.ensureHhLogin()) {
                val include = Prefs.list(ctx, "title_include")
                val exclude = Prefs.list(ctx, "title_exclude")

                val handled = mutableSetOf<String>() // вакансия может встретиться и в рекомендациях, и в поиске
                val maxPages = Prefs.int(ctx, "max_pages").coerceIn(1, 40)
                val batch = Prefs.int(ctx, "hh_batch").coerceAtLeast(1)

                suspend fun applyOne(v: BrowserAgent.HhVacancy) {
                    Timing.begin(ctx, "hh_site")
                    status.value = "hh: «${v.title}» (откликов $done из $limit)"
                    val (employer, desc, archived) = a.hhOpen(v.id)
                    val url = "https://hh.ru/vacancy/${v.id}"
                    if (archived) { db.record(v.id, v.title, employer, url, "", "", "skipped", "hh_site", error = "archived"); return }
                    if (a.hhApplied()) { db.markAppliedElsewhere(v.id, v.title, url, "hh_site"); return } // отклик уже есть — письмо не пишем
                    if (Text.isCvHeavy(desc)) { db.record(v.id, v.title, employer, url, "", "", "skipped", "hh_site", error = "computer vision"); return }
                    if (!fits(ctx, llm, db, v.id, v.title, employer, url, desc, "hh_site")) return
                    val lang = Text.detectLanguage("${v.title} $desc").also { resumeLang = it }
                    status.value = "hh: пишу письмо — «${v.title}»"
                    val letter = try { letterFor(ctx, llm, v.title, employer, desc, lang) } catch (e: StopSessionException) { throw e } catch (e: Exception) {
                        RunLog.add(ctx, "  ! письмо не сгенерировано: ${e.message}"); return
                    }
                    val outcome = a.hhApply(AgentGoal(v.title, employer, letter, lang), needConfirm(ctx, "hh"))
                    val st = statusOf(outcome)
                    db.record(v.id, v.title, employer, url, url, lang, st, "hh_site", letter)
                    val ms = Timing.end(ctx, st == "applied")
                    RunLog.add(ctx, "• [hh] [$lang] ${v.title} — $employer → ${Db.STATUS_RU[st]} (${Timing.dur(ms)})")
                    if (st == "applied") { done++; pause(ctx) }
                }

                /** Поток вакансий: рекомендации под резюме или один поисковый запрос; листается по страницам по мере надобности. */
                class Stream(val label: String, val useInclude: Boolean, val fetch: suspend (Int) -> List<BrowserAgent.HhVacancy>?) {
                    var page = 0; var finished = false
                    val buf = ArrayDeque<BrowserAgent.HhVacancy>(); val pageSeen = mutableSetOf<String>()
                }
                var aborted = false // капча без ответа — останавливаем hh целиком
                suspend fun refill(s: Stream) {
                    while (s.buf.isEmpty() && !s.finished && !aborted) {
                        coroutineContext.ensureActive()
                        if (s.page >= maxPages) { s.finished = true; break }
                        val list = s.fetch(s.page)
                        if (list == null) { aborted = true; break }
                        // пусто или сайт повторяет последнюю страницу — поток закончился
                        if (list.isEmpty() || list.count { s.pageSeen.add(it.id) } == 0) { s.finished = true; break }
                        // Отмечены в выдаче как «Вы откликнулись» — не открываем, просто запоминаем
                        list.filter { it.applied }.forEach { db.markAppliedElsewhere(it.id, it.title, "https://hh.ru/vacancy/${it.id}", "hh_site") }
                        val fresh = list.filter {
                            !it.applied && it.id !in handled && Text.titleOk(it.title, if (s.useInclude) include else emptyList(), exclude) && !db.seen(it.id)
                        }
                        Timing.listing(ctx, "hh_site", list.filter { !it.applied && !db.seen(it.id) }.map { it.id to (it in fresh) })
                        RunLog.add(ctx, "hh ${s.label}, стр. ${s.page + 1}: вакансий ${list.size}, новых подходящих ${fresh.size}")
                        s.buf.addAll(fresh)
                        s.page++
                    }
                }

                // Рекомендации hh под каждое резюме («Вакансии для вас»), затем каждый запрос.
                // Идём по кругу: $batch вакансий из рекомендаций → $batch по первому запросу → … → снова рекомендации, следующие $batch.
                val streams = Prefs.list(ctx, "hh_resume_hashes").map { hash -> Stream("рекомендации", true) { p -> a.hhRecommendedPage(hash, p) } } +
                    Prefs.list(ctx, "queries", Regex("\n")).map { q -> Stream("«$q»", false) { p -> a.hhSearchPage(q, p) } } // hh уже нашёл запрос в названии
                rounds@ while (!aborted && streams.any { !it.finished || it.buf.isNotEmpty() }) {
                    for (s in streams) {
                        var n = 0
                        while (n < batch) {
                            coroutineContext.ensureActive()
                            if (capReached()) break@rounds
                            refill(s)
                            if (aborted) break@rounds
                            val v = s.buf.removeFirstOrNull() ?: break
                            if (!handled.add(v.id) || db.seen(v.id)) continue
                            applyOne(v); n++
                        }
                        if (n > 0) RunLog.add(ctx, "hh ${s.label}: просмотрено $n — переключаюсь на следующий запрос")
                    }
                }
            } else RunLog.add(ctx, "hh: вход не выполнен — пропускаю")
        }

        // 2. Очередь «Анкеты» (Хабр, GetMatch, Telegram, удалёнка…). Hacker News — письмом на email, это вручную.
        val queue = db.pendingBrowser().filter { it.channel != "hn" }
        if (queue.isNotEmpty() && !capReached()) RunLog.add(ctx, "Очередь «Анкеты»: ${queue.size}")
        for (app in queue) {
            coroutineContext.ensureActive()
            if (capReached()) break
            val src = Sources.byKey(app.channel)?.name ?: app.channel
            Timing.begin(ctx, app.channel)
            status.value = "$src: «${app.title}» (откликов $done из $limit)"
            resumeLang = app.language.ifBlank { "ru" }
            if (!Text.titleOk(app.title, emptyList(), Prefs.list(ctx, "title_exclude"))) {
                db.setStatus(app.vacancyId, "skipped"); continue
            }
            if (!a.open(app.formUrl)) { db.setStatus(app.vacancyId, "manual"); continue }
            val outcome = a.runGoal(AgentGoal(app.title, app.employer, app.letter, resumeLang), needConfirm(ctx, app.channel))
            val st = statusOf(outcome)
            db.setStatus(app.vacancyId, st)
            val ms = Timing.end(ctx, st == "applied")
            RunLog.add(ctx, "• [$src] ${app.title} → ${Db.STATUS_RU[st]} (${Timing.dur(ms)})")
            if (st == "applied") { done++; pause(ctx) }
        }

        val summary = "Агент закончил: откликов $done."
        RunLog.add(ctx, summary)
        status.value = "$summary Подробности — в «Журнале»."
        return summary
    }
}
