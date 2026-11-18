package com.technews.pulse.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Кэш статей в JSON-файле. */
class ArticleStorage(context: Context) {
    private val file = File(context.filesDir, "articles.json")
    private val lock = Any()

    fun load(): List<Article> = synchronized(lock) {
        if (!file.exists()) return emptyList()
        runCatching {
            val arr = JSONArray(file.readText())
            (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let(::fromJson) }
        }.getOrDefault(emptyList())
    }

    fun save(list: List<Article>) = synchronized(lock) {
        val arr = JSONArray()
        list.forEach { arr.put(toJson(it)) }
        val tmp = File(file.parentFile, "articles.json.tmp")
        tmp.writeText(arr.toString())
        if (!tmp.renameTo(file)) {
            file.delete(); tmp.renameTo(file)
        }
    }

    fun clear() = synchronized(lock) { file.delete() }

    private fun toJson(a: Article) = JSONObject().apply {
        put("id", a.id); put("title", a.title); put("url", a.url); put("summary", a.summary)
        put("sourceId", a.sourceId); put("sourceName", a.sourceName); put("category", a.category.name)
        put("published", a.published); put("fetchedAt", a.fetchedAt); put("trust", a.sourceTrust)
        a.extra?.let { put("extra", it) }
        a.discussionUrl?.let { put("discussion", it) }
    }

    private fun fromJson(o: JSONObject): Article? = runCatching {
        Article(
            id = o.getString("id"),
            title = o.getString("title"),
            url = o.getString("url"),
            summary = o.optString("summary", ""),
            sourceId = o.optString("sourceId", ""),
            sourceName = o.optString("sourceName", ""),
            category = runCatching { Category.valueOf(o.optString("category")) }.getOrDefault(Category.TECH),
            published = o.optLong("published"),
            fetchedAt = o.optLong("fetchedAt"),
            sourceTrust = o.optInt("trust", 0),
            extra = if (o.has("extra")) o.getString("extra") else null,
            discussionUrl = if (o.has("discussion")) o.getString("discussion") else null,
        )
    }.getOrNull()
}

