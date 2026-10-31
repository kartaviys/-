package ru.velopodmoskovye.ui.place

import android.Manifest
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.DirectionsBike
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.velopodmoskovye.domain.edit.EditApplier
import ru.velopodmoskovye.domain.model.Destination
import ru.velopodmoskovye.domain.route.RouteTiming
import ru.velopodmoskovye.service.RouteTrackingService
import ru.velopodmoskovye.ui.Format
import ru.velopodmoskovye.ui.common.InfoLine
import ru.velopodmoskovye.ui.common.Paragraphs
import ru.velopodmoskovye.ui.common.SectionTitle
import ru.velopodmoskovye.ui.common.VerifiedMark
import ru.velopodmoskovye.ui.common.openInMaps
import ru.velopodmoskovye.ui.common.openUrl
import ru.velopodmoskovye.ui.map.MapData
import ru.velopodmoskovye.ui.map.MapLibreView
import ru.velopodmoskovye.ui.settings.OfflineControl
import ru.velopodmoskovye.ui.theme.ProgressGreen
import ru.velopodmoskovye.ui.theme.StarGold
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PlaceScreen(
    onBack: () -> Unit,
    onOpenStop: (String, String) -> Unit,
    onStartRoute: (String) -> Unit,
    onEditPoint: (String, String) -> Unit = { _, _ -> },
    onReorder: (String) -> Unit = {},
    vm: PlaceViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val dest = state.destination
    var confirmDeletePlace by remember { mutableStateOf(false) }
    if (confirmDeletePlace && dest != null) {
        AlertDialog(
            onDismissRequest = { confirmDeletePlace = false },
            title = { Text("Удалить своё место?") },
            text = { Text("Место «${dest.name}» и все его точки исчезнут из спирали.") },
            confirmButton = { TextButton(onClick = { confirmDeletePlace = false; vm.deletePlace(onBack) }) { Text("Удалить") } },
            dismissButton = { TextButton(onClick = { confirmDeletePlace = false }) { Text("Отмена") } },
        )
    }
    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (dest != null && (granted[Manifest.permission.ACCESS_FINE_LOCATION] == true || granted[Manifest.permission.ACCESS_COARSE_LOCATION] == true)) {
            vm.startRoute {
                RouteTrackingService.start(context)
                onStartRoute(dest.id)
            }
        } else if (dest != null) {
            // Без геолокации маршрут всё равно можно пройти с ручными отметками — но они требуют координат.
            android.widget.Toast.makeText(context, "Без доступа к геолокации отметки не ставятся", android.widget.Toast.LENGTH_LONG).show()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(dest?.name ?: "") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
            )
        },
        bottomBar = {
            if (dest != null) {
                Box(Modifier.fillMaxWidth().padding(12.dp)) {
                    Button(
                        onClick = {
                            if (state.isActive) onStartRoute(dest.id)
                            else {
                                val req = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                                if (Build.VERSION.SDK_INT >= 33) req += Manifest.permission.POST_NOTIFICATIONS
                                permissions.launch(req.toTypedArray())
                            }
                        },
                        modifier = Modifier.fillMaxWidth().testTag("start_route"),
                    ) {
                        Icon(Icons.AutoMirrored.Filled.DirectionsBike, null)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            when {
                                state.isActive -> "Продолжить маршрут"
                                state.otherActive -> "Начать маршрут (прошлый будет остановлен)"
                                else -> "Начать маршрут"
                            },
                        )
                    }
                }
            }
        },
    ) { padding ->
        if (state.loading || dest == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                if (state.loading) CircularProgressIndicator() else Text("Место не найдено")
            }
            return@Scaffold
        }
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp)) {
            item { Header(dest, state) }
            item {
                SectionTitle("Как понять это место")
                Paragraphs(dest.intro)
            }
            item {
                SectionTitle("Маршрут")
                MapLibreView(
                    layers = MapData.routeLayers(dest, state.visited),
                    fitTo = MapData.routePoints(dest),
                    modifier = Modifier.fillMaxWidth().height(260.dp),
                )
                Text(
                    "Пунктир — порядок точек, а не трасса. Дорогу по улицам проложат Google Maps или Яндекс Карты.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                InfoLine("Старт", "${dest.startPoint.name} (${dest.startPoint.transport})")
                InfoLine("Финиш", "${dest.endPoint.name} (${dest.endPoint.transport})")
                InfoLine("Длина", "${Format.km(dest.route.distanceKm)}, ${dest.route.shape}")
                InfoLine("Время", Format.hours(dest.route.durationH))
                InfoLine("Сложность", dest.route.difficulty)
                InfoLine("Покрытие", dest.route.surfaceNotes)
                InfoLine("Сезон", dest.route.seasonNotes)
                InfoLine("Безопасность", dest.route.safetyNotes)
            }
            item {
                val offline by vm.offlineState.collectAsStateWithLifecycle()
                Text("Карта района без сети", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
                OfflineControl(offline, onDownload = vm::downloadArea, onDelete = vm::deleteArea)
            }
            item { TimingCard(state, onDate = vm::setDate, onTime = vm::setStart) }
            state.suggestion?.let { s ->
                item {
                    Card(Modifier.fillMaxWidth().padding(top = 8.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)) {
                        Column(Modifier.padding(12.dp)) {
                            Text("Оптимизатор нашёл порядок короче на ${Format.minutes(s.gainMin.toInt())}", fontWeight = FontWeight.SemiBold)
                            Text(s.best.order.joinToString(" → ") { it.name }, style = MaterialTheme.typography.bodySmall)
                            Text("Порядок экскурсовода оставлен: в нём история идёт слоями. Решайте сами.", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
            state.yandexUrl?.let { url ->
                item {
                    SectionTitle("Построить в Яндекс Картах")
                    Text(
                        "Все точки маршрута одной ссылкой, по порядку. Если стоят Яндекс Карты — откроется приложение.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    OutlinedButton(onClick = { context.openUrl(url) }) { Text("Открыть в Яндекс Картах") }
                }
            }
            item {
                SectionTitle("Вести в Google Maps")
                Text(
                    "Google принимает до 9 промежуточных точек, поэтому маршрут разбит на блоки.",
                    style = MaterialTheme.typography.bodySmall,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.blocks.forEach { b ->
                        OutlinedButton(onClick = { context.openUrl(b.url) }) {
                            Text(if (state.blocks.size == 1) "Весь маршрут" else "Блок ${b.index}: точки ${b.fromIndex}–${b.toIndex}")
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(checked = state.walking, onCheckedChange = vm::setWalking)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Пешеходный режим — если карты не строят велосипедный маршрут в этом регионе (действует и для Яндекса)",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            item { SectionTitle("Точки маршрута") }
            itemsIndexed(dest.stops, key = { _, s -> s.id }) { i, stop ->
                val eta = state.timing?.stops?.getOrNull(i)
                StopRow(
                    number = i + 1,
                    name = stop.name,
                    kind = stop.kind,
                    optional = stop.optional,
                    visited = stop.id in state.visited,
                    eta = eta,
                    onClick = { onOpenStop(dest.id, stop.id) },
                )
            }
            item {
                SectionTitle("Свои правки")
                Text(
                    "Если точка стоит не там — откройте её и нажмите «Поправить координаты». " +
                        "Можно добавить и свою точку: она встанет в маршрут, а ссылки на карты учтут её.",
                    style = MaterialTheme.typography.bodySmall,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onEditPoint(dest.id, "new") }) { Text("Добавить свою точку") }
                    if (dest.stops.size > 1) OutlinedButton(onClick = { onReorder(dest.id) }) { Text("Поменять порядок точек") }
                    TextButton(onClick = { onEditPoint(dest.id, "start") }) { Text("Поправить старт") }
                    TextButton(onClick = { onEditPoint(dest.id, "end") }) { Text("Поправить финиш") }
                    if (EditApplier.isUserPlace(dest.id)) TextButton(onClick = { confirmDeletePlace = true }) { Text("Удалить своё место") }
                }
                if (EditApplier.isUserPlace(dest.id) && dest.stops.isEmpty()) {
                    Text(
                        "В этом месте пока нет точек — добавьте хотя бы одну, и маршрут появится.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            item { DishCard(dest) }
            item { TitleCard(dest, state.pairMode, state.progress?.complete == true) }
            item {
                SectionTitle("Источники")
                dest.sources.forEach { s ->
                    TextButton(onClick = { context.openUrl(s.url) }) { Text(s.title) }
                }
                if (dest.lastChecked.isNotBlank()) {
                    Text("Сведения проверены: ${dest.lastChecked}", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Header(dest: Destination, state: PlaceUiState) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(dest.name, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            if (dest.mustHave >= 2) Text("  ${Format.stars(dest.mustHave)}", color = StarGold, style = MaterialTheme.typography.headlineSmall)
        }
        Text(
            "${dest.settlementType} · ${state.regionName} · ${Format.km(dest.distanceFromKremlinKm)} от Кремля",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        state.progress?.let { p ->
            Text(
                if (p.complete) "Место пройдено — звание получено"
                else "Пройдено точек: ${p.requiredVisited + p.optionalVisited} из ${p.required + p.optional}",
                color = if (p.complete) ProgressGreen else MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun TimingCard(state: PlaceUiState, onDate: (LocalDate) -> Unit, onTime: (LocalTime) -> Unit) {
    val context = LocalContext.current
    val t = state.timing ?: return
    val fmt = DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale("ru"))
    Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text("Успеваю до заката?", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AssistChip(onClick = {
                    DatePickerDialog(context, { _, y, m, d -> onDate(LocalDate.of(y, m + 1, d)) },
                        state.date.year, state.date.monthValue - 1, state.date.dayOfMonth).show()
                }, label = { Text(state.date.format(fmt)) })
                AssistChip(onClick = {
                    TimePickerDialog(context, { _, h, m -> onTime(LocalTime.of(h, m)) }, state.start.hour, state.start.minute, true).show()
                }, label = { Text("старт ${RouteTiming.fmt(t.startMin)}") })
            }
            val sunset = t.sunsetMin
            Text(
                "Финиш около ${RouteTiming.fmt(t.finishMin)}" + (sunset?.let { ", закат в ${RouteTiming.fmt(it)}" } ?: ""),
                style = MaterialTheme.typography.bodyMedium,
            )
            val margin = t.marginMin
            if (margin != null) {
                Text(
                    if (margin >= 0) "Успеваете, запас ${Format.minutes(margin)}" else "Не успеваете на ${Format.minutes(-margin)} — начните раньше или сократите",
                    color = if (margin >= 0) ProgressGreen else MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Text(
                "Оценка: ${Format.km(t.rideKm)} в седле при средней скорости из настроек плюс время на точках.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

fun issueText(i: RouteTiming.Issue): String = when (i) {
    RouteTiming.Issue.CLOSED_THAT_DAY -> "в этот день закрыто — смотрим снаружи"
    RouteTiming.Issue.WAIT_FOR_OPENING -> "придётся подождать открытия"
    RouteTiming.Issue.CLOSES_BEFORE_ARRIVAL -> "закроется до приезда"
    RouteTiming.Issue.AFTER_SUNSET -> "приедете после заката"
    RouteTiming.Issue.BY_APPOINTMENT -> "вход по записи"
}

@Composable
fun StopRow(
    number: Int, name: String, kind: String, optional: Boolean, visited: Boolean,
    eta: RouteTiming.StopEta?, onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (visited) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked, null,
            tint = if (visited) ProgressGreen else MaterialTheme.colorScheme.outline,
        )
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text("$number. $name", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Text(
                kind + (if (optional) " · по желанию" else "") + (eta?.let { " · ~${RouteTiming.fmt(it.arriveMin)}" } ?: ""),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            eta?.issues?.forEach { Text(issueText(it), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error) }
        }
    }
}

@Composable
private fun DishCard(dest: Destination) {
    val context = LocalContext.current
    val dish = dest.dish
    SectionTitle("Вкус места")
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(dish.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(dish.kind, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary)
            dish.honestyNote?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, modifier = Modifier.padding(vertical = 6.dp))
            }
            Paragraphs(dish.story)
            if (dish.whereToBuy.isNotEmpty()) {
                Text("Где купить", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 10.dp))
                dish.whereToBuy.forEach { shop ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(shop.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                            Text(shop.address, style = MaterialTheme.typography.bodySmall)
                            if (shop.note.isNotBlank()) Text(shop.note, style = MaterialTheme.typography.labelSmall)
                            VerifiedMark(shop.verified)
                        }
                        shop.coords?.let { c ->
                            IconButton(onClick = { context.openInMaps(c, shop.name) }) { Icon(Icons.Filled.Place, "На карте") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TitleCard(dest: Destination, pairMode: Boolean, earned: Boolean) {
    val t = dest.title
    SectionTitle("Звание")
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = if (earned) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (pairMode) t.pairVariant else t.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(if (earned) "Получено" else "Выдаётся, когда пройдены все обязательные точки", style = MaterialTheme.typography.labelMedium)
            Text(t.legend)
            Text("Ритуал: ${t.ritual}", fontWeight = FontWeight.Medium)
            Text("Для двоих: «${t.pairVariant}»", style = MaterialTheme.typography.bodySmall)
            t.bonusVariant?.let { Text("Бонус за все точки, включая необязательные: «$it»", style = MaterialTheme.typography.bodySmall) }
        }
    }
}
