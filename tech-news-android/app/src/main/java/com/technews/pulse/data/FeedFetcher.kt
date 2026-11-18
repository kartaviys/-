package com.technews.pulse.data

import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

class FeedFetcher {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    fun fetch(source: Source, now: Long): List<Article> {
        val req = Request.Builder()
            .url(source.url)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5")
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("HTTP ${resp.code}")
            val body = resp.body ?: throw IOException("пустой ответ")
            return when (source.type) {
                SourceType.HN_ALGOLIA -> FeedParser.parseHn(body.string()).take(source.maxItems).map { h ->
                    Article(
                        id = Ids.forUrl(h.url),
                        title = h.title,
                        url = h.url,
                        summary = h.summary,
                        sourceId = source.id,
                        sourceName = source.name,
                        category = source.category,
                        published = clamp(h.created.takeIf { it > 0 } ?: now, now),
                        fetchedAt = now,
                        sourceTrust = source.trust,
                        extra = "▲ ${h.points} · 💬 ${h.comments}",
                        discussionUrl = h.discussion,
                    )
                }
                SourceType.FEED -> FeedParser.parse(body.byteStream()).take(source.maxItems).map { r ->
                    Article(
                        id = Ids.forUrl(r.link),
                        title = r.title,
                        url = r.link,
                        summary = r.summary,
                        sourceId = source.id,
                        sourceName = source.name,
                        category = source.category,
                        published = clamp(DateParser.parse(r.date) ?: now, now),
                        fetchedAt = now,
                        sourceTrust = source.trust,
                    )
                }
            }
        }
    }

    private fun clamp(t: Long, now: Long) = if (t > now) now else t

    companion object {
        const val USER_AGENT = "Mozilla/5.0 (Linux; Android 14) TechPulse/1.0 (RSS reader)"
    }
}

object Ids {
    private val trackingParams = Regex("^(utm_\\w+|ref|ref_src|source|fbclid|gclid|mc_cid|mc_eid)$", RegexOption.IGNORE_CASE)
    private val arxiv = Regex("arxiv\\.org/(?:abs|pdf|html)/(\\d{4}\\.\\d{4,5})(?:v\\d+)?", RegexOption.IGNORE_CASE)

    /** Нормализованный URL: одна и та же статья из разных лент получает один id. */
    fun normalize(url: String): String {
        arxiv.find(url)?.let { return "arxiv.org/abs/${it.groupValues[1]}" }
        var u = url.trim().substringBefore('#')
        u = u.replaceFirst(Regex("^https?://", RegexOption.IGNORE_CASE), "").removePrefix("www.")
        val q = u.substringAfter('?', "")
        val base = u.substringBefore('?').trimEnd('/')
        val kept = q.split('&').filter { it.isNotBlank() && !trackingParams.matches(it.substringBefore('=')) }
        return (if (kept.isEmpty()) base else base + "?" + kept.joinToString("&")).lowercase()
    }

    fun forUrl(url: String): String = sha1(normalize(url)).take(16)

    fun titleKey(title: String): String =
        title.lowercase().replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()

    private fun sha1(s: String): String {
        val d = java.security.MessageDigest.getInstance("SHA-1").digest(s.toByteArray())
        return d.joinToString("") { "%02x".format(it) }
    }
}
