package com.technews.pulse.ui

import android.text.format.DateUtils
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.technews.pulse.data.AppSettings
import com.technews.pulse.data.Article
import com.technews.pulse.data.Category
import com.technews.pulse.data.ScoredArticle

class ArticleActions(
    val open: (Article) -> Unit,
    val translate: (Article) -> Unit,
    val discussion: (Article) -> Unit,
    val share: (Article) -> Unit,
    val bookmark: (Article) -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    items: List<ScoredArticle>,
    settings: AppSettings,
    bookmarks: Set<String>,
    readIds: Set<String>,
    query: String,
    refreshing: Boolean,
    loaded: Boolean,
    favoritesOnly: Boolean,
    onRefresh: () -> Unit,
    actions: ArticleActions,
    modifier: Modifier = Modifier,
) {
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    var tag by rememberSaveable { mutableStateOf<String?>(null) }
    var why by remember { mutableStateOf<ScoredArticle?>(null) }

    val base = remember(items, bookmarks, favoritesOnly, settings.showHidden) {
        if (favoritesOnly) items.filter { it.article.id in bookmarks }
        else items.filter { settings.showHidden || it.verdict.passed }
    }
    val popularTags = remember(base) {
        base.flatMap { it.verdict.tags }.groupingBy { it }.eachCount().entries
            .sortedByDescending { it.value }.take(10).map { it.key }
    }
    val visible = remember(base, category, tag, query) {
        base.filter { s ->
            (category == null || s.article.category.name == category) &&
                (tag == null || tag in s.verdict.tags) &&
                (query.isBlank() || s.article.title.contains(query, true) ||
                    s.article.summary.contains(query, true) ||
                    s.verdict.tags.any { it.contains(query, true) } ||
                    s.article.sourceName.contains(query, true))
        }
    }

    val listState = rememberLazyListState()
    PullToRefreshBox(isRefreshing = refreshing, onRefresh = onRefresh, modifier = modifier.fillMaxSize()) {
        LazyColumn(state = listState, contentPadding = PaddingValues(bottom = 16.dp), modifier = Modifier.fillMaxSize()) {
            item(key = "filters") {
                Column {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        item {
                            FilterChip(selected = category == null, onClick = { category = null }, label = { Text("Все") })
                        }
                        items(Category.entries.toList()) { c ->
                            FilterChip(
                                selected = category == c.name,
                                onClick = { category = if (category == c.name) null else c.name },
                                label = { Text(c.title) },
                            )
                        }
                    }
                    if (popularTags.isNotEmpty()) {
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(popularTags) { t ->
                                FilterChip(
                                    selected = tag == t,
                                    onClick = { tag = if (tag == t) null else t },
                                    label = { Text("#$t") },
                                )
                            }
                        }
                    }
                }
            }

            if (visible.isEmpty()) {
                item(key = "empty") {
                    val text = when {
                        !loaded || (refreshing && items.isEmpty()) -> "Собираю статьи…"
                        favoritesOnly && bookmarks.isEmpty() -> "Здесь появятся статьи, отмеченные ♥"
                        items.isEmpty() -> "Пока пусто. Потяните вниз, чтобы обновить."
                        else -> "Ничего не найдено. Попробуйте снять фильтры или ослабить строгость в настройках."
                    }
                    Text(
                        text,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                    )
                }
            }

            items(visible, key = { it.article.id }) { s ->
                ArticleCard(
                    item = s,
                    isRead = s.article.id in readIds,
                    isBookmarked = s.article.id in bookmarks,
                    actions = actions,
                    onWhy = { why = s },
                )
            }
        }
    }

    why?.let { WhyDialog(it, settings.strictness) { why = null } }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun ArticleCard(
    item: ScoredArticle,
    isRead: Boolean,
    isBookmarked: Boolean,
    actions: ArticleActions,
    onWhy: () -> Unit,
) {
    val a = item.article
    val v = item.verdict
    val alpha = when {
        !v.passed -> 0.45f
        isRead -> 0.62f
        else -> 1f
    }
    ElevatedCard(
        onClick = { actions.open(a) },
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp).alpha(alpha),
    ) {
        Column(Modifier.padding(start = 14.dp, top = 12.dp, end = 4.dp, bottom = 2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(end = 10.dp)) {
                Text(
                    "${a.sourceName} · ${relativeTime(a.published)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                ScoreBadge(v.score, v.passed)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                a.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = if (isRead) FontWeight.Normal else FontWeight.SemiBold,
                modifier = Modifier.padding(end = 10.dp),
            )
            if (a.summary.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    a.summary,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(end = 10.dp),
                )
            }
            if (v.tags.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    v.tags.forEach { TagChip(it) }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    a.extra.orEmpty(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { actions.bookmark(a) }) {
                    Icon(
                        if (isBookmarked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        contentDescription = "В избранное",
                        tint = if (isBookmarked) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                var menu by remember { mutableStateOf(false) }
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "Ещё") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text("Открыть с переводом на русский") }, onClick = { menu = false; actions.translate(a) })
                        if (a.discussionUrl != null && a.discussionUrl != a.url) {
                            DropdownMenuItem(text = { Text("Обсуждение") }, onClick = { menu = false; actions.discussion(a) })
                        }
                        DropdownMenuItem(text = { Text("Поделиться") }, onClick = { menu = false; actions.share(a) })
                        DropdownMenuItem(text = { Text("Почему показано / скрыто?") }, onClick = { menu = false; onWhy() })
                    }
                }
            }
        }
    }
}

@Composable
private fun ScoreBadge(score: Int, passed: Boolean) {
    val color = when {
        !passed -> MaterialTheme.colorScheme.error
        score >= 10 -> Color(0xFF2E7D32)
        else -> MaterialTheme.colorScheme.secondary
    }
    Surface(shape = RoundedCornerShape(50), color = color.copy(alpha = 0.15f)) {
        Text(
            (if (score > 0) "+" else "") + score,
            color = color,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun TagChip(text: String) {
    Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.secondaryContainer) {
        Text(
            text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
}

@Composable
private fun WhyDialog(item: ScoredArticle, threshold: Int, onDismiss: () -> Unit) {
    val v = item.verdict
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss) { Text("Понятно") } },
        title = { Text("Оценка: ${v.score} (порог $threshold)") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    if (v.passed) "Статья считается технической." else "Статья скрыта как нетехническая / хайп.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(8.dp))
                if (v.signals.isEmpty()) Text("Признаков не найдено.")
                v.signals.forEach { s ->
                    Row {
                        Text(
                            (if (s.weight > 0) "+" else "") + s.weight,
                            fontWeight = FontWeight.Bold,
                            color = if (s.weight > 0) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error,
                            modifier = Modifier.width(36.dp),
                        )
                        Text(s.label, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        },
    )
}

private fun relativeTime(t: Long): String =
    DateUtils.getRelativeTimeSpanString(t, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS, DateUtils.FORMAT_ABBREV_RELATIVE).toString()
