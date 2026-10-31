package ru.velopodmoskovye.data.content

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import ru.velopodmoskovye.data.edit.EditsRepository
import ru.velopodmoskovye.domain.edit.EditApplier
import ru.velopodmoskovye.domain.edit.UserEdits
import ru.velopodmoskovye.domain.model.ContentManifest
import ru.velopodmoskovye.domain.model.Destination
import ru.velopodmoskovye.domain.model.Region
import ru.velopodmoskovye.domain.model.SpiralPlace
import ru.velopodmoskovye.domain.spiral.SpiralBuilder
import ru.velopodmoskovye.domain.model.SpiralPack
import javax.inject.Inject
import javax.inject.Singleton

/** Весь контент-пак в памяти: он небольшой и нужен почти на каждом экране. */
data class ContentPack(
    val manifest: ContentManifest,
    val spiral: SpiralPack,
    val destinations: Map<String, Destination>,
) {
    val regionNames: Map<String, String> = spiral.regions.associate { it.id to it.name }

    /** Контент с наложенными правками пользователя. */
    fun withEdits(edits: UserEdits): ContentPack {
        if (edits.isEmpty) return this
        val userDest = edits.places.map { EditApplier.destinationFor(it) }
        val dests = (destinations + userDest.associateBy { it.id }).mapValues { (_, d) -> EditApplier.apply(d, edits) }
        if (edits.places.isEmpty()) return copy(destinations = dests)
        // Свои места встают в спираль по тому же правилу: кольцо по расстоянию от Кремля, внутри — по часовой.
        val userPlaces = edits.places.map { p ->
            SpiralPlace(
                id = p.id, num = 0, name = p.name, kindNote = "своё место", regionId = EditApplier.USER_REGION,
                mustHave = 1, coords = p.coords, distanceFromKremlinKm = 0.0, azimuthDeg = 0.0, ring = 0, destinationId = p.id,
            )
        }
        val nodes = SpiralBuilder.build(spiral.places + userPlaces, coords = { it.coords }, isStart = { it.start }, insideMkad = { it.insideMkad })
        val places = nodes.map { n ->
            n.item.copy(
                num = n.order,
                ring = n.ring,
                distanceFromKremlinKm = Math.round(n.distanceKm * 10) / 10.0,
                azimuthDeg = Math.round(n.azimuthDeg * 10) / 10.0,
            ).let { if (EditApplier.isUserPlace(it.id)) it else n.item }
        }
        val regions = if (spiral.regions.any { it.id == EditApplier.USER_REGION }) spiral.regions
        else spiral.regions + Region(EditApplier.USER_REGION, "Мои места", "своё")
        return copy(spiral = spiral.copy(places = places, regions = regions), destinations = dests)
    }
}

object ContentParser {
    val json = Json { ignoreUnknownKeys = true }

    /** [read] получает путь внутри пака, например "destinations/reutov.json". */
    fun parse(read: (String) -> String): ContentPack {
        val manifest = json.decodeFromString<ContentManifest>(read("manifest.json"))
        val spiral = json.decodeFromString<SpiralPack>(read(manifest.spiral))
        val destinations = manifest.destinations.associate { file ->
            val d = json.decodeFromString<Destination>(read("destinations/$file"))
            d.id to d.copy(stops = d.stops.sortedBy { it.order })
        }
        return ContentPack(manifest, spiral, destinations)
    }
}

@Singleton
class ContentRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val edits: EditsRepository,
) {
    private val mutex = Mutex()
    @Volatile private var cache: ContentPack? = null

    /** Контент-пак с правками пользователя; обновляется, когда правки меняются. */
    val packs: Flow<ContentPack> = combine(flow { emit(base()) }, edits.edits) { pack, e -> pack.withEdits(e) }

    /** Текущий контент с правками пользователя. */
    suspend fun pack(): ContentPack = packs.first()

    /** Контент как в APK, без правок. */
    suspend fun base(): ContentPack = cache ?: mutex.withLock {
        cache ?: withContext(Dispatchers.IO) {
            ContentParser.parse { path -> context.assets.open(path).bufferedReader(Charsets.UTF_8).use { it.readText() } }
        }.also { cache = it }
    }
}
