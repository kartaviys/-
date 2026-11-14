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
    val running = MutableStateFlow(false)
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
    suspend fun ensureWeb(ctx: Context): WebView = withContext(Dispatchers.Main) {
        web ?: WebView(ctx.applicationContext).also { w ->
            w.settings.javaScriptEnabled = true
            w.settings.domStorageEnabled = true
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(w, true)
            w.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    request.url.scheme != "http" && request.url.scheme != "https"
                override fun onPageFinished(view: WebView, url: String) { agent?.onPageFinished() }
            }
            w.webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    val app = view.context.applicationContext
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

    // ---------- вопросы к человеку ----------
    private suspend fun ask(ctx: Context, p: Prompt, text: String): Boolean {
        val d = CompletableDeferred<Boolean>()
        answer = d
        prompt.value = p
        RunWorker.attention(ctx, text)
        RunLog.add(ctx, "  ✋ $text")
        // Ждём до 15 минут; если никто не ответил — пропускаем и идём дальше
        val r = withTimeoutOrNull(15 * 60_000L) { d.await() } ?: false.also { RunLog.add(ctx, "  нет ответа 15 минут — пропуск") }
        prompt.value = null
        answer = null
        RunWorker.clearAttention(ctx)
        return r
    }

    // ---------- сессия ----------
    private fun statusOf(o: Outcome) = when (o) {
        Outcome.DONE, Outcome.HUMAN_DONE -> "applied"
        Outcome.SKIPPED -> "manual"
        Outcome.FAILED -> "failed"
    }

    private fun needConfirm(ctx: Context, sourceKey: String) =
        Prefs.bool(ctx, "agent_confirm") || sourceKey == "linkedin" // LinkedIn — всегда с подтверждением (риск бана)

    private suspend fun letterFor(ctx: Context, llm: Llm, title: String, employer: String, description: String, lang: String): String =
        withContext(Dispatchers.IO) {
            val v = JSONObject().put("name", title).put("employer", JSONObject().put("name", employer)).put("description", description)
            val resume = Prefs.get(ctx, if (lang == "en") "en_resume_text" else "ru_resume_text").ifBlank { Prefs.get(ctx, "ru_resume_text") }
            Letters.write(llm, v, lang, resume, Prefs.get(ctx, if (lang == "en") "name_en" else "name"), Prefs.get(ctx, "en_cv_url"))
        }

    private suspend fun pause(ctx: Context) {
        val lo = maxOf(15, Prefs.int(ctx, "delay_min"))
        val hi = maxOf(lo, Prefs.int(ctx, "delay_max"))
        val sec = (lo..hi).random()
        status.value = "Пауза $sec с, чтобы не выглядеть как бот…"
        delay(sec * 1000L)
    }

    /**
     * Запуск агента. single=true — один отклик на странице, которая сейчас открыта в браузере агента.
     * Возвращает краткий итог.
     */
    suspend fun run(ctx: Context, single: Boolean, source: String = ""): String {
        if (running.value) return "Агент уже работает"
        running.value = true
        try {
            val llm = Llm(ctx) { RunLog.add(ctx, it) }
            val w = ensureWeb(ctx)
            val a = BrowserAgent(ctx, w, llm, { status.value = it },
                { reason -> ask(ctx, Prompt.Human(reason), reason) },
                { q -> ask(ctx, Prompt.Confirm(q), q) })
            agent = a
            return if (single) runSingle(ctx, a, llm, source) else runSession(ctx, a, llm)
        } catch (e: BudgetException) {
            status.value = "⛔ ${e.message}"
            RunLog.add(ctx, "⛔ ${e.message}")
            RunWorker.notify(ctx, "Агент остановлен", e.message.orEmpty())
            return e.message.orEmpty()
        } finally {
            agent = null
            running.value = false
            prompt.value = null
        }
    }

    private suspend fun runSingle(ctx: Context, a: BrowserAgent, llm: Llm, source: String): String {
        status.value = "Читаю вакансию и пишу письмо…"
        val title = withContext(Dispatchers.Main) { web?.title.orEmpty() }
        val text = a.call("window.__ag.bodyText()")
        val lang = Text.detectLanguage("$title $text").also { resumeLang = it }
        val letter = letterFor(ctx, llm, title, "", text, lang)
        val outcome = a.runGoal(AgentGoal(title, "", letter, lang), needConfirm(ctx, source))
        val url = a.currentUrl()
        val st = statusOf(outcome)
        Db(ctx).record("$source:${url.hashCode()}", title, "", url, url, lang, st, source, letter)
        val msg = "Готово: ${Db.STATUS_RU[st]} — $title"
        status.value = "$msg. Можно открыть следующую вакансию и снова нажать «Старт»."
        return msg
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

        // 1. hh.ru через сайт: запрос → страница → сразу откликаемся → следующая страница → следующий запрос
        val hh = Sources.byKey("hh")
        if (hh != null && Sources.isOn(ctx, hh) && !HhMode.useApi(ctx)) {
            if (a.ensureHhLogin()) {
                val include = Prefs.list(ctx, "title_include")
                val exclude = Prefs.list(ctx, "title_exclude")
                queries@ for (query in Prefs.list(ctx, "queries", Regex("\n"))) {
                    for (page in 0 until 5) {
                        coroutineContext.ensureActive()
                        if (capReached()) break@queries
                        val list = a.hhSearchPage(query, page) ?: break@queries
                        if (list.isEmpty()) break
                        val fresh = list.filter { Text.titleOk(it.title, include, exclude) && !db.seen(it.id) }
                        RunLog.add(ctx, "hh «$query», стр. ${page + 1}: вакансий ${list.size}, новых подходящих ${fresh.size}")
                        for (v in fresh) {
                            coroutineContext.ensureActive()
                            if (capReached()) break@queries
                            status.value = "hh: «${v.title}» (откликов $done из $limit)"
                            val (employer, desc, archived) = a.hhOpen(v.id)
                            val url = "https://hh.ru/vacancy/${v.id}"
                            if (archived) { db.record(v.id, v.title, employer, url, "", "", "skipped", "hh_site", error = "archived"); continue }
                            if (Text.isCvHeavy(desc)) { db.record(v.id, v.title, employer, url, "", "", "skipped", "hh_site", error = "computer vision"); continue }
                            val lang = Text.detectLanguage("${v.title} $desc").also { resumeLang = it }
                            status.value = "hh: пишу письмо — «${v.title}»"
                            val letter = try { letterFor(ctx, llm, v.title, employer, desc, lang) } catch (e: BudgetException) { throw e } catch (e: Exception) {
                                RunLog.add(ctx, "  ! письмо не сгенерировано: ${e.message}"); continue
                            }
                            val outcome = a.hhApply(AgentGoal(v.title, employer, letter, lang), needConfirm(ctx, "hh"))
                            val st = statusOf(outcome)
                            db.record(v.id, v.title, employer, url, url, lang, st, "hh_site", letter)
                            RunLog.add(ctx, "• [hh] [$lang] ${v.title} — $employer → ${Db.STATUS_RU[st]}")
                            if (st == "applied") { done++; pause(ctx) }
                        }
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
            status.value = "$src: «${app.title}» (откликов $done из $limit)"
            resumeLang = app.language.ifBlank { "ru" }
            if (!a.open(app.formUrl)) { db.setStatus(app.vacancyId, "manual"); continue }
            val outcome = a.runGoal(AgentGoal(app.title, app.employer, app.letter, resumeLang), needConfirm(ctx, app.channel))
            val st = statusOf(outcome)
            db.setStatus(app.vacancyId, st)
            RunLog.add(ctx, "• [$src] ${app.title} → ${Db.STATUS_RU[st]}")
            if (st == "applied") { done++; pause(ctx) }
        }

        val summary = "Агент закончил: откликов $done."
        RunLog.add(ctx, summary)
        status.value = "$summary Подробности — в «Журнале»."
        return summary
    }
}
