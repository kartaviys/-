package com.technews.pulse.data

enum class Category(val title: String) {
    RESEARCH("Исследования"),
    ENGINEERING("Инженерия"),
    COMMUNITY("Сообщество"),
    TECH("Технологии"),
    RU("На русском"),
}

enum class SourceType { FEED, HN_ALGOLIA }

/**
 * Источник новостей.
 * [trust] — бонус к «технической» оценке: исследовательские блоги получают плюс,
 * смешанные новостные ленты — ноль или минус.
 */
data class Source(
    val id: String,
    val name: String,
    val url: String,
    val category: Category,
    val type: SourceType = SourceType.FEED,
    val trust: Int = 0,
    val enabled: Boolean = true,
    val custom: Boolean = false,
    val maxItems: Int = 40,
)

data class Article(
    val id: String,
    val title: String,
    val url: String,
    val summary: String,
    val sourceId: String,
    val sourceName: String,
    val category: Category,
    val published: Long,
    val fetchedAt: Long,
    val sourceTrust: Int = 0,
    /** Например «▲ 245 · 💬 120» для Hacker News. */
    val extra: String? = null,
    /** Ссылка на обсуждение (HN и т.п.). */
    val discussionUrl: String? = null,
)

data class AppSettings(
    /** Минимальная оценка, с которой статья считается технической. */
    val strictness: Int = 3,
    val showHidden: Boolean = false,
    val allowWords: List<String> = emptyList(),
    val blockWords: List<String> = emptyList(),
    val backgroundRefresh: Boolean = true,
    val refreshHours: Int = 3,
    val notify: Boolean = true,
    val maxAgeDays: Int = 14,
    val sortByScore: Boolean = false,
)

data class SourceStatus(
    val ok: Boolean,
    val count: Int,
    val error: String?,
    val time: Long,
)
