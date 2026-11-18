package ru.hhautoapply

import android.content.Context

/**
 * ODS: просто сохраняем вакансии (без откликов) из канала «ODS #jobs» (t.me/s/odsjobs).
 * Каждый пост — вакансия со ссылкой на ods.ai/jobs/… Сохраняются подходящие по вашим словам (фильтр названия),
 * junior и компьютерное зрение отсекаются. Хранятся в журнале со статусом «saved».
 */
object Ods {
    private val postRe = Regex("data-post=\"(odsjobs/(\\d+))\"")
    private val textRe = Regex("class=\"tgme_widget_message_text[^\"]*\"[^>]*>(.*?)</div>", RegexOption.DOT_MATCHES_ALL)
    private val linkRe = Regex("href=\"(https://ods\\.ai/jobs/[^\"]+)\"")
    private val dateRe = Regex("<time datetime=\"([^\"]+)\"")

    data class Saved(val added: Int, val seen: Int)

    /** Обновить: читает свежие посты, при первом запуске — до `pages` страниц истории (по ~20 постов). */
    fun refresh(ctx: Context, pages: Int = 10, log: (String) -> Unit = {}): Saved {
        val net = Net()
        val db = Db(ctx)
        val include = Prefs.list(ctx, "title_include")
        val exclude = Prefs.list(ctx, "title_exclude")
        var before: String? = null
        var added = 0
        var seen = 0
        pages@ for (p in 0 until pages) {
            val html = net.get("https://t.me/s/odsjobs" + (before?.let { "?before=$it" } ?: ""), "text/html")
            val starts = postRe.findAll(html).toList()
            if (starts.isEmpty()) break
            var oldInPage = 0
            for ((i, m) in starts.withIndex()) {
                val chunk = html.substring(m.range.first, if (i + 1 < starts.size) starts[i + 1].range.first else html.length)
                val textHtml = textRe.find(chunk)?.groupValues?.get(1) ?: continue
                val text = Text.stripHtmlKeepLines(textHtml)
                val title = text.lines().map { it.trim() }.firstOrNull { it.isNotEmpty() }.orEmpty().take(140)
                val url = linkRe.find(textHtml)?.groupValues?.get(1) ?: "https://t.me/${m.groupValues[1]}"
                val id = "ods:${m.groupValues[2]}"
                seen++
                if (db.status(id) != null) { oldInPage++; continue }
                val ok = Text.titleOk(title, include, exclude) && !Text.isCvHeavy(text) &&
                    !Regex("\\b(junior|intern|стажер|стажёр)", RegexOption.IGNORE_CASE).containsMatchIn(title)
                if (!ok) { db.record(id, title, "", url, url, "", "hidden", "ods"); continue } // не подходит — помним, чтобы не смотреть снова
                val date = dateRe.find(chunk)?.groupValues?.get(1)?.take(10).orEmpty()
                // Компания/зарплата/формат — вторая-третья строки поста; описание — остальное
                val details = text.lines().drop(1).map { it.trim() }.filter { it.isNotEmpty() }
                    .filterNot { it.startsWith("⚠") || it.contains("мошенники", true) }
                    .joinToString("\n")
                db.record(id, title, details.lines().firstOrNull().orEmpty().take(80), url, url, Text.detectLanguage(text),
                    "saved", "ods", details, if (date.isNotBlank()) "опубликовано $date" else "")
                added++
            }
            // Вся страница уже была сохранена ранее — дальше в историю не идём
            if (oldInPage == starts.size) break@pages
            before = starts.first().groupValues[2]
        }
        log("ODS: просмотрено $seen постов, сохранено новых вакансий: $added")
        return Saved(added, seen)
    }

    data class Enriched(val withContacts: Int, val checked: Int, val needLogin: Boolean, val busy: Boolean)

    /**
     * Контакты HR: открываем страницу каждой сохранённой вакансии на ods.ai (с вашим входом на ODS),
     * при необходимости жмём «Показать контакты», сохраняем email / Telegram / телефон / LinkedIn / ссылку на отклик.
     * Контакты пишутся в начало описания, основной контакт — в ссылку «Написать HR».
     */
    suspend fun enrichContacts(ctx: Context, limit: Int = 40, progress: (String) -> Unit = {}): Enriched {
        val db = Db(ctx)
        val myEmail = Prefs.get(ctx, "email").trim().lowercase()
        val myTg = Prefs.get(ctx, "telegram").trim().removePrefix("@").lowercase()
        val todo = db.list("status = 'saved' AND url LIKE 'https://ods.ai/jobs/%'")
            .filter { !db.errorOf(it.vacancyId).startsWith("контакты:") }
            .take(limit)
        var found = 0
        var checked = 0
        for (a in todo) {
            progress("ODS: контакты ${checked + 1}/${todo.size} — ${a.title}")
            val c = AgentEngine.readContacts(ctx, a.url) ?: return Enriched(found, checked, false, true)
            checked++
            if (c.optBoolean("loginRequired")) return Enriched(found, checked, true, false)
            fun arr(k: String) = c.optJSONArray(k)?.let { j -> (0 until j.length()).map { j.getString(it) } }.orEmpty()
            val emails = arr("emails").filter { it.lowercase() != myEmail }
            val tgs = arr("telegrams").filter { !it.lowercase().endsWith("/$myTg") || myTg.isBlank() }
            val phones = arr("phones"); val li = arr("linkedin"); val apply = arr("apply")
            val lines = buildList {
                if (tgs.isNotEmpty()) add("Telegram: " + tgs.joinToString(", ") { it.replace("https://t.me/", "@") })
                if (emails.isNotEmpty()) add("Email: " + emails.joinToString(", "))
                if (phones.isNotEmpty()) add("Телефон: " + phones.joinToString(", "))
                if (li.isNotEmpty()) add("LinkedIn: " + li.joinToString(", "))
                if (apply.isNotEmpty()) add("Отклик: " + apply.joinToString(", "))
            }
            val primary = tgs.firstOrNull() ?: emails.firstOrNull()?.let { "mailto:$it" } ?: apply.firstOrNull() ?: a.url
            val details = a.letter.substringAfter("📇 Контакты HR:", a.letter).let { if (it === a.letter) it else it.substringAfter("\n\n", "") }
            if (lines.isNotEmpty()) {
                found++
                db.updateDetails(a.vacancyId, "📇 Контакты HR:\n" + lines.joinToString("\n") + "\n\n" + details, primary, "контакты: найдены")
            } else {
                db.updateDetails(a.vacancyId, details, a.url, "контакты: не найдены")
            }
        }
        return Enriched(found, checked, false, false)
    }
}
