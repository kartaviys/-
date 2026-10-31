package ru.velopodmoskovye.ui.spiral

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsBike
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.velopodmoskovye.domain.progress.ProgressCalculator
import ru.velopodmoskovye.domain.spiral.SpiralBuilder
import ru.velopodmoskovye.ui.Format
import ru.velopodmoskovye.ui.theme.ProgressGreen
import ru.velopodmoskovye.ui.theme.StarGold

@Composable
fun SpiralScreen(
    onOpenPlace: (String) -> Unit,
    onOpenActive: (String) -> Unit,
    onOpenStop: (String, String) -> Unit,
    onAddPlace: () -> Unit = {},
    vm: SpiralViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    if (state.loading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 96.dp)) {
            item {
                Column(Modifier.padding(16.dp)) {
                    Text("Спираль от Кремля", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(
                        "${state.total} мест: старт в ЦАО, затем округа Москвы внутри МКАД и дальше кольцами наружу. " +
                            "У каждого места — свой веломаршрут. Пройдено: ${state.complete}.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    state.next?.let {
                        Text(
                            "Следующее по спирали: ${it.num}. ${it.name}",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    Spacer(Modifier.padding(4.dp))
                    LinearProgressIndicator(
                        progress = { if (state.total == 0) 0f else state.complete.toFloat() / state.total },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    androidx.compose.material3.OutlinedButton(onClick = onAddPlace, modifier = Modifier.padding(top = 8.dp)) {
                        Text("Добавить своё место")
                    }
                    OutlinedTextField(
                        value = state.query,
                        onValueChange = vm::setQuery,
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                        singleLine = true,
                        leadingIcon = { Icon(Icons.Filled.Search, null) },
                        trailingIcon = {
                            if (state.query.isNotEmpty()) IconButton(onClick = { vm.setQuery("") }) { Icon(Icons.Filled.Clear, "Очистить") }
                        },
                        placeholder = { Text("Найти место или точку: усадьба, монастырь, Пушкин…") },
                    )
                    Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        SpiralFilter.entries.forEach { f ->
                            FilterChip(selected = state.filter == f, onClick = { vm.setFilter(f) }, label = { Text(f.label) })
                        }
                    }
                    Text("Сортировка", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp))
                    Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        SpiralSort.entries.forEach { s ->
                            FilterChip(selected = state.sort == s, onClick = { vm.setSort(s) }, label = { Text(s.label) })
                        }
                    }
                    if (state.waitingLocation) {
                        Text(
                            "Жду геопозицию: разрешите доступ к местоположению на экране карты.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
            if (state.query.isNotBlank()) {
                item {
                    Text(
                        if (state.stopHits.isEmpty()) "Точек не найдено" else "Точки: ${state.stopHits.size}",
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    )
                }
                items(state.stopHits, key = { "stop-${it.stopId}" }) { hit ->
                    StopHitRow(hit) { onOpenStop(hit.destinationId, hit.stopId) }
                }
                item {
                    Text(
                        "Места: ${state.rows.size}",
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp),
                    )
                }
            }
            val rows = state.rows
            items(rows, key = { it.place.id }) { row ->
                val ringHeader = state.sort == SpiralSort.SPIRAL &&
                    rows.indexOf(row).let { i -> i == 0 || rows[i - 1].place.ring != row.place.ring }
                Column {
                    if (ringHeader) RingHeader(row.place.ring)
                    PlaceRow(row, state.activeDestinationId) {
                        val id = row.place.destinationId
                        if (id != null) {
                            if (id == state.activeDestinationId) onOpenActive(id) else onOpenPlace(id)
                        }
                    }
                }
            }
        }
        state.activeDestinationId?.let { id ->
            ExtendedFloatingActionButton(
                onClick = { onOpenActive(id) },
                modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
                icon = { Icon(Icons.AutoMirrored.Filled.DirectionsBike, null) },
                text = { Text("Активный маршрут") },
            )
        }
    }
}

@Composable
private fun StopHitRow(hit: StopHit, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp).clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Place, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(hit.stopName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(hit.placeName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun RingHeader(ring: Int) {
    Surface(color = MaterialTheme.colorScheme.secondaryContainer, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Text(
            if (ring == SpiralBuilder.INSIDE_MKAD_RING) ProgressCalculator.ringName(ring) else "Кольцо ${ProgressCalculator.ringName(ring)}",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun PlaceRow(row: SpiralRow, activeId: String?, onClick: () -> Unit) {
    val p = row.place
    val ready = p.destinationId != null
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp)
            .alpha(if (ready || row.complete) 1f else 0.7f)
            .clickable(enabled = ready, onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = if (p.destinationId != null && p.destinationId == activeId) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = CircleShape, color = if (row.complete) ProgressGreen else MaterialTheme.colorScheme.surface, modifier = Modifier.size(34.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    if (row.complete) Icon(Icons.Filled.CheckCircle, null, tint = MaterialTheme.colorScheme.surface)
                    else Text("${p.num}", style = MaterialTheme.typography.labelMedium)
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    if (p.mustHave >= 2) Text("  ${Format.stars(p.mustHave)}", color = StarGold, fontWeight = FontWeight.Bold)
                }
                Text(
                    "${p.kindNote} · ${row.regionName} · ${Format.km(p.distanceFromKremlinKm)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                val routeLine = buildList {
                    if (p.start) add("старт спирали")
                    if (row.routeKm != null) add("маршрут ${Format.km(row.routeKm)}, точек: ${row.stopsCount}") else add("маршрут готовится")
                    row.fromMeKm?.let { add("от меня ${Format.km(it)}") }
                }.joinToString(" · ")
                Text(
                    routeLine,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (ready) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                row.progress?.takeIf { it.started && !it.complete }?.let {
                    LinearProgressIndicator(progress = { it.fraction }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
                }
            }
        }
    }
}
