package ru.hhautoapply

import android.content.Context
import android.net.Uri
import android.webkit.WebView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import kotlin.coroutines.resume
import kotlin.random.Random

/** Чем закончилась попытка откликнуться. */
enum class Outcome { DONE, HUMAN_DONE, SKIPPED, FAILED }

/** На что откликаемся. */
data class AgentGoal(val title: String, val employer: String, val letter: String, val language: String)

/**
 * Браузерный агент: управляет WebView как человек.
 * На каждом шаге берёт снимок страницы (кнопки и поля с id), спрашивает модель, что сделать, и делает.
 * Капчу, вход, SMS, оплату и паспортные данные не трогает — зовёт человека.
 */
class BrowserAgent(
    private val ctx: Context,
    private val web: WebView,
    private val llm: Llm,
    private val status: (String) -> Unit,
    /** Пауза «нужен человек»: true — пользователь сделал сам, false — пропустить. */
    private val human: suspend (String) -> Boolean,
    /** Подтверждение перед отправкой: true — отправлять. */
    private val confirm: suspend (String) -> Boolean,
) {
    private val loads = MutableStateFlow(0)
    private val agentJs by lazy { ctx.assets.open("agent.js").bufferedReader().readText() }
    private val maxSteps get() = Prefs.int(ctx, "agent_max_steps").coerceIn(5, 40)
    private val salary get() = Prefs.get(ctx, "salary_answer")
    private val facts get() = Prefs.get(ctx, "candidate_facts")
    private val submitRe = Regex("^\\s*(отправить|откликнуться|подтвердить|submit|apply|send|finish|отправить отклик)", RegexOption.IGNORE_CASE)

    /** Вызывать из WebViewClient.onPageFinished. */
    fun onPageFinished() { loads.value = loads.value + 1 }

    // ---------- низкий уровень ----------
    private suspend fun rawJs(code: String): String = withContext(Dispatchers.Main) {
        suspendCancellableCoroutine { cont -> web.evaluateJavascript(code) { cont.resume(it ?: "null") } }
    }

    /** Выполняет выражение с помощниками агента и возвращает строку. */
    suspend fun call(expr: String): String {
        rawJs(agentJs)
        val raw = rawJs(expr)
        return try { JSONTokener(raw).nextValue() as? String ?: raw } catch (_: Exception) { raw }
    }

    suspend fun load(url: String) {
        val before = loads.value
        withContext(Dispatchers.Main) { web.loadUrl(url) }
        withTimeoutOrNull(35_000) { loads.first { it > before } }
        delay(1800 + Random.nextLong(1200))
    }

    /**
     * Капча и антибот-проверки. Автопроверку (Cloudflare «Just a moment») просто ждём,
     * настоящую капчу решает человек. true — можно продолжать, false — пропустить.
     */
    suspend fun passBlockers(): Boolean {
        repeat(6) {
            when (call("window.__ag.blocker()")) {
                "auto" -> { status("Сайт проверяет браузер, жду…"); delay(4000) }
                "human" -> {
                    RunLog.add(ctx, "  капча — жду человека")
                    // Ждём либо кнопку, либо пока капча исчезнет сама (тогда продолжаем без нажатия «Готово»)
                    return coroutineScope {
                        val solved = async {
                            do { delay(3000) } while (call("window.__ag.blocker()") != "")
                            true
                        }
                        val manual = async { human("Капча: решите её в окне ниже — агент продолжит сам, как только она исчезнет") }
                        val r = select<Boolean> {
                            solved.onAwait { it }
                            manual.onAwait { it }
                        }
                        solved.cancel(); manual.cancel()
                        r
                    }
                }
                else -> return true
            }
        }
        return human("Сайт долго проверяет браузер. Если видите капчу — решите её и нажмите «Готово»")
    }

    /** Открыть страницу и пройти антибот-проверку. */
    suspend fun open(url: String): Boolean { load(url); return passBlockers() }

    suspend fun currentUrl(): String = withContext(Dispatchers.Main) { web.url.orEmpty() }

    private fun q(s: String) = JSONObject.quote(s)

    // ---------- универсальный агент ----------
    private fun systemPrompt(resumeTitle: String) = """
Ты — агент, который управляет браузером, чтобы откликнуться на вакансию от лица кандидата.
Каждый шаг тебе дают: цель, профиль кандидата, письмо, историю твоих действий и снимок страницы
(список интерактивных элементов с id, у некоторых есть data-qa в поле qa, и видимый текст).
Выбери ОДНО следующее действие и верни JSON:
{"action": "click"|"type"|"select"|"scroll"|"back"|"wait"|"done"|"human"|"fail", "id": "e12", "text": "...", "why": "кратко, по-русски"}
Правила:
- Цель — отправить отклик именно на эту вакансию: нажать «Откликнуться»/«Apply», выбрать резюме «$resumeTitle»
  (если предлагают выбор), вставить сопроводительное письмо, ответить на вопросы анкеты и отправить.
- Чтобы вставить письмо целиком, используй type с text "{{LETTER}}" — оно подставится само.
- Ответы на вопросы анкеты — только факты из резюме и профиля, коротко, от первого лица.
- Любой вопрос о зарплате или ожиданиях по доходу: строго "$salary".
- Всегда помни о кандидате (используй в ответах на вопросы анкеты): $facts
  Вопрос про военный билет / воинский учёт — ответ «да, военный билет есть». Вопрос про формат работы (офис, гибрид,
  удалёнка, график) — кандидат готов к любому формату; выбирай вариант, который предлагает работодатель, или «любой».
- Поле загрузки резюме/CV (input type=file): действие click по нему — файл прикрепится автоматически.
- Вход/регистрация, капча, код из SMS/почты, оплата, паспорт, номер карты — action "human" с объяснением.
- Видимость резюме у кандидата уже «Видно всем работодателям» — подсказки и предупреждения о видимости резюме
  игнорируй и не проси человека её менять: просто продолжай отклик («Откликнуться» / «Отправить»).
  Если hh пишет, что видимость нужно сменить, — значит выбрано не то резюме: выбери резюме «$resumeTitle» и продолжай.
- Не нажимай рекламу, другие вакансии, «В избранное», соцсети, «Скачать приложение».
- Видишь подтверждение («Отклик отправлен», «Резюме доставлено», «Вы откликнулись», «Application submitted»,
  «Thank you for applying») — "done".
- Вакансия в архиве/закрыта или откликнуться невозможно — "fail".
- Нужного элемента нет на экране — "scroll" с text "down" или "up".
- Не повторяй одно и то же действие больше двух раз подряд: если не помогает — "human".
""".trimIndent()

    private fun userPrompt(g: AgentGoal, snap: JSONObject, history: List<String>): String {
        val resume = Prefs.get(ctx, if (g.language == "en") "en_resume_text" else "ru_resume_text")
            .ifBlank { Prefs.get(ctx, "ru_resume_text") }
        return "ЦЕЛЬ: откликнуться на вакансию «${g.title}»${if (g.employer.isNotBlank()) " — ${g.employer}" else ""}\n\n" +
            "ПРОФИЛЬ КАНДИДАТА: ${Prefs.profileJson(ctx)}\n\n" +
            "СОПРОВОДИТЕЛЬНОЕ ПИСЬМО (начало): ${g.letter.take(600)}\n\n" +
            "РЕЗЮМЕ (кратко): ${resume.take(3000)}\n\n" +
            "ИСТОРИЯ ДЕЙСТВИЙ:\n${history.takeLast(8).joinToString("\n").ifBlank { "(пока ничего)" }}\n\n" +
            "СНИМОК СТРАНИЦЫ:\n$snap"
    }

    private fun element(snap: JSONObject, id: String): JSONObject? {
        val arr = snap.optJSONArray("elements") ?: JSONArray()
        return (0 until arr.length()).map { arr.getJSONObject(it) }.firstOrNull { it.optString("id") == id }
    }

    private fun describe(e: JSONObject?) = e?.let { (it.optString("text").ifBlank { it.optString("qa") }).take(50) }.orEmpty()

    /** Доводит отклик до конца на текущей странице. */
    /**
     * @param guard проверка перед каждым шагом (со 2-го): вернула результат — агент останавливается.
     *   Нужна, чтобы агент не бродил по сайту после отправки (например, Хабр открывает «Ваш отклик»).
     */
    suspend fun runGoal(g: AgentGoal, confirmSubmit: Boolean, guard: (suspend () -> Outcome?)? = null): Outcome {
        val history = mutableListOf<String>()
        var lastKey = ""
        var repeats = 0
        val resumeTitle = Prefs.get(ctx, if (g.language == "en") "en_title" else "ru_title")
        for (step in 1..maxSteps) {
            if (!passBlockers()) return Outcome.SKIPPED
            if (step > 1 && guard != null) guard()?.let { return it }
            call("window.__ag.fillSalary(${q(salary)})")
            val snap = try { JSONObject(call("window.__ag.snapshot()")) } catch (e: Exception) {
                delay(2000); continue
            }
            val d = try {
                withContext(Dispatchers.IO) { llm.completeJson(systemPrompt(resumeTitle), userPrompt(g, snap, history), 1500) }
            } catch (e: Exception) {
                status("Нейросеть не ответила: ${e.message}"); return Outcome.FAILED
            }
            val action = d.optString("action")
            val id = d.optString("id")
            val text = d.optString("text")
            val why = d.optString("why")
            val el = element(snap, id)
            status("Шаг $step: $action ${describe(el)} — $why")
            RunLog.add(ctx, "  агент: $action ${describe(el)} — $why")

            val key = "$action|$id|$text"
            repeats = if (key == lastKey) repeats + 1 else 0
            lastKey = key
            if (repeats >= 2) return if (human("Агент топчется на месте: $why")) Outcome.HUMAN_DONE else Outcome.SKIPPED

            val result = when (action) {
                "done" -> return Outcome.DONE
                "fail" -> { RunLog.add(ctx, "  агент: отклик невозможен — $why"); return Outcome.FAILED }
                "human" -> return if (human(why.ifBlank { "Нужна ваша помощь" })) Outcome.HUMAN_DONE else Outcome.SKIPPED
                "click" -> {
                    if (confirmSubmit && submitRe.containsMatchIn(el?.optString("text").orEmpty())) {
                        if (!confirm("Агент хочет нажать «${describe(el)}» и отправить отклик на «${g.title}». Отправить?")) {
                            return Outcome.SKIPPED
                        }
                    }
                    call("window.__ag.click(${q(id)})")
                }
                "type" -> {
                    val label = el?.optString("text").orEmpty() + " " + el?.optString("name").orEmpty()
                    val value = when {
                        Text.salary.containsMatchIn(label) -> salary
                        text.contains("{{LETTER}}") -> text.replace("{{LETTER}}", g.letter)
                        else -> text
                    }
                    if (Text.forbidden.containsMatchIn(label)) {
                        return if (human("Поле «${label.trim()}» агент не заполняет — введите сами")) Outcome.HUMAN_DONE else Outcome.SKIPPED
                    }
                    call("window.__ag.type(${q(id)}, ${q(value)})")
                }
                "select" -> call("window.__ag.select(${q(id)}, ${q(text)})")
                "scroll" -> call("window.__ag.scroll(${q(text)})")
                "back" -> withContext(Dispatchers.Main) { if (web.canGoBack()) web.goBack(); "ok" }
                "wait" -> { delay(2500); "ok" }
                else -> "unknown"
            }
            history += "$step. $action ${describe(el)}${if (action == "type") " = «${text.take(40)}»" else ""} → $result"
            delay(1200 + Random.nextLong(1500))
        }
        return if (human("Агент не справился за $maxSteps шагов")) Outcome.HUMAN_DONE else Outcome.SKIPPED
    }

    // ---------- hh.ru через сайт ----------
    data class HhVacancy(val id: String, val title: String, val applied: Boolean = false)

    /** Проверка входа на hh.ru; если не вошли — просим войти. */
    suspend fun ensureHhLogin(): Boolean {
        if (!open("https://hh.ru/applicant/resumes")) return false
        val url = currentUrl()
        if (url.contains("login") || url.contains("/account/")) {
            if (!human("Войдите в свой аккаунт hh.ru в этом окне, затем нажмите «Готово»")) return false
            if (!open("https://hh.ru/applicant/resumes")) return false
        }
        importHhResumes()
        return true
    }

    /**
     * Минимальная настройка: если тексты/названия резюме не заданы, берём их прямо из профиля hh.
     * Язык резюме определяется по его тексту: русское — для русских вакансий, английское — для английских.
     */
    private suspend fun importHhResumes() {
        val list = try { JSONArray(call("window.__ag.hhResumes()")) } catch (_: Exception) { JSONArray() }
        if (list.length() == 0) { RunLog.add(ctx, "hh: резюме в профиле не найдены"); return }
        // Хэши резюме — для «рекомендованных вакансий» hh
        Prefs.set(ctx, "hh_resume_hashes", (0 until list.length()).joinToString(",") { list.getJSONObject(it).getString("id") })
        val need = listOf("ru_resume_text", "en_resume_text", "ru_title", "en_title").any { Prefs.get(ctx, it).isBlank() }
        if (!need) return
        status("Импортирую резюме из профиля hh…")
        for (i in 0 until minOf(list.length(), 4)) {
            val r = list.getJSONObject(i)
            if (!open("https://hh.ru/resume/${r.getString("id")}")) continue
            val text = call("window.__ag.bodyText()")
            val lang = Text.detectLanguage(text)
            val title = r.getString("title")
            if (Prefs.get(ctx, "${lang}_title").isBlank()) Prefs.set(ctx, "${lang}_title", title)
            if (Prefs.get(ctx, "${lang}_resume_text").isBlank()) Prefs.set(ctx, "${lang}_resume_text", text)
            RunLog.add(ctx, "hh: резюме «$title» ($lang) импортировано")
        }
    }

    fun hhSearchUrl(query: String, page: Int): String = Uri.parse("https://hh.ru/search/vacancy").buildUpon()
        .appendQueryParameter("text", query)
        .appendQueryParameter("search_field", "name")
        .apply {
            if (Prefs.bool(ctx, "experience_filter")) {
                appendQueryParameter("experience", "between3And6"); appendQueryParameter("experience", "moreThan6")
            }
            Prefs.get(ctx, "area").trim().takeIf { it.isNotEmpty() }?.let { appendQueryParameter("area", it) }
        }
        .apply { Prefs.get(ctx, "period").trim().takeIf { it.isNotEmpty() && it != "0" }?.let { appendQueryParameter("search_period", it) } }
        .appendQueryParameter("order_by", "publication_time")
        .appendQueryParameter("items_on_page", "50")
        .appendQueryParameter("page", page.toString())
        .apply { if (Prefs.bool(ctx, "remote_only")) appendQueryParameter("schedule", "remote") }
        .build().toString()

    /** Подходящие вакансии, которые hh сам рекомендует под резюме («Вакансии для вас»). */
    suspend fun hhRecommendedPage(resumeHash: String, page: Int): List<HhVacancy>? {
        status("hh: рекомендованные вакансии, стр. ${page + 1}")
        val url = "https://hh.ru/search/vacancy?resume=$resumeHash&order_by=publication_time&items_on_page=50&page=$page"
        if (!open(url)) return null
        val arr = try { JSONArray(call("window.__ag.hhLinks()")) } catch (_: Exception) { JSONArray() }
        return (0 until arr.length()).map { arr.getJSONObject(it) }.map { HhVacancy(it.getString("id"), it.getString("title"), it.optBoolean("applied")) }
    }

    /** Одна страница поиска hh. null — не удалось пройти проверку (капча без ответа). */
    suspend fun hhSearchPage(query: String, page: Int): List<HhVacancy>? {
        status("hh: ищу «${query.take(40)}», стр. ${page + 1}")
        if (!open(hhSearchUrl(query, page))) return null
        val arr = try { JSONArray(call("window.__ag.hhLinks()")) } catch (_: Exception) { JSONArray() }
        return (0 until arr.length()).map { arr.getJSONObject(it) }.map { HhVacancy(it.getString("id"), it.getString("title"), it.optBoolean("applied")) }
    }

    suspend fun hhCollect(queries: List<String>, pages: Int = 2): List<HhVacancy> {
        val out = LinkedHashMap<String, HhVacancy>()
        for (query in queries) {
            for (page in 0 until pages) {
                status("hh: ищу «${query.take(40)}…», стр. ${page + 1}")
                if (!open(hhSearchUrl(query, page))) return out.values.toList()
                val arr = try { JSONArray(call("window.__ag.hhLinks()")) } catch (_: Exception) { JSONArray() }
                if (arr.length() == 0) break
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    out.putIfAbsent(o.getString("id"), HhVacancy(o.getString("id"), o.getString("title")))
                }
                delay(1500 + Random.nextLong(2000))
            }
        }
        return out.values.toList()
    }

    /** Открывает вакансию и возвращает (работодатель, описание, в архиве?). */
    suspend fun hhOpen(id: String): Triple<String, String, Boolean> {
        if (!open("https://hh.ru/vacancy/$id")) return Triple("", "", true)
        val employer = call("window.__ag.textOf('[data-qa=\"vacancy-company-name\"]')")
        val desc = call("window.__ag.textOf('[data-qa=\"vacancy-description\"]')").ifBlank { call("window.__ag.bodyText()") }
        val body = call("window.__ag.bodyText()")
        val archived = body.contains("Вакансия в архиве", true) || body.contains("vacancy is archived", true)
        return Triple(employer, desc, archived)
    }

    private suspend fun has(sel: String) = call("window.__ag.has(${q(sel)})") == "true"

    /** На открытой странице вакансии hh уже есть отклик. */
    suspend fun hhApplied(): Boolean {
        if (has("[data-qa=\"vacancy-response-link-view-topic\"]")) return true
        val body = call("window.__ag.bodyText()")
        return listOf("Резюме доставлено", "Отклик отправлен", "Вы откликнулись").any { body.contains(it, true) }
    }

    /**
     * Отклик на открытой странице вакансии hh. Сначала быстрый сценарий по data-qa,
     * если что-то не нашлось или появился тест — доделывает универсальный агент.
     */
    suspend fun hhApply(g: AgentGoal, confirmSubmit: Boolean): Outcome {
        if (hhApplied()) return Outcome.DONE
        val clicked = call("window.__ag.clickSel('[data-qa=\"vacancy-response-link-top\"], [data-qa=\"vacancy-response-link-bottom\"]')")
        if (clicked != "ok") return runGoal(g, confirmSubmit)
        delay(2500)
        if (!passBlockers()) return Outcome.SKIPPED
        if (has("[data-qa=\"relocation-warning-confirm\"]")) {
            call("window.__ag.clickSel('[data-qa=\"relocation-warning-confirm\"]')"); delay(2000)
        }
        // Тест от работодателя или отдельная страница отклика — это работа агента
        if (currentUrl().contains("vacancy_response")) return runGoal(g, confirmSubmit)

        val resumeTitle = Prefs.get(ctx, if (g.language == "en") "en_title" else "ru_title")
        call("window.__ag.pickResume(${q(resumeTitle)})")
        if (has("[data-qa=\"vacancy-response-letter-toggle\"]")) {
            call("window.__ag.clickSel('[data-qa=\"vacancy-response-letter-toggle\"]')"); delay(800)
        }
        val letterOk = call("window.__ag.fillSel('[data-qa=\"vacancy-response-popup-form-letter-input\"]', ${q(g.letter)})") == "ok"
        if (!letterOk) return runGoal(g, confirmSubmit)
        call("window.__ag.fillSalary(${q(salary)})")
        if (confirmSubmit && !confirm("Отправить отклик на «${g.title}»?")) return Outcome.SKIPPED
        if (call("window.__ag.clickSel('[data-qa=\"vacancy-response-submit-popup\"]')") != "ok") return runGoal(g, confirmSubmit)
        delay(3000)
        if (!passBlockers()) return Outcome.SKIPPED
        // Иногда после отклика hh просит письмо отдельной формой
        if (call("window.__ag.fillSel('[data-qa=\"vacancy-response-letter-input\"]', ${q(g.letter)})") == "ok") {
            call("window.__ag.clickSel('[data-qa=\"vacancy-response-letter-submit\"]')"); delay(2000)
        }
        if (currentUrl().contains("vacancy_response")) return runGoal(g, confirmSubmit)
        return if (hhApplied()) Outcome.DONE else runGoal(g, confirmSubmit)
    }

    // ---------- LinkedIn ----------
    private val desktopUa = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

    /** LinkedIn в мобильном браузере гонит в приложение — открываем десктопную версию. */
    suspend fun desktopMode(on: Boolean) = withContext(Dispatchers.Main) {
        web.settings.userAgentString = if (on) desktopUa else Text.chromeUa(ctx)
        web.settings.useWideViewPort = on
        web.settings.loadWithOverviewMode = on
    }

    suspend fun liEnsureLogin(): Boolean {
        if (!open("https://www.linkedin.com/feed/")) return false
        val url = currentUrl()
        if (url.contains("/login") || url.contains("authwall") || url.contains("/signup") || url.contains("uas/")) {
            if (!human("Войдите в LinkedIn в этом окне (email и пароль), затем нажмите «Готово»")) return false
            if (!open("https://www.linkedin.com/feed/")) return false
        }
        return true
    }

    fun liSearchUrl(query: String, page: Int): String = Uri.parse("https://www.linkedin.com/jobs/search/").buildUpon()
        .appendQueryParameter("keywords", query)
        .appendQueryParameter("f_AL", "true")            // только Easy Apply
        .appendQueryParameter("sortBy", "DD")            // сначала свежие
        .appendQueryParameter("f_TPR", "r${Prefs.int(ctx, "linkedin_days").coerceIn(1, 30) * 86400}")
        .apply {
            Prefs.get(ctx, "linkedin_location").trim().takeIf { it.isNotEmpty() }?.let { appendQueryParameter("location", it) }
            if (Prefs.bool(ctx, "linkedin_remote")) appendQueryParameter("f_WT", "2")
            if (Prefs.bool(ctx, "linkedin_senior_only")) appendQueryParameter("f_E", "4")
            if (page > 0) appendQueryParameter("start", (page * 25).toString())
        }
        .build().toString()

    suspend fun liSearchPage(query: String, page: Int): List<HhVacancy>? {
        status("LinkedIn: ищу «${query.take(40)}», стр. ${page + 1}")
        if (!open(liSearchUrl(query, page))) return null
        // Список подгружается по мере прокрутки — немного прокручиваем
        repeat(3) { call("window.__ag.scroll('down')"); delay(900) }
        val arr = try { JSONArray(call("window.__ag.liLinks()")) } catch (_: Exception) { JSONArray() }
        return (0 until arr.length()).map { arr.getJSONObject(it) }.map { HhVacancy(it.getString("id"), it.getString("title"), it.optBoolean("applied")) }
    }

    /** Вакансии, которые LinkedIn рекомендует вам («Recommended for you»). */
    suspend fun liRecommendedPage(page: Int): List<HhVacancy>? {
        status("LinkedIn: рекомендованные вакансии, стр. ${page + 1}")
        val url = "https://www.linkedin.com/jobs/collections/recommended/" + if (page > 0) "?start=${page * 24}" else ""
        if (!open(url)) return null
        repeat(3) { call("window.__ag.scroll('down')"); delay(900) }
        val arr = try { JSONArray(call("window.__ag.liLinks()")) } catch (_: Exception) { JSONArray() }
        return (0 until arr.length()).map { arr.getJSONObject(it) }.map { HhVacancy(it.getString("id"), it.getString("title"), it.optBoolean("applied")) }
    }

    /** Открывает вакансию: (компания, описание, уже откликались?). */
    suspend fun liOpen(id: String): Triple<String, String, Boolean> {
        if (!open("https://www.linkedin.com/jobs/view/$id/")) return Triple("", "", true)
        val company = call("window.__ag.textOf('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .topcard__org-name-link')")
        val desc = call("window.__ag.textOf('#job-details, .jobs-description__content, .description__text')").ifBlank { call("window.__ag.bodyText()") }
        return Triple(company, desc, call("window.__ag.liApplied()") == "true")
    }

    /** Easy Apply: нажимаем кнопку, дальше шаги формы проходит универсальный агент. */
    suspend fun liApply(g: AgentGoal, confirmSubmit: Boolean, requireEasyApply: Boolean = false): Outcome {
        if (call("window.__ag.liEasyApply()") == "ok") delay(2500)
        else if (requireEasyApply) return Outcome.FAILED // нет Easy Apply (отклик на сайте компании) — пропускаем
        return runGoal(g, confirmSubmit)
    }

    // ---------- Хабр Карьера ----------
    suspend fun habrEnsureLogin(): Boolean {
        if (!open("https://career.habr.com/")) return false
        if (call("window.__ag.habrLoggedIn()") == "true") return true
        if (!human("Войдите в Хабр Карьеру в этом окне (кнопка «Войти»), затем нажмите «Готово»")) return false
        return open("https://career.habr.com/")
    }

    /** Открывает вакансию Хабра: (компания, описание). */
    suspend fun habrOpen(id: String): Pair<String, String> {
        if (!open("https://career.habr.com/vacancies/$id")) return "" to ""
        val company = call("window.__ag.textOf('.company_name, .vacancy-company__title, .company-about__title')")
        val desc = call("window.__ag.textOf('.vacancy-description__text')").ifBlank { call("window.__ag.bodyText()") }
        return company to desc
    }

    suspend fun habrApplied(): Boolean = call("window.__ag.habrApplied()") == "true"

    /** Отклик на Хабре: «Откликнуться» → письмо/вопросы и отправку проходит универсальный агент. */
    suspend fun habrApply(g: AgentGoal, confirmSubmit: Boolean): Pair<Outcome, String> {
        val vacancyUrl = currentUrl().substringBefore("?").substringBefore("#")
        // Агент работает только на странице этой вакансии: отклик появился — готово; ушёл в отклики/чат — тоже значит отправлено;
        // ушёл куда-то ещё — останавливаемся, а не бродим по старым откликам.
        val guard: suspend () -> Outcome? = {
            val url = currentUrl()
            when {
                habrApplied() -> Outcome.DONE
                Regex("/responses|/conversations|/chats").containsMatchIn(url) -> Outcome.DONE
                !url.startsWith(vacancyUrl) -> { RunLog.add(ctx, "  агент ушёл со страницы вакансии ($url) — стоп"); Outcome.SKIPPED }
                else -> null
            }
        }
        return when (call("window.__ag.habrRespond()")) {
            "applied" -> Outcome.DONE to "уже откликались"
            "external" -> Outcome.FAILED to "отклик только на сайте компании"
            "missing" -> Outcome.FAILED to "нет кнопки «Откликнуться»" // не отдаём нейросети — иначе она уходит смотреть старые отклики
            else -> { delay(2000); runGoal(g, confirmSubmit, guard) to "" }
        }
    }

    // ---------- Общий агент сайтов ----------
    data class SiteLink(val id: String, val url: String, val title: String, val applied: Boolean)

    private fun idOf(url: String) = Integer.toHexString(url.substringBefore("?").substringBefore("#").trimEnd('/').hashCode())

    /** Страница выдачи сайта → ссылки на вакансии. Шаблон не сработал — ссылки выбирает нейросеть. null — не открылась. */
    suspend fun siteSearch(def: SiteDef, query: String, page: Int, llm: Llm): List<SiteLink>? {
        status("${def.name}: ${if (query.isBlank()) "лента вакансий" else "ищу «${query.take(40)}»"}, стр. ${page + 1}")
        if (!open(def.search(query, page))) return null
        repeat(4) { call("window.__ag.scroll('down')"); delay(1000) }
        val arr = try { JSONArray(call("window.__ag.siteLinks(${q(def.link.pattern)})")) } catch (_: Exception) { JSONArray() }
        val found = (0 until arr.length()).map { arr.getJSONObject(it) }.map {
            val url = it.optString("url")
            SiteLink(it.optString("id").ifBlank { idOf(url) }, url, it.optString("title"), it.optBoolean("applied"))
        }
        if (found.isNotEmpty()) return found
        return pickLinksWithLlm(llm, def)
    }

    private suspend fun pickLinksWithLlm(llm: Llm, def: SiteDef): List<SiteLink> {
        val all = try { JSONArray(call("window.__ag.allLinks()")) } catch (_: Exception) { JSONArray() }
        if (all.length() == 0) return emptyList()
        val items = (0 until all.length()).map { all.getJSONObject(it) }
        val listing = items.mapIndexed { i, o -> "$i. ${o.optString("title")} — ${o.optString("url").take(140)}" }.joinToString("\n")
        val sys = "Перед тобой ссылки со страницы поиска вакансий сайта ${def.name}. Выбери только ссылки, которые ведут на " +
            "страницу ОДНОЙ конкретной вакансии (не категории, не компании, не страницы поиска/пагинации, не статьи и не вход). " +
            "Ответ — JSON: {\"links\": [номера]}"
        return try {
            val o = withContext(Dispatchers.IO) { llm.completeJson(sys, listing, 600) }
            val idx = o.optJSONArray("links") ?: JSONArray()
            (0 until idx.length()).mapNotNull { items.getOrNull(idx.optInt(it, -1)) }.map {
                val url = it.optString("url")
                SiteLink(idOf(url), url, it.optString("title"), false)
            }.also { RunLog.add(ctx, "${def.name}: шаблон ссылок не сработал — нейросеть нашла вакансий: ${it.size}") }
        } catch (e: StopSessionException) { throw e } catch (_: Exception) { emptyList() }
    }

    suspend fun pageApplied(): Boolean = call("window.__ag.pageApplied()") == "true"
    suspend fun pageTitle(): String = withContext(Dispatchers.Main) { web.title.orEmpty() }
}
