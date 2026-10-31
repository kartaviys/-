package ru.velopodmoskovye.ui.titles

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import ru.velopodmoskovye.domain.edit.EditApplier
import ru.velopodmoskovye.data.content.ContentRepository
import ru.velopodmoskovye.data.db.TitleAwardEntity
import ru.velopodmoskovye.data.progress.ProgressRepository
import ru.velopodmoskovye.data.settings.SettingsRepository
import ru.velopodmoskovye.domain.fog.Fog
import ru.velopodmoskovye.domain.fog.OpenZones
import ru.velopodmoskovye.domain.model.Superlative
import ru.velopodmoskovye.domain.model.Title
import ru.velopodmoskovye.domain.progress.ProgressCalculator
import ru.velopodmoskovye.domain.progress.Stats
import ru.velopodmoskovye.ui.Format
import ru.velopodmoskovye.ui.common.SectionTitle
import ru.velopodmoskovye.ui.common.shareTitle
import ru.velopodmoskovye.ui.theme.ProgressGreen
import ru.velopodmoskovye.ui.theme.StarGold
import javax.inject.Inject

data class MetaGoal(val name: String, val done: Int, val total: Int)

data class TitlesUiState(
    val awards: List<TitleAwardEntity> = emptyList(),
    val placeTitles: Map<String, Title> = emptyMap(),
    val stats: Stats? = null,
    val trackedKm: Double = 0.0,
    val goals: List<MetaGoal> = emptyList(),
    val superlatives: List<Pair<Superlative, Boolean>> = emptyList(),
    val pairMode: Boolean = false,
)

@HiltViewModel
class TitlesViewModel @Inject constructor(
    content: ContentRepository,
    progress: ProgressRepository,
    settings: SettingsRepository,
) : ViewModel() {
    val state: StateFlow<TitlesUiState> = combine(
        content.packs, progress.titles, progress.visitedIds, progress.trackedMeters, settings.settings,
    ) { pack, awards, visited, meters, s ->
        val completeDest = pack.destinations.values.filter { ProgressCalculator.destination(it, visited).complete }
        val completeIds = completeDest.map { it.id }.toSet()
        val route = pack.spiral.places.filterNot { EditApplier.isUserPlace(it.id) }
        val placeDone = route.filter { it.destinationId in completeIds }.map { it.id }.toSet()
        val regionsDone = pack.spiral.regions.count { r ->
            val ps = route.filter { it.regionId == r.id }
            ps.isNotEmpty() && ps.all { it.id in placeDone }
        }
        val zones = OpenZones.compute(pack.spiral, pack.destinations, visited, s.geofenceRadiusM)
        val area = Fog.mergeOverlapping(zones.map { it.ring }).sumOf { Fog.areaKm2(it) }
        val stats = Stats(
            placesTotal = route.size,
            placesWithContent = route.count { it.destinationId != null },
            placesComplete = placeDone.size,
            regionsTotal = pack.spiral.regions.count { r -> route.any { it.regionId == r.id } },
            regionsComplete = regionsDone,
            stopsVisited = visited.size,
            routeKmComplete = completeDest.sumOf { it.route.distanceKm },
            openedAreaKm2 = area,
        )
        val stars = route.filter { it.mustHave == 3 }
        val goals = buildList {
            add(MetaGoal("Все места ★", stars.count { it.id in placeDone }, stars.size))
            pack.spiral.rings.forEach { ring ->
                val ps = route.filter { it.ring == ring.index }
                if (ps.isNotEmpty()) add(MetaGoal("Кольцо ${ring.name}", ps.count { it.id in placeDone }, ps.size))
            }
            add(MetaGoal("Вся спираль — от ЦАО до края области", placeDone.size, route.size))
        }
        TitlesUiState(
            awards = awards,
            placeTitles = pack.destinations.values.associate { it.id to it.title },
            stats = stats,
            trackedKm = meters / 1000.0,
            goals = goals,
            superlatives = pack.spiral.superlatives.map { it to (it.placeId != null && it.placeId in placeDone) },
            pairMode = s.pairMode,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), TitlesUiState())
}

@Composable
fun TitlesScreen(vm: TitlesViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
        item {
            Text("Звания и статистика", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            state.stats?.let { s ->
                Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        StatLine("Проехано по GPS", Format.km(state.trackedKm))
                        StatLine("Длина пройденных маршрутов", Format.km(s.routeKmComplete))
                        StatLine("Места", "${s.placesComplete} из ${s.placesTotal} (маршрутов готово: ${s.placesWithContent})")
                        StatLine("Округа", "${s.regionsComplete} из ${s.regionsTotal}")
                        StatLine("Точек отмечено", "${s.stopsVisited}")
                        StatLine("Открыто области", "${Format.percent(s.openedShare)} (${"%.1f".format(s.openedAreaKm2)} км²)")
                    }
                }
            }
            SectionTitle("Мои звания")
            if (state.awards.isEmpty()) {
                Text("Пока пусто. Пройдите все точки любого места — и получите первое звание.", style = MaterialTheme.typography.bodyMedium)
            }
        }
        items(state.awards, key = { it.titleId }) { a ->
            val placeTitle = state.placeTitles[a.titleId.substringAfter(':')]?.takeIf { a.titleId.startsWith("place:") }
            val shown = if (state.pairMode && placeTitle != null) placeTitle.pairVariant else a.name
            Card(
                Modifier.fillMaxWidth().padding(vertical = 4.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
            ) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.EmojiEvents, null, tint = StarGold)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(shown, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(placeTitle?.legend ?: a.description, style = MaterialTheme.typography.bodySmall)
                        Text(Format.dateTime(a.awardedAt), style = MaterialTheme.typography.labelSmall)
                    }
                    IconButton(onClick = { shareTitle(context, shown, placeTitle?.legend ?: a.description, placeTitle?.ritual) }) {
                        Icon(Icons.Filled.Share, "Поделиться")
                    }
                }
            }
        }
        item { SectionTitle("Мета-звания") }
        items(state.goals) { g ->
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Text(g.name, Modifier.weight(1f))
                Text("${g.done} / ${g.total}", color = if (g.done == g.total) ProgressGreen else MaterialTheme.colorScheme.onSurface)
            }
        }
        item {
            Text(
                "За каждый округ целиком — «Знаток округа», за кольцо — «Покоритель кольца», за все ★ — «Собиратель звёзд», " +
                    "за всю спираль от ЦАО до края области — «Велопаломник Подмосковья».",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SectionTitle("Самые-самые")
        }
        items(state.superlatives) { (s, done) ->
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(if (done) Icons.Filled.EmojiEvents else Icons.Filled.Lock, null, tint = if (done) StarGold else MaterialTheme.colorScheme.outline)
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(s.title, style = MaterialTheme.typography.bodyLarge)
                    if (s.note.isNotBlank()) Text(s.note, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun StatLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}
