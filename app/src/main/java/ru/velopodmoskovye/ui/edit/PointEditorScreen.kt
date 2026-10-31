package ru.velopodmoskovye.ui.edit

import android.Manifest
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
import ru.velopodmoskovye.data.location.LocationTracker
import ru.velopodmoskovye.domain.edit.CoordParser
import ru.velopodmoskovye.domain.edit.EditApplier
import ru.velopodmoskovye.domain.edit.StopMove
import ru.velopodmoskovye.domain.edit.UserPlace
import ru.velopodmoskovye.domain.edit.UserStop
import ru.velopodmoskovye.domain.geo.Geo
import ru.velopodmoskovye.domain.model.Destination
import ru.velopodmoskovye.domain.model.GeoPoint
import ru.velopodmoskovye.ui.common.openUrl
import ru.velopodmoskovye.ui.map.MapData
import ru.velopodmoskovye.ui.map.MapLibreView
import java.util.Locale
import javax.inject.Inject

data class EditorUiState(
    val loading: Boolean = true,
    val destination: Destination? = null,
    /** Исходная точка из контента (для «вернуть как было» и расстояния сдвига). */
    val original: GeoPoint? = null,
    /** Текущие координаты точки (с учётом прошлых правок). */
    val current: GeoPoint? = null,
    val name: String = "",
    val isNew: Boolean = false,
    val isUserStop: Boolean = false,
    val hasMove: Boolean = false,
)

@HiltViewModel
class PointEditorViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val content: ContentRepository,
    private val edits: EditsRepository,
    private val tracker: LocationTracker,
) : ViewModel() {
    val destId: String = checkNotNull(savedState["destId"])
    val stopId: String = checkNotNull(savedState["stopId"])
    val isNewPlace = destId == NEW_PLACE
    val isNew = stopId == NEW || isNewPlace

    val state: StateFlow<EditorUiState> = combine(content.packs, edits.edits) { pack, e ->
        if (isNewPlace) {
            val here = tracker.last.value?.point ?: Geo.KREMLIN
            val draft = EditApplier.destinationFor(UserPlace(NEW_PLACE, "Новое место", here, "", 0L))
            return@combine EditorUiState(false, draft, null, here, "", isNew = true)
        }
        val dest = pack.destinations[destId] ?: return@combine EditorUiState(loading = false)
        if (isNew) return@combine EditorUiState(false, dest, null, dest.coords, "", isNew = true)
        val base = content.base().destinations[destId]
        val (name, cur, orig) = when (stopId) {
            EditApplier.START -> Triple("Старт: ${dest.startPoint.name}", dest.startPoint.coords, base?.startPoint?.coords)
            EditApplier.END -> Triple("Финиш: ${dest.endPoint.name}", dest.endPoint.coords, base?.endPoint?.coords)
            else -> {
                val s = dest.stops.firstOrNull { it.id == stopId }
                Triple(s?.name ?: "", s?.coords, base?.stops?.firstOrNull { it.id == stopId }?.coords)
            }
        }
        EditorUiState(
            loading = false,
            destination = dest,
            original = orig,
            current = cur,
            name = name,
            isUserStop = EditApplier.isUserStop(stopId),
            hasMove = e.moveFor(destId, stopId) != null,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), EditorUiState())

    suspend fun myLocation(): GeoPoint? = if (tracker.hasPermission()) tracker.current()?.point ?: tracker.last.value?.point else null

    /** [done] получает id созданного места, если создавали место. */
    fun save(point: GeoPoint, name: String, note: String, done: (String?) -> Unit) = viewModelScope.launch {
        val now = System.currentTimeMillis()
        if (isNewPlace) {
            val id = EditApplier.PLACE_PREFIX + now
            edits.addPlace(UserPlace(id, name.trim(), point, note.trim(), now))
            done(id)
            return@launch
        }
        if (isNew) {
            edits.add(UserStop(destId, EditApplier.USER_PREFIX + now, name.trim(), point, note.trim(), now))
        } else {
            edits.move(StopMove(destId, stopId, point, now, state.value.name))
        }
        done(null)
    }

    fun resetMove(done: () -> Unit) = viewModelScope.launch { edits.resetMove(destId, stopId); done() }
    fun deleteUserStop(done: () -> Unit) = viewModelScope.launch { edits.removeAdded(destId, stopId); done() }

    companion object {
        const val NEW = "new"
        /** destId для создания своего места. */
        const val NEW_PLACE = "new-place"
    }
}

private fun fmt(p: GeoPoint) = String.format(Locale.US, "%.6f, %.6f", p.lat, p.lon)

/** Ссылка, чтобы посмотреть место в Яндекс Картах (там удобно найти здание и скопировать координаты). */
private fun yandexAt(p: GeoPoint) = String.format(Locale.US, "https://yandex.ru/maps/?pt=%.6f,%.6f&z=18&l=map", p.lon, p.lat)