/** Настройки, избранное, прочитанное и конфигурация источников (SharedPreferences). */
class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("techpulse", Context.MODE_PRIVATE)

    private val _settings = MutableStateFlow(readSettings())
    val settings: StateFlow<AppSettings> = _settings.asStateFlow()

    private val _bookmarks = MutableStateFlow(prefs.getStringSet(K_BOOKMARKS, emptySet())!!.toSet())
    val bookmarks: StateFlow<Set<String>> = _bookmarks.asStateFlow()

    private val _read = MutableStateFlow(prefs.getStringSet(K_READ, emptySet())!!.toSet())
    val readIds: StateFlow<Set<String>> = _read.asStateFlow()

    private val _sources = MutableStateFlow(readSources())
    val sources: StateFlow<List<Source>> = _sources.asStateFlow()

    var lastRefresh: Long
        get() = prefs.getLong(K_LAST_REFRESH, 0L)
        set(v) = prefs.edit().putLong(K_LAST_REFRESH, v).apply()

    // ---------- settings ----------
    private fun readSettings() = AppSettings(
        strictness = prefs.getInt("strictness", 3),
        showHidden = prefs.getBoolean("showHidden", false),
        allowWords = splitWords(prefs.getString("allowWords", "")!!),
        blockWords = splitWords(prefs.getString("blockWords", "")!!),
        backgroundRefresh = prefs.getBoolean("bg", true),
        refreshHours = prefs.getInt("refreshHours", 3),
        notify = prefs.getBoolean("notify", true),
        maxAgeDays = prefs.getInt("maxAgeDays", 14),
        sortByScore = prefs.getBoolean("sortByScore", false),
    )

    fun update(transform: (AppSettings) -> AppSettings): AppSettings {
        val s = transform(_settings.value)
        prefs.edit()
            .putInt("strictness", s.strictness)
            .putBoolean("showHidden", s.showHidden)
            .putString("allowWords", s.allowWords.joinToString(", "))
            .putString("blockWords", s.blockWords.joinToString(", "))
            .putBoolean("bg", s.backgroundRefresh)
            .putInt("refreshHours", s.refreshHours)
            .putBoolean("notify", s.notify)
            .putInt("maxAgeDays", s.maxAgeDays)
            .putBoolean("sortByScore", s.sortByScore)
            .apply()
        _settings.value = s
        return s
    }

    // ---------- bookmarks / read ----------
    fun toggleBookmark(id: String) {
        val s = _bookmarks.value.toMutableSet()
        if (!s.remove(id)) s.add(id)
        _bookmarks.value = s
        prefs.edit().putStringSet(K_BOOKMARKS, s).apply()
    }

    fun markRead(id: String) {
        if (id in _read.value) return
        val s = _read.value + id
        _read.value = s
        prefs.edit().putStringSet(K_READ, s).apply()
    }

    fun retainRead(existing: Set<String>) {
        val s = _read.value.filter { it in existing }.toSet()
        if (s.size != _read.value.size) {
            _read.value = s
            prefs.edit().putStringSet(K_READ, s).apply()
        }
    }

    // ---------- sources ----------
    private fun readSources(): List<Source> {
        val on = prefs.getStringSet(K_SRC_ON, emptySet())!!
        val off = prefs.getStringSet(K_SRC_OFF, emptySet())!!
        val defaults = DEFAULT_SOURCES.map {
            when (it.id) {
                in on -> it.copy(enabled = true)
                in off -> it.copy(enabled = false)
                else -> it
            }
        }
        val custom = runCatching {
            val arr = JSONArray(prefs.getString(K_CUSTOM, "[]"))
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                Source(
                    id = o.getString("id"),
                    name = o.getString("name"),
                    url = o.getString("url"),
                    category = runCatching { Category.valueOf(o.getString("category")) }.getOrDefault(Category.TECH),
                    type = runCatching { SourceType.valueOf(o.getString("type")) }.getOrDefault(SourceType.FEED),
                    trust = o.optInt("trust", 0),
                    enabled = o.optBoolean("enabled", true),
                    custom = true,
                )
            }
        }.getOrDefault(emptyList())
        return defaults + custom
    }

    private fun saveSources(list: List<Source>) {
        val defaultsById = DEFAULT_SOURCES.associateBy { it.id }
        val on = mutableSetOf<String>()
        val off = mutableSetOf<String>()
        val custom = JSONArray()
        for (s in list) {
            val d = defaultsById[s.id]
            if (d != null && !s.custom) {
                if (s.enabled != d.enabled) (if (s.enabled) on else off).add(s.id)
            } else {
                custom.put(JSONObject().apply {
                    put("id", s.id); put("name", s.name); put("url", s.url)
                    put("category", s.category.name); put("type", s.type.name)
                    put("trust", s.trust); put("enabled", s.enabled)
                })
            }
        }
        prefs.edit().putStringSet(K_SRC_ON, on).putStringSet(K_SRC_OFF, off).putString(K_CUSTOM, custom.toString()).apply()
        _sources.value = list
    }

    fun setSourceEnabled(id: String, enabled: Boolean) =
        saveSources(_sources.value.map { if (it.id == id) it.copy(enabled = enabled) else it })

    fun addSource(name: String, url: String, category: Category) {
        val type = if (url.contains("hn.algolia.com")) SourceType.HN_ALGOLIA else SourceType.FEED
        val s = Source(
            id = "custom_" + System.currentTimeMillis(),
            name = name.ifBlank { url.substringAfter("://").substringBefore('/') },
            url = url.trim(), category = category, type = type, custom = true,
        )
        saveSources(_sources.value + s)
    }

    fun removeSource(id: String) = saveSources(_sources.value.filterNot { it.id == id && it.custom })

    companion object {
        private const val K_BOOKMARKS = "bookmarks"
        private const val K_READ = "read"
        private const val K_SRC_ON = "src_on"
        private const val K_SRC_OFF = "src_off"
        private const val K_CUSTOM = "src_custom"
        private const val K_LAST_REFRESH = "last_refresh"

        fun splitWords(s: String) = s.split(',', ';', '\n').map { it.trim() }.filter { it.isNotEmpty() }
    }
}
