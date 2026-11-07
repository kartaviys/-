package ru.hhautoapply

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Лог запуска в файле: его читает экран, пишет фоновая задача. */
object RunLog {
    private fun file(ctx: Context) = File(ctx.filesDir, "run.log")
    fun clear(ctx: Context) = file(ctx).writeText("")
    fun read(ctx: Context): String = file(ctx).takeIf { it.exists() }?.readText().orEmpty()
    fun add(ctx: Context, line: String) {
        val ts = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        file(ctx).appendText("[$ts] $line\n")
    }
}

/** Основной цикл: поиск → фильтр → письмо → отклик (или очередь на анкету в браузере). */
class Runner(private val ctx: Context, private val dryRun: Boolean, private val isStopped: () -> Boolean) {
    private val db = Db(ctx)
    private val hh = HhApi(ctx)
    private fun log(s: String) = RunLog.add(ctx, s)

    fun run(): String {
        val llm = Llm(ctx, ::log)
        val limit = Prefs.int(ctx, "max_applications")
        val dailyCap = Prefs.int(ctx, "daily_limit")
        val include = Prefs.list(ctx, "title_include")
        val exclude = Prefs.list(ctx, "title_exclude")
        val ruText = Prefs.get(ctx, "ru_resume_text")
        val enText = Prefs.get(ctx, "en_resume_text").ifBlank { ruText }
        if (ruText.isBlank() && enText.isBlank()) log("⚠ Текст резюме пуст — письма будут слабыми. Загрузите PDF.")
        val ruId = Prefs.get(ctx, "ru_resume_id").trim()
        val enId = Prefs.get(ctx, "en_resume_id").trim().ifBlank { ruId }
        val hhEnabled = Sources.byKey("hh")?.let { Sources.isOn(ctx, it) } ?: true
        if (!dryRun && hhEnabled && ruId.isBlank()) throw IllegalStateException("Не выбрано резюме hh (кнопка «Мои резюме»)")

        // 1. Поиск на hh
        val found = LinkedHashMap<String, Pair<String, String>>() // id -> (name, url)
        val hhOn = hhEnabled
        if (!hhOn) log("hh.ru выключен в «Источниках».")
        for (q in if (hhOn) Prefs.list(ctx, "queries", Regex("\n")) else emptyList()) {
            for (page in 0 until 3) {
                val res = hh.search(q, page)
                val items = res.optJSONArray("items") ?: break
                for (i in 0 until items.length()) {
                    val item = items.getJSONObject(i)
                    val id = item.getString("id")
                    val name = item.optString("name")
                    if (id in found || item.optBoolean("archived")) continue
                    if (!Text.titleOk(name, include, exclude) || db.seen(id)) continue
                    found[id] = name to item.optString("alternate_url")
                }
                if (page + 1 >= res.optInt("pages")) break
                Thread.sleep(300)
            }
        }
        log("Найдено новых подходящих вакансий: ${found.size} (пробный режим: ${if (dryRun) "да" else "нет"})")

        // 2. Отклики
        var done = 0
        var queued = 0
        for ((id, _) in found) {
            if (isStopped()) { log("Остановлено."); break }
            if (done >= limit) break
            if (!dryRun && db.appliedToday() >= dailyCap) { log("Достигнут дневной лимит откликов."); break }

            val v = try { hh.vacancy(id) } catch (e: Exception) { log("- $id: не загрузилась (${e.message})"); continue }
            val title = v.optString("name")
            val employer = v.optJSONObject("employer")?.optString("name").orEmpty()
            val url = v.optString("alternate_url")
            if (Text.isCvHeavy(v.optString("description"))) {
                log("- пропуск (компьютерное зрение): $title")
                db.record(id, title, employer, url, "", "", "skipped", "filter", error = "computer vision")
                continue
            }
            val relations = v.optJSONArray("relations")?.toString().orEmpty()
            if (relations.contains("got_response")) {
                db.record(id, title, employer, url, "", "", "applied", "earlier"); continue
            }
            val lang = Text.detectLanguage(title + " " + v.optString("description"))
            val responseUrl = v.optString("response_url").takeIf { it.isNotBlank() && it != "null" }
            var channel = when {
                responseUrl != null -> "external"
                v.optBoolean("has_test") -> "hh_test"
                else -> "api"
            }
            log("• [$lang] [$channel] $title — $employer")

            val letter = try {
                Letters.write(llm, v, lang, if (lang == "en") enText else ruText,
                    Prefs.get(ctx, if (lang == "en") "name_en" else "name"), Prefs.get(ctx, "en_cv_url"))
            } catch (e: Exception) {
                log("  ! письмо не сгенерировано: ${e.message}")
                db.record(id, title, employer, url, "", lang, "failed", channel, error = e.message.orEmpty())
                continue
            }

            if (dryRun) {
                log("  --- письмо ---\n$letter\n  -------------")
                db.record(id, title, employer, url, "", lang, "dry_run", channel, letter)
                done++
                continue
            }

            var status = "failed"
            var error = ""
            if (channel == "api") {
                try {
                    hh.apply(id, if (lang == "en") enId else ruId, letter)
                    status = "applied"
                } catch (e: HhException) {
                    error = e.message.orEmpty()
                    when {
                        "test_required" in e.reasons -> channel = "hh_test"
                        "already_applied" in e.reasons -> status = "applied"
                        "limit_exceeded" in e.reasons -> {
                            log("  ! hh.ru: дневной лимит исчерпан")
                            db.record(id, title, employer, url, "", lang, "failed", channel, letter, error)
                            break
                        }
                        else -> log("  ! $error")
                    }
                }
            }
            var formUrl = ""
            if (status != "applied" && channel != "api") {
                formUrl = responseUrl ?: "https://hh.ru/applicant/vacancy_response?vacancyId=$id"
                status = "needs_browser"
                queued++
            }
            log("  → $status")
            db.record(id, title, employer, url, formUrl, lang, status, channel, letter, error)
            if (status == "applied") {
                done++
                val lo = Prefs.int(ctx, "delay_min")
                val hi = maxOf(lo, Prefs.int(ctx, "delay_max"))
                Thread.sleep(((lo..hi).random()) * 1000L)
            }
        }
        // 3. Остальные источники: собираем вакансии, пишем письма, ставим в очередь «Анкеты»
        if (!isStopped()) queued += collectOthers(llm, include, exclude, ruText, enText)

        val summary = "Готово: откликов через hh $done, в очереди «Анкеты» $queued.\n${llm.report()}"
        log(summary)
        return summary
    }

