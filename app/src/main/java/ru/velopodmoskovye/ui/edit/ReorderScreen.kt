package ru.velopodmoskovye.ui.edit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import ru.velopodmoskovye.data.content.ContentRepository
import ru.velopodmoskovye.data.edit.EditsRepository
import ru.velopodmoskovye.domain.edit.StopOrder
import ru.velopodmoskovye.domain.geo.Geo
import ru.velopodmoskovye.domain.model.Destination
import ru.velopodmoskovye.domain.model.Stop
import ru.velopodmoskovye.ui.Format
import ru.velopodmoskovye.ui.map.MapData
import ru.velopodmoskovye.ui.map.MapLibreView
import javax.inject.Inject

data class ReorderUiState(val loading: Boolean = true, val destination: Destination? = null, val hasOrder: Boolean = false)

@HiltViewModel
class ReorderViewModel @Inject constructor(
    savedState: SavedStateHandle,
    content: ContentRepository,
    private val edits: EditsRepository,
) : ViewModel() {
    val destId: String = checkNotNull(savedState["destId"])

    val state: StateFlow<ReorderUiState> = combine(content.packs, edits.edits) { pack, e ->
        ReorderUiState(false, pack.destinations[destId], e.orderFor(destId) != null)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ReorderUiState())

    fun save(ids: List<String>, done: () -> Unit) = viewModelScope.launch {
        edits.setOrder(StopOrder(destId, ids, System.currentTimeMillis()))
        done()
    }

    fun reset(done: () -> Unit) = viewModelScope.launch { edits.resetOrder(destId); done() }
}

/** Длина ломаной старт → точки → финиш по прямой, км. */
private fun pathKm(d: Destination, stops: List<Stop>): Double {
    val pts = listOf(d.startPoint.coords) + stops.map { it.coords } + d.endPoint.coords
    return pts.zipWithNext { a, b -> Geo.distanceKm(a, b) }.sum()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReorderScreen(onBack: () -> Unit, vm: ReorderViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val dest = state.destination
    var stops by remember { mutableStateOf<List<Stop>?>(null) }
    LaunchedEffect(dest?.id) { if (stops == null && dest != null) stops = dest.stops }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Порядок точек") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
            )
        },
    ) { padding ->
        val list = stops
        if (dest == null || list == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                if (state.loading || dest != null) CircularProgressIndicator() else Text("Место не найдено")
            }
            return@Scaffold
        }
        val preview = dest.copy(stops = list.mapIndexed { i, s -> s.copy(order = i + 1) })
        fun swap(i: Int, j: Int) {
            if (i !in list.indices || j !in list.indices) return
            stops = list.toMutableList().also { val t = it[i]; it[i] = it[j]; it[j] = t }
        }
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp)) {
            item {
                MapLibreView(
                    layers = MapData.routeLayers(preview, emptySet(), prefix = "order"),
                    fitTo = MapData.routePoints(dest),
                    modifier = Modifier.fillMaxWidth().height(240.dp),
                )
                Text(
                    "Стрелками меняйте точки местами — пунктир на карте сразу перестроится. " +
                        "Порядок попадёт и в ссылки на Яндекс Карты и Google Maps.",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
                Text(
                    "Старт: ${dest.startPoint.name} · по прямой ${Format.km(pathKm(dest, list))} (было ${Format.km(pathKm(dest, dest.stops))})",
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            itemsIndexed(list, key = { _, s -> s.id }) { i, s ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${i + 1}.", Modifier.width(32.dp), fontWeight = FontWeight.Bold)
                    Column(Modifier.weight(1f)) {
                        Text(s.name, style = MaterialTheme.typography.bodyLarge)
                        if (s.optional) Text("по желанию", style = MaterialTheme.typography.labelSmall)
                    }
                    IconButton(onClick = { swap(i, i - 1) }, enabled = i > 0) { Icon(Icons.Filled.KeyboardArrowUp, "Выше") }
                    IconButton(onClick = { swap(i, i + 1) }, enabled = i < list.lastIndex) { Icon(Icons.Filled.KeyboardArrowDown, "Ниже") }
                }
            }
            item {
                Text("Финиш: ${dest.endPoint.name}", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp))
                Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Button(onClick = { vm.save(list.map { it.id }, onBack) }, modifier = Modifier.fillMaxWidth()) { Text("Сохранить порядок") }
                    if (state.hasOrder) TextButton(onClick = { vm.reset(onBack) }) { Text("Вернуть исходный порядок") }
                }
            }
        }
    }
}
