package ru.hhautoapply

import android.content.Context
import android.net.Uri
import android.webkit.WebView
import kotlinx.coroutines.Dispatchers
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
                    return human("Капча: решите её в окне ниже и нажмите «Готово»")
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
- Поле загрузки резюме/CV (input type=file): действие click по нему — файл прикрепится автоматически.
- Вход/регистрация, капча, код из SMS/почты, оплата, паспорт, номер карты — action "human" с объяснением.
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
    suspend fun runGoal(g: AgentGoal, confirmSubmit: Boolean): Outcome {
        val history = mutableListOf<String>()
        var lastKey = ""
        var repeats = 0
        val resumeTitle = Prefs.get(ctx, if (g.language == "en") "en_title" else "ru_title")
        for (step in 1..maxSteps) {
            if (!passBlockers()) return Outcome.SKIPPED
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
    data class HhVacancy(val id: String, val title: String)

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
        val need = listOf("ru_resume_text", "en_resume_text", "ru_title", "en_title").any { Prefs.get(ctx, it).isBlank() }
        if (!need) return
        val list = try { JSONArray(call("window.__ag.hhResumes()")) } catch (_: Exception) { JSONArray() }
        if (list.length() == 0) { RunLog.add(ctx, "hh: резюме в профиле не найдены"); return }
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
        .appendQueryParameter("experience", "between3And6")
        .appendQueryParameter("experience", "moreThan6")
        .appendQueryParameter("area", Prefs.get(ctx, "area").trim())
        .appendQueryParameter("search_period", Prefs.get(ctx, "period").trim())
        .appendQueryParameter("order_by", "publication_time")
        .appendQueryParameter("items_on_page", "50")
        .appendQueryParameter("page", page.toString())
        .apply { if (Prefs.bool(ctx, "remote_only")) appendQueryParameter("schedule", "remote") }
        .build().toString()

    /** Одна страница поиска hh. null — не удалось пройти проверку (капча без ответа). */
    suspend fun hhSearchPage(query: String, page: Int): List<HhVacancy>? {
        status("hh: ищу «${query.take(40)}», стр. ${page + 1}")
        if (!open(hhSearchUrl(query, page))) return null
        val arr = try { JSONArray(call("window.__ag.hhLinks()")) } catch (_: Exception) { JSONArray() }
        return (0 until arr.length()).map { arr.getJSONObject(it) }.map { HhVacancy(it.getString("id"), it.getString("title")) }
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

    private suspend fun hhApplied(): Boolean {
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
}
