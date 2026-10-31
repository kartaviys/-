package ru.velopodmoskovye.ui.place

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import ru.velopodmoskovye.data.content.ContentRepository
import ru.velopodmoskovye.data.edit.EditsRepository
import ru.velopodmoskovye.data.map.OfflineMaps
import ru.velopodmoskovye.data.map.OfflineState
import ru.velopodmoskovye.data.progress.ProgressRepository
import ru.velopodmoskovye.data.settings.SettingsRepository
import ru.velopodmoskovye.domain.model.Destination
import ru.velopodmoskovye.domain.progress.DestinationProgress
import ru.velopodmoskovye.domain.progress.ProgressCalculator
import ru.velopodmoskovye.domain.route.GoogleMapsLinks
import ru.velopodmoskovye.domain.route.YandexMapsLinks
import ru.velopodmoskovye.domain.route.RouteOptimizer
import ru.velopodmoskovye.domain.route.RouteTiming
import ru.velopodmoskovye.ui.map.MapData
import java.time.LocalDate
import java.time.LocalTime
import javax.inject.Inject

data class PlaceUiState(
    val loading: Boolean = true,
    val destination: Destination? = null,
    val regionName: String = "",
    val visited: Set<String> = emptySet(),
    val progress: DestinationProgress? = null,
    val date: LocalDate = LocalDate.now(),
    val start: LocalTime = LocalTime.of(10, 0),
    val timing: RouteTiming.Result? = null,
    val suggestion: RouteOptimizer.Suggestion? = null,
    val walking: Boolean = false,
    val blocks: List<GoogleMapsLinks.Block> = emptyList(),
    val yandexUrl: String? = null,
    val pairMode: Boolean = false,
    val isActive: Boolean = false,
    val otherActive: Boolean = false,
)

@HiltViewModel
class PlaceViewModel @Inject constructor(
    savedState: SavedStateHandle,
    content: ContentRepository,
    private val progress: ProgressRepository,
    settings: SettingsRepository,
    private val offline: OfflineMaps,
    private val edits: EditsRepository,
) : ViewModel() {
    /** Удалить своё место со всеми его точками. */
    fun deletePlace(done: () -> Unit) {
        viewModelScope.launch {
            edits.removePlace(id)
            done()
        }
    }

    private val id: String = checkNotNull(savedState["id"])

    val offlineState: StateFlow<OfflineState> = offline.states
        .map { it[id] ?: OfflineState.None }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), OfflineState.None)

    fun downloadArea() {
        val d = state.value.destination ?: return
        offline.downloadArea(id, MapData.routePoints(d))
    }

    fun deleteArea() = offline.delete(id)

    private data class Plan(val date: LocalDate, val start: LocalTime, val walking: Boolean)
    private val plan = MutableStateFlow(Plan(LocalDate.now(), LocalTime.of(10, 0), false))

    val state: StateFlow<PlaceUiState> = combine(
        content.packs, progress.visitedIds, settings.settings, plan, progress.activeRoute,
    ) { pack, visited, s, p, active ->
        val dest = pack.destinations[id] ?: return@combine PlaceUiState(loading = false)
        val ordered = dest.stops
        val timing = RouteTiming.check(dest, ordered, p.date, p.start, s.speedKmh.toDouble())
        val params = RouteOptimizer.Params(speedKmh = s.speedKmh.toDouble(), startMin = p.start.hour * 60 + p.start.minute)
        val suggestion = RouteOptimizer.suggest(dest.startPoint.coords, dest.endPoint.coords, ordered, dest.route.barriers, p.date, params)
        val mode = if (p.walking) GoogleMapsLinks.Mode.WALKING else GoogleMapsLinks.Mode.BICYCLING
        PlaceUiState(
            loading = false,
            destination = dest,
            regionName = pack.regionNames[dest.regionId] ?: "",
            visited = visited,
            progress = ProgressCalculator.destination(dest, visited),
            date = p.date,
            start = p.start,
            timing = timing,
            suggestion = suggestion,
            walking = p.walking,
            blocks = GoogleMapsLinks.blocks(MapData.routePoints(dest), mode),
            yandexUrl = MapData.routePoints(dest).takeIf { it.size >= 2 }?.let { YandexMapsLinks.url(it, mode) },
            pairMode = s.pairMode,
            isActive = active?.destinationId == dest.id,
            otherActive = active != null && active.destinationId != dest.id,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PlaceUiState())

    fun setDate(d: LocalDate) { plan.value = plan.value.copy(date = d) }
    fun setStart(t: LocalTime) { plan.value = plan.value.copy(start = t) }
    fun setWalking(w: Boolean) { plan.value = plan.value.copy(walking = w) }

    fun startRoute(onStarted: () -> Unit) {
        viewModelScope.launch {
            progress.startRoute(id)
            onStarted()
        }
    }
}
