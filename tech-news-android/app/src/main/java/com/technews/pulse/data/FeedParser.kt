package com.technews.pulse.data

import android.text.Html
import android.util.Xml
import org.json.JSONObject
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Парсер RSS 0.9x/1.0/2.0 и Atom на штатном XmlPullParser. */
object FeedParser {

    data class RawItem(val title: String, val link: String, val summary: String, val date: String?)

    fun parse(input: InputStream): List<RawItem> {
        val parser = Xml.newPullParser()
        runCatching { parser.setFeature("http://xmlpull.org/v1/doc/features.html#relaxed", true) }
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
        parser.setInput(input, null)

        val items = mutableListOf<RawItem>()
        var cur: MutableMap<String, String>? = null
        try {
            var ev = parser.eventType
            while (ev != XmlPullParser.END_DOCUMENT) {
                if (ev == XmlPullParser.START_TAG) {
                    val name = parser.name.lowercase()
                    val item = cur
                    if (name == "item" || name == "entry") {
                        cur = mutableMapOf()
                    } else if (item != null) {
                        when (name) {
                            "title" -> item.putIfAbsent("title", readText(parser))
                            "link" -> {
                                val href = parser.getAttributeValue(null, "href")
                                val rel = parser.getAttributeValue(null, "rel")
                                if (href != null) {
                                    if ((rel == null || rel == "alternate") && item["link"].isNullOrBlank()) item["link"] = href
                                } else {
                                    val t = readText(parser).trim()
                                    if (t.isNotEmpty()) item["link"] = t
                                }
                            }
                            "guid", "id" -> item.putIfAbsent("guid", readText(parser).trim())
                            "description", "summary" -> item.putIfAbsent("summary", readText(parser))
                            "content:encoded", "content" -> item["content"] = readText(parser)
                            "pubdate", "published", "dc:date", "issued" -> item["date"] = readText(parser).trim()
                            "updated" -> item.putIfAbsent("date", readText(parser).trim())
                        }
                    }
                } else if (ev == XmlPullParser.END_TAG) {
                    val name = parser.name.lowercase()
                    val item = cur
                    if ((name == "item" || name == "entry") && item != null) {
                        toRaw(item)?.let { items += it }
                        cur = null
                    }
                }
                ev = parser.next()
            }
        } catch (e: Exception) {
            // Битый XML в конце ленты не должен ломать уже прочитанное.
            if (items.isEmpty()) throw e
        }
        return items
    }

    private fun toRaw(m: Map<String, String>): RawItem? {
        val title = cleanHtml(m["title"].orEmpty())
        val guid = m["guid"].orEmpty()
        val link = m["link"]?.takeIf { it.isNotBlank() } ?: guid.takeIf { it.startsWith("http") } ?: return null
        if (title.isBlank()) return null
        val summary = m["summary"].orEmpty()
        val content = m["content"].orEmpty()
        val body = if (summary.length < 80 && content.length > summary.length) content else summary
        return RawItem(title, link.trim(), cleanSummary(body), m["date"])
    }

    /** Чтение текста элемента вместе с вложенными тегами (Atom xhtml и т.п.). */
    private fun readText(p: XmlPullParser): String {
        val sb = StringBuilder()
        var depth = 1
        while (depth > 0) {
            when (p.next()) {
                XmlPullParser.START_TAG -> depth++
                XmlPullParser.END_TAG -> depth--
                XmlPullParser.TEXT -> sb.append(p.text)
                XmlPullParser.END_DOCUMENT -> return sb.toString()
            }
        }
        return sb.toString()
    }

    fun cleanHtml(s: String): String {
        if (s.isBlank()) return ""
        val text = if (s.contains('<') || s.contains('&')) Html.fromHtml(s, Html.FROM_HTML_MODE_LEGACY).toString() else s
        return text.replace('￼', ' ').replace(Regex("\\s+"), " ").trim()
    }

    private val arxivPrefix = Regex("^arXiv:\\S+\\s+Announce Type:\\s*\\S+\\s*(Abstract:)?\\s*", RegexOption.IGNORE_CASE)
    private val redditTail = Regex("submitted by\\s+/u/.*$", RegexOption.IGNORE_CASE)

    fun cleanSummary(s: String): String {
        var t = cleanHtml(s)
        t = arxivPrefix.replace(t, "")
        t = redditTail.replace(t, "").trim()
        return if (t.length > 600) t.take(600).trimEnd() + "…" else t
    }

    // ------------------- Hacker News (Algolia API) -------------------

    data class HnItem(
        val title: String, val url: String, val summary: String, val created: Long,
        val points: Int, val comments: Int, val discussion: String,
    )

    fun parseHn(json: String): List<HnItem> {
        val hits = JSONObject(json).optJSONArray("hits") ?: return emptyList()
        val out = mutableListOf<HnItem>()
        for (i in 0 until hits.length()) {
            val h = hits.optJSONObject(i) ?: continue
            val title = str(h, "title").ifBlank { str(h, "story_title") }
            if (title.isBlank()) continue
            val id = str(h, "objectID")
            val discussion = "https://news.ycombinator.com/item?id=$id"
            out += HnItem(
                title = title,
                url = str(h, "url").ifBlank { discussion },
                summary = cleanSummary(str(h, "story_text")),
                created = h.optLong("created_at_i", 0L) * 1000L,
                points = h.optInt("points", 0),
                comments = h.optInt("num_comments", 0),
                discussion = discussion,
            )
        }
        return out
    }

    private fun str(o: JSONObject, key: String): String = if (o.isNull(key)) "" else o.optString(key, "")
}

object DateParser {
    private val patterns = listOf(
        "EEE, d MMM yyyy HH:mm:ss Z", "EEE, d MMM yyyy HH:mm:ss zzz",
        "EEE, d MMM yyyy HH:mm Z", "EEE, d MMM yyyy HH:mm zzz",
        "d MMM yyyy HH:mm:ss Z", "d MMM yyyy HH:mm:ss zzz",
        "yyyy-MM-dd HH:mm:ss Z", "yyyy-MM-dd HH:mm:ss",
    )

    fun parse(s: String?): Long? {
        if (s.isNullOrBlank()) return null
        val t = s.trim()
        runCatching { return OffsetDateTime.parse(t).toInstant().toEpochMilli() }
        runCatching { return Instant.parse(t).toEpochMilli() }
        runCatching { return ZonedDateTime.parse(t, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli() }
        runCatching { return LocalDateTime.parse(t).toInstant(ZoneOffset.UTC).toEpochMilli() }
        for (p in patterns) {
            runCatching { SimpleDateFormat(p, Locale.US).parse(t)?.let { return it.time } }
        }
        runCatching { return LocalDate.parse(t.take(10)).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }
        return null
    }
}