    /** Сбор вакансий с включённых AUTO-источников. Возвращает, сколько поставлено в очередь. */
    private fun collectOthers(llm: Llm, include: List<String>, exclude: List<String>, ruText: String, enText: String): Int {
        val cap = Prefs.int(ctx, "max_other")
        val net = Net()
        var added = 0
        for (src in Sources.all.filter { it.kind == Kind.AUTO && Sources.isOn(ctx, it) }) {
            if (isStopped() || added >= cap) break
            val posts = try {
                src.fetch!!(ctx, net)
            } catch (e: Exception) {
                log("${src.name}: ошибка загрузки — ${e.message}"); continue
            }
            val fresh = posts.distinctBy { it.id }.filter { p ->
                p.id.isNotBlank() && !p.junior &&
                    Text.titleOk(p.filterText, include, emptyList()) && Text.titleOk(p.title, emptyList(), exclude) &&
                    !db.seen("${src.key}:${p.id}") && !(dryRun && db.status("${src.key}:${p.id}") == "dry_run")
            }
            log("${src.name}: найдено ${posts.size}, подходит ${fresh.size}")
            for (p in fresh) {
                if (isStopped() || added >= cap) break
                val dbId = "${src.key}:${p.id}"
                try {
                    if (p.description.isBlank() && src.details != null) p.description = src.details.invoke(net, p)
                    if (Text.isCvHeavy(p.description)) {
                        db.record(dbId, p.title, p.company, p.url, "", "", "skipped", src.key, error = "computer vision"); continue
                    }
                    val lang = Text.detectLanguage(p.title + " " + p.description)
                    val v = JSONObject()
                        .put("name", p.title)
                        .put("employer", JSONObject().put("name", p.company))
                        .put("description", p.description.take(8000))
                    val letter = Letters.write(llm, v, lang, if (lang == "en") enText else ruText,
                        Prefs.get(ctx, if (lang == "en") "name_en" else "name"), Prefs.get(ctx, "en_cv_url"))
                    val status = if (dryRun) "dry_run" else "needs_browser"
                    db.record(dbId, p.title, p.company, p.url, p.url, lang, status, src.key, letter)
                    log("• [${src.name}] [$lang] ${p.title} — ${p.company} → ${if (dryRun) "письмо готово" else "в «Анкеты»"}")
                    if (dryRun) log("  --- письмо ---\n$letter\n  -------------")
                    added++
                } catch (e: Exception) {
                    log("  ! ${p.title}: ${e.message}")
                    db.record(dbId, p.title, p.company, p.url, p.url, "", "failed", src.key, error = e.message.orEmpty())
                }
            }
        }
        return added
    }
}
