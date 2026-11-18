package com.technews.pulse.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.technews.pulse.TechPulseApp
import com.technews.pulse.data.AppSettings
import com.technews.pulse.data.Article
import com.technews.pulse.data.Category
import com.technews.pulse.data.ScoredArticle
import com.technews.pulse.work.RefreshWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = (app as TechPulseApp).repository
    private val store = repo.store

    val settings = store.settings
    val sources = store.sources
    val bookmarks = store.bookmarks
    val readIds = store.readIds
    val status = repo.status

    private val articles = MutableStateFlow<List<Article>>(emptyList())
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()
    private val _loaded = MutableStateFlow(false)
    val loaded: StateFlow<Boolean> = _loaded.asStateFlow()

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages: SharedFlow<String> = _messages

    val scored: StateFlow<List<ScoredArticle>> = combine(articles, settings) { list, s -> repo.evaluate(list, s) }
        .flowOn(Dispatchers.Default)
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        viewModelScope.launch {
            articles.value = withContext(Dispatchers.IO) { repo.cached() }
            _loaded.value = true
            val stale = System.currentTimeMillis() - store.lastRefresh > 30 * 60 * 1000L
            if (articles.value.isEmpty() || stale) refresh()
        }
    }

    /** Перечитать кэш (например, после фонового обновления). */
    fun reload() {
        viewModelScope.launch { articles.value = withContext(Dispatchers.IO) { repo.cached() } }
    }

    fun refresh() {
        if (_refreshing.value) return
        viewModelScope.launch {
            _refreshing.value = true
            try {
                val r = repo.refresh()
                articles.value = withContext(Dispatchers.IO) { repo.cached() }
                val err = if (r.failedSources > 0) " · недоступно источников: ${r.failedSources}" else ""
                _messages.tryEmit("Новых технических статей: ${r.newPassed.size}$err")
            } catch (e: Exception) {
                _messages.tryEmit("Ошибка обновления: ${e.message}")
            } finally {
                _refreshing.value = false
            }
        }
    }

    fun toggleBookmark(id: String) = store.toggleBookmark(id)
    fun markRead(id: String) = store.markRead(id)

    fun updateSettings(transform: (AppSettings) -> AppSettings) {
        val old = settings.value
        val new = store.update(transform)
        if (old.backgroundRefresh != new.backgroundRefresh || old.refreshHours != new.refreshHours) {
            RefreshWorker.schedule(getApplication(), new)
        }
    }

    fun setSourceEnabled(id: String, enabled: Boolean) = store.setSourceEnabled(id, enabled)
    fun addSource(name: String, url: String, category: Category) {
        store.addSource(name, url, category)
        _messages.tryEmit("Источник добавлен — потяните ленту вниз, чтобы загрузить")
    }
    fun removeSource(id: String) = store.removeSource(id)

    fun clearCache() {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { repo.clearCache() }
            articles.value = emptyList()
            refresh()
        }
    }
}
