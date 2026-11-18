package com.technews.pulse.data

import android.content.Context
import com.technews.pulse.filter.TechFilter
import com.technews.pulse.filter.Verdict
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext

data class ScoredArticle(val article: Article, val verdict: Verdict)

data class RefreshResult(
    val newPassed: List<ScoredArticle>,
    val newTotal: Int,
    val okSources: Int,
    val failedSources: Int,
)

class Repository(context: Context) {
    val store = SettingsStore(context)
    private val storage = ArticleStorage(context)
    private val fetcher = FeedFetcher()
    private val mutex = Mutex()

    private val _status = MutableStateFlow<Map<String, SourceStatus>>(emptyMap())
    val status: StateFlow<Map<String, SourceStatus>> = _status.asStateFlow()

    fun cached(): List<Article> = storage.load()

    fun evaluate(list: List<Article>, settings: AppSettings): List<ScoredArticle> {
        val scored = list.map { a ->
            ScoredArticle(a, TechFilter.evaluate(a.title, a.summary, a.url, a.sourceTrust, settings))
        }
        return if (settings.sortByScore) {
            // «Лучшие»: свежие (до 3 дней) по оценке, затем остальные по дате
            val cutoff = System.currentTimeMillis() - 3L * 24 * 3600 * 1000
            val (fresh, old) = scored.partition { it.article.published >= cutoff }
            fresh.sortedByDescending { it.verdict.score } + old.sortedByDescending { it.article.published }
        } else {
            scored.sortedByDescending { it.article.published }
        }
    }

    suspend fun refresh(): RefreshResult = mutex.withLock {
        withContext(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            val settings = store.settings.value
            val sources = store.sources.value.filter { it.enabled }
            val semaphore = Semaphore(6)

            val results = coroutineScope {
                sources.map { src ->
                    async { semaphore.withPermit { src to runCatching { fetcher.fetch(src, now) } } }
                }.awaitAll()
            }

            val statuses = _status.value.toMutableMap()
            val fetched = mutableListOf<Article>()
            var ok = 0
            var failed = 0
            for ((src, res) in results) {
                res.onSuccess {
                    ok++
                    fetched += it
                    statuses[src.id] = SourceStatus(true, it.size, null, now)
                }.onFailure {
                    failed++
                    statuses[src.id] = SourceStatus(false, 0, it.message ?: it.javaClass.simpleName, now)
                }
            }
            _status.value = statuses

            // Слияние с кэшем + дедупликация по URL и по заголовку
            val existing = storage.load()
            val byId = LinkedHashMap<String, Article>()
            val idByTitle = HashMap<String, String>()
            existing.forEach { byId[it.id] = it; idByTitle[Ids.titleKey(it.title)] = it.id }

            val newOnes = mutableListOf<Article>()
            for (a in fetched) {
                val key = byId[a.id]?.id ?: idByTitle[Ids.titleKey(a.title)]
                if (key != null) {
                    byId[key] = merge(byId.getValue(key), a)
                } else {
                    byId[a.id] = a
                    idByTitle[Ids.titleKey(a.title)] = a.id
                    newOnes += a
                }
            }

            val bookmarks = store.bookmarks.value
            val minTime = now - settings.maxAgeDays * 24L * 3600 * 1000
            val pruned = byId.values
                .filter { it.published >= minTime || it.id in bookmarks }
                .sortedByDescending { it.published }
                .take(MAX_CACHED)
            storage.save(pruned)
            store.retainRead(pruned.map { it.id }.toSet())
            store.lastRefresh = now

            val newPassed = evaluate(newOnes, settings).filter { it.verdict.passed }
            RefreshResult(newPassed, newOnes.size, ok, failed)
        }
    }

    /** Склейка дублей: оставляем первоисточник, добираем описание и ссылку на обсуждение. */
    private fun merge(old: Article, new: Article): Article = old.copy(
        summary = if (new.summary.length > old.summary.length) new.summary else old.summary,
        discussionUrl = old.discussionUrl ?: new.discussionUrl,
        extra = new.extra ?: old.extra,
        sourceTrust = maxOf(old.sourceTrust, new.sourceTrust),
    )

    fun clearCache() {
        storage.clear()
        store.lastRefresh = 0
    }

    companion object {
        const val MAX_CACHED = 2000
    }
}
