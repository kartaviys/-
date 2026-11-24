package ru.hhautoapply

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.sync.Mutex

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
    private val contactScan = Mutex()
    private val telegramPrefix = Regex("^(?:https?://)?(?:www\\.)?(?:t\\.me|telegram\\.me)/", RegexOption.IGNORE_CASE)
    private val linkedInPrefix = Regex("^(?:https?://)?(?:[\\w-]+\\.)?linkedin\\.com/in/", RegexOption.IGNORE_CASE)

    private fun handle(value: String, prefix: Regex) =
        value.trim().replaceFirst(prefix, "").removePrefix("@").substringBefore('?').substringBefore('#').trimEnd('/').lowercase()

    private fun phoneKey(value: String): String {
        val digits = value.filter(Char::isDigit)
        return if (digits.length == 11 && digits.startsWith('8')) "7" + digits.drop(1) else digits
    }

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

    data class Enriched(
        val withContacts: Int = 0, val checked: Int = 0, val unavailable: Int = 0,
        val needLogin: Boolean = false, val busy: Boolean = false,
    )

    /**
     * Контакты HR: открываем страницу каждой сохранённой вакансии на ods.ai (с вашим входом на ODS),
     * при необходимости жмём «Показать контакты», сохраняем email / Telegram / телефон / LinkedIn / ссылку на отклик.
     * Контакты пишутся в начало описания, основной контакт — в ссылку «Написать HR».
     */
    suspend fun enrichContacts(ctx: Context, limit: Int = 40, progress: (String) -> Unit = {}): Enriched {
        if (!contactScan.tryLock()) return Enriched(busy = true)
        try {
            return Db(ctx).use { db -> enrichContacts(ctx, db, limit, progress) }
        } finally {
            contactScan.unlock()
        }
    }

    private suspend fun enrichContacts(ctx: Context, db: Db, limit: Int, progress: (String) -> Unit): Enriched {
        val myEmail = Prefs.get(ctx, "email").trim()
        val myTg = handle(Prefs.get(ctx, "telegram"), telegramPrefix)
        val myPhone = phoneKey(Prefs.get(ctx, "phone"))
        val myLinkedIn = handle(Prefs.get(ctx, "linkedin"), linkedInPrefix)
        val todo = db.list(
            "status = 'saved' AND channel = 'ods' AND url LIKE 'https://ods.ai/jobs/%' " +
                "AND (error IS NULL OR error NOT LIKE 'контакты:%')",
            limit = limit,
        )
        var found = 0
        var checked = 0
        var unavailable = 0
        for ((i, a) in todo.withIndex()) {
            progress("ODS: контакты ${i + 1}/${todo.size} — ${a.title}")
            val c = AgentEngine.readContacts(ctx, a.url) ?: return Enriched(found, checked, unavailable, busy = true)
            when (c.optString("state")) {
                "login" -> return Enriched(found, checked, unavailable, needLogin = true)
                "ready" -> checked++
                else -> {
                    unavailable++
                    progress("ODS: не удалось прочитать контакты — ${a.title}")
                    continue
                }
            }
            fun arr(k: String) = c.optJSONArray(k)?.let { j -> (0 until j.length()).map { j.getString(it) } }.orEmpty()
            val emails = arr("emails").filterNot { it.equals(myEmail, ignoreCase = true) }.distinctBy { it.lowercase() }
            val tgs = arr("telegrams").filterNot { handle(it, telegramPrefix) == myTg }
            val phones = arr("phones").filterNot { phoneKey(it) == myPhone }.distinctBy(::phoneKey)
            val li = arr("linkedin").filterNot { handle(it, linkedInPrefix) == myLinkedIn }
            val apply = arr("apply")
            val lines = buildList {
                if (tgs.isNotEmpty()) add("Telegram: " + tgs.joinToString(", ") { "@" + handle(it, telegramPrefix) })
                if (emails.isNotEmpty()) add("Email: " + emails.joinToString(", "))
                if (phones.isNotEmpty()) add("Телефон: " + phones.joinToString(", "))
                if (li.isNotEmpty()) add("LinkedIn: " + li.joinToString(", "))
                if (apply.isNotEmpty()) add("Отклик: " + apply.joinToString(", "))
            }
            val primary = tgs.firstOrNull() ?: emails.firstOrNull()?.let { "mailto:$it" } ?: apply.firstOrNull()
                ?: li.firstOrNull() ?: phones.firstOrNull()?.let { Uri.fromParts("tel", it, null).toString() } ?: a.url
            val details = if (a.letter.startsWith("📇 Контакты HR:\n")) a.letter.substringAfter("\n\n") else a.letter
            val letter = if (lines.isEmpty()) details else "📇 Контакты HR:\n" + lines.joinToString("\n") + "\n\n" + details
            if (lines.isNotEmpty()) found++
            val note = if (lines.isEmpty()) "контакты: не найдены" else "контакты: найдены"
            db.updateDetails(a.vacancyId, letter, primary, note)
        }
        return Enriched(found, checked, unavailable)
    }
}