private fun Context.clipboardText(): String? =
    (getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.primaryClip?.takeIf { it.itemCount > 0 }
        ?.getItemAt(0)?.coerceToText(this)?.toString()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PointEditorScreen(
    onBack: () -> Unit,
    onPlaceCreated: (String) -> Unit = { onBack() },
    vm: PointEditorViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val dest = state.destination

    var center by remember { mutableStateOf<GeoPoint?>(null) }
    var moveTo by remember { mutableStateOf<GeoPoint?>(null) }
    var pasted by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var name by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }

    LaunchedEffect(state.current) {
        if (moveTo == null) state.current?.let { moveTo = it; center = it }
    }

    fun goTo(p: GeoPoint, why: String) {
        moveTo = p.copy()
        center = p
        message = why
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.any { it }) {
            scope.launch {
                val here = vm.myLocation()
                if (here != null) goTo(here, "Перекрестие поставлено на ваше местоположение.")
                else message = "Не удалось определить местоположение."
            }
        } else {
            message = "Без доступа к геолокации эта кнопка не работает."
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (vm.isNewPlace) "Новое место" else if (vm.isNew) "Новая точка" else "Поправить координаты") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
            )
        },
    ) { padding ->
        if (dest == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                if (state.loading) CircularProgressIndicator() else Text("Место не найдено")
            }
            return@Scaffold
        }
        Column(Modifier.fillMaxSize().padding(padding)) {
            Box(Modifier.fillMaxWidth().height(320.dp)) {
                val layers = remember(dest) { MapData.routeLayers(dest, emptySet(), prefix = "edit") }
                MapLibreView(
                    layers = layers,
                    modifier = Modifier.fillMaxSize(),
                    initialCenter = state.current ?: dest.coords,
                    initialZoom = 16.0,
                    onCameraIdle = { center = it },
                    moveTo = moveTo,
                )
                // Перекрестие: точка встаёт в центр карты.
                Icon(Icons.Filled.Add, "Перекрестие", Modifier.align(Alignment.Center).size(40.dp), tint = Color(0xFFD32F2F))
            }
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(if (vm.isNewPlace) "Своё место в спирали" else if (vm.isNew) "Новая точка в «${dest.name}»" else state.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    "Двигайте карту, чтобы перекрестие встало точно на объект. Или найдите место в Яндекс Картах, " +
                        "долгим нажатием возьмите координаты, скопируйте и вставьте сюда.",
                    style = MaterialTheme.typography.bodySmall,
                )
                center?.let { c ->
                    Text("Перекрестие: ${fmt(c)}", style = MaterialTheme.typography.bodyMedium)
                    state.original?.let { o ->
                        val m = Geo.distanceKm(o, c) * 1000
                        if (m >= 1) Text("Сдвиг от исходной точки: ${m.toInt()} м", style = MaterialTheme.typography.labelMedium)
                    }
                }
                message?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { context.openUrl(yandexAt(center ?: dest.coords)) }) { Text("Найти в Яндекс Картах") }
                    OutlinedButton(onClick = {
                        permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                    }) { Text("Я здесь") }
                }
                OutlinedTextField(
                    value = pasted,
                    onValueChange = { pasted = it },
                    label = { Text("Координаты или ссылка на карту") },
                    placeholder = { Text("55.751244, 37.618423") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        val clip = context.clipboardText().orEmpty()
                        pasted = clip
                        val p = CoordParser.parse(clip)
                        if (p != null) goTo(p, "Координаты из буфера обмена применены.") else message = "В буфере обмена нет координат."
                    }) { Text("Вставить из буфера") }
                    OutlinedButton(onClick = {
                        val p = CoordParser.parse(pasted)
                        if (p != null) goTo(p, "Координаты применены.") else message = "Не понял координаты. Пример: 55.751244, 37.618423"
                    }) { Text("Применить") }
                }

                if (vm.isNew) {
                    OutlinedTextField(name, { name = it }, label = { Text(if (vm.isNewPlace) "Название места" else "Название точки") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(note, { note = it }, label = { Text(if (vm.isNewPlace) "О месте (необязательно)" else "Заметка (необязательно)") }, modifier = Modifier.fillMaxWidth())
                    Text(
                        when {
                            vm.isNewPlace -> "Перекрестие — центр места: здесь старт и финиш маршрута. Место встанет в спираль по своему кольцу, а точки вы добавите на его экране."
                            EditApplier.isUserPlace(vm.destId) -> "Точка встанет в маршрут там, где меньше всего его удлинит; порядок можно поменять. В своём месте все точки нужны для звания."
                            else -> "Своя точка встанет в маршрут там, где меньше всего его удлинит. Она необязательная: звание места можно получить и без неё."
                        },
                        style = MaterialTheme.typography.bodySmall,
                    )
                }

                val far = !vm.isNewPlace && center?.let { c -> Geo.distanceKm(dest.coords, c) > 30 } == true
                if (far) Text("Перекрестие дальше 30 км от места — проверьте, туда ли вы попали.", color = MaterialTheme.colorScheme.error)
                Button(
                    enabled = center != null && (!vm.isNew || name.isNotBlank()),
                    onClick = { center?.let { vm.save(it, name, note) { id -> if (id != null) onPlaceCreated(id) else onBack() } } },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (vm.isNewPlace) "Создать место" else if (vm.isNew) "Добавить точку" else "Сохранить координаты") }
                if (state.hasMove) TextButton(onClick = { vm.resetMove(onBack) }) { Text("Вернуть исходные координаты") }
                if (state.isUserStop) TextButton(onClick = { confirmDelete = true }) { Text("Удалить свою точку") }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Удалить точку?") },
            text = { Text("Своя точка «${state.name}» исчезнет из маршрута.") },
            confirmButton = { TextButton(onClick = { confirmDelete = false; vm.deleteUserStop(onBack) }) { Text("Удалить") } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Отмена") } },
        )
    }
}
