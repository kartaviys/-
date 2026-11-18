package com.technews.pulse.ui

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import java.net.URLEncoder

private data class Tab(val title: String, val icon: ImageVector)

private val tabs = listOf(
    Tab("Лента", Icons.Filled.Home),
    Tab("Избранное", Icons.Filled.Favorite),
    Tab("Источники", Icons.Filled.List),
    Tab("Настройки", Icons.Filled.Settings),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppRoot(vm: MainViewModel = viewModel()) {
    val context = LocalContext.current
    val settings by vm.settings.collectAsStateWithLifecycle()
    val scored by vm.scored.collectAsStateWithLifecycle()
    val bookmarks by vm.bookmarks.collectAsStateWithLifecycle()
    val readIds by vm.readIds.collectAsStateWithLifecycle()
    val sources by vm.sources.collectAsStateWithLifecycle()
    val status by vm.status.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val loaded by vm.loaded.collectAsStateWithLifecycle()

    var tab by rememberSaveable { mutableIntStateOf(0) }
    var searching by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { if (!refreshing) vm.reload() }

    // Разрешение на уведомления (Android 13+)
    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(settings.notify) {
        if (settings.notify && Build.VERSION.SDK_INT >= 33) permLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    val actions = remember(vm) {
        ArticleActions(
            open = { a -> vm.markRead(a.id); openUrl(context, a.url) },
            translate = { a -> vm.markRead(a.id); openUrl(context, translateUrl(a.url)) },
            discussion = { a -> a.discussionUrl?.let { openUrl(context, it) } },
            share = { a -> share(context, a.title, a.url) },
            bookmark = { a -> vm.toggleBookmark(a.id) },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (searching && tab <= 1) {
                        TextField(
                            value = query,
                            onValueChange = { query = it },
                            placeholder = { Text("Поиск по заголовкам и тегам") },
                            singleLine = true,
                            colors = TextFieldDefaults.colors(
                                focusedContainerColor = Color.Transparent,
                                unfocusedContainerColor = Color.Transparent,
                            ),
                        )
                    } else {
                        Column {
                            Text(if (tab == 0) "ТехПульс" else tabs[tab].title, maxLines = 1)
                            if (tab == 0) {
                                val shown = scored.count { it.verdict.passed }
                                Text(
                                    "технических: $shown · отсеяно: ${scored.size - shown}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                },
                actions = {
                    if (tab <= 1) {
                        IconButton(onClick = { searching = !searching; if (!searching) query = "" }) {
                            Icon(if (searching) Icons.Filled.Close else Icons.Filled.Search, "Поиск")
                        }
                    }
                    if (tab == 0 && !searching) {
                        TextButton(onClick = { vm.updateSettings { it.copy(sortByScore = !it.sortByScore) } }) {
                            Text(if (settings.sortByScore) "Лучшие" else "Новые")
                        }
                        IconButton(onClick = { vm.refresh() }) { Icon(Icons.Filled.Refresh, "Обновить") }
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                tabs.forEachIndexed { i, t ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = { tab = i },
                        icon = { Icon(t.icon, t.title) },
                        label = { Text(t.title) },
                    )
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val mod = Modifier.padding(padding)
        when (tab) {
            0 -> FeedScreen(
                items = scored, settings = settings, bookmarks = bookmarks, readIds = readIds,
                query = query, refreshing = refreshing, loaded = loaded, favoritesOnly = false,
                onRefresh = vm::refresh, actions = actions, modifier = mod,
            )
            1 -> FeedScreen(
                items = scored, settings = settings, bookmarks = bookmarks, readIds = readIds,
                query = query, refreshing = refreshing, loaded = loaded, favoritesOnly = true,
                onRefresh = vm::refresh, actions = actions, modifier = mod,
            )
            2 -> SourcesScreen(
                sources = sources, status = status,
                onToggle = vm::setSourceEnabled, onAdd = vm::addSource, onRemove = vm::removeSource,
                modifier = mod,
            )
            else -> SettingsScreen(
                settings = settings, onChange = vm::updateSettings, onClearCache = vm::clearCache, modifier = mod,
            )
        }
    }
}

fun openUrl(context: Context, url: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(context, "Нет приложения для открытия ссылки", Toast.LENGTH_SHORT).show()
    }
}

fun translateUrl(url: String): String =
    "https://translate.google.com/translate?sl=auto&tl=ru&hl=ru&u=" + URLEncoder.encode(url, "UTF-8")

fun share(context: Context, title: String, url: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, "$title\n$url")
    }
    context.startActivity(Intent.createChooser(send, "Поделиться").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
