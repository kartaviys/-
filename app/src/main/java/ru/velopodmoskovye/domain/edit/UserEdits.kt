package ru.velopodmoskovye.domain.edit

import kotlinx.serialization.Serializable
import ru.velopodmoskovye.domain.geo.Geo
import ru.velopodmoskovye.domain.model.Destination
import ru.velopodmoskovye.domain.model.Dish
import ru.velopodmoskovye.domain.model.GeoPoint
import ru.velopodmoskovye.domain.model.RouteInfo
import ru.velopodmoskovye.domain.model.RoutePoint
import ru.velopodmoskovye.domain.model.Stop
import ru.velopodmoskovye.domain.model.Title

/**
 * Правки, которые пользователь сделал сам: поправленные координаты точек и свои новые точки.
 * Хранятся на телефоне отдельно от контент-пака и накладываются на него при каждом чтении,
 * поэтому обновление приложения их не стирает.
 */
@Serializable
data class UserEdits(
    val version: Int = 1,
    val moves: List<StopMove> = emptyList(),
    val added: List<UserStop> = emptyList(),
    /** Свой порядок точек внутри места. */
    val orders: List<StopOrder> = emptyList(),
    /** Свои новые места спирали. */
    val places: List<UserPlace> = emptyList(),
) {
    val isEmpty: Boolean get() = moves.isEmpty() && added.isEmpty() && orders.isEmpty() && places.isEmpty()
    val count: Int get() = moves.size + added.size + orders.size + places.size

    fun orderFor(destinationId: String): StopOrder? = orders.firstOrNull { it.destinationId == destinationId }

    fun withOrder(o: StopOrder): UserEdits = copy(orders = orders.filterNot { it.destinationId == o.destinationId } + o)

    fun withoutOrder(destinationId: String): UserEdits = copy(orders = orders.filterNot { it.destinationId == destinationId })

    fun withPlace(p: UserPlace): UserEdits = copy(places = places.filterNot { it.id == p.id } + p)

    /** Удаляем место вместе со всеми его правками. */
    fun withoutPlace(id: String): UserEdits = copy(
        places = places.filterNot { it.id == id },
        added = added.filterNot { it.destinationId == id },
        moves = moves.filterNot { it.destinationId == id },
        orders = orders.filterNot { it.destinationId == id },
    )

    fun moveFor(destinationId: String, stopId: String): StopMove? =
        moves.firstOrNull { it.destinationId == destinationId && it.stopId == stopId }

    fun withMove(m: StopMove): UserEdits {
        // Свою точку правим прямо в списке добавленных.
        if (added.any { it.destinationId == m.destinationId && it.id == m.stopId }) {
            return copy(added = added.map { if (it.destinationId == m.destinationId && it.id == m.stopId) it.copy(coords = m.coords) else it })
        }
        return copy(moves = moves.filterNot { it.destinationId == m.destinationId && it.stopId == m.stopId } + m)
    }

    fun withoutMove(destinationId: String, stopId: String): UserEdits =
        copy(moves = moves.filterNot { it.destinationId == destinationId && it.stopId == stopId })

    fun withAdded(s: UserStop): UserEdits = copy(added = added.filterNot { it.destinationId == s.destinationId && it.id == s.id } + s)

    fun withoutAdded(destinationId: String, id: String): UserEdits =
        copy(added = added.filterNot { it.destinationId == destinationId && it.id == id })
}

/** Новые координаты точки маршрута; stopId "start" и "end" — старт и финиш. */
@Serializable
data class StopMove(
    val destinationId: String,
    val stopId: String,
    val coords: GeoPoint,
    val editedAt: Long,
    /** Название на момент правки — чтобы выгрузка была понятна человеку. */
    val name: String = "",
)

/** Порядок точек места: id точек от первой к последней. */
@Serializable
data class StopOrder(val destinationId: String, val stopIds: List<String>, val editedAt: Long = 0)

/** Своё место спирали: центр и название; точки в него добавляются как обычные свои точки. */
@Serializable
data class UserPlace(
    val id: String,
    val name: String,
    val coords: GeoPoint,
    val note: String = "",
    val createdAt: Long,
)

@Serializable
data class UserStop(
    val destinationId: String,
    val id: String,
    val name: String,
    val coords: GeoPoint,
    val note: String = "",
    val createdAt: Long,
)

object EditApplier {
    const val START = "start"
    const val END = "end"
    const val USER_PREFIX = "user-"

    const val PLACE_PREFIX = "user-place-"
    const val USER_REGION = "user"

    fun isUserStop(stopId: String) = stopId.startsWith(USER_PREFIX)
    fun isUserPlace(id: String) = id.startsWith(PLACE_PREFIX)

    fun apply(dest: Destination, edits: UserEdits): Destination {
        val moves = edits.moves.filter { it.destinationId == dest.id }.associateBy { it.stopId }
        val added = edits.added.filter { it.destinationId == dest.id }
        val order = edits.orderFor(dest.id)
        if (moves.isEmpty() && added.isEmpty() && order == null && !isUserPlace(dest.id)) return dest
        // В своём месте свои точки обязательны: иначе звание выдавалось бы без единой отметки.
        val required = isUserPlace(dest.id)

        fun RoutePoint.moved(key: String) = moves[key]?.let { copy(coords = it.coords) } ?: this
        val start = dest.startPoint.moved(START)
        val end = dest.endPoint.moved(END)
        var stops = dest.stops.sortedBy { it.order }.map { s ->
            moves[s.id]?.let { s.copy(coords = it.coords, coordsVerified = true) } ?: s
        }
        val addedStops = added.sortedBy { it.createdAt }.map { toStop(it, required) }
        if (order != null) {
            // Сначала порядок пользователя; точки, которых в нём нет (добавлены позже), — туда, где меньше удлиняют маршрут.
            val all = (stops + addedStops).associateBy { it.id }
            val ordered = order.stopIds.mapNotNull { all[it] }
            stops = ordered
            for (s in (all.values - ordered.toSet())) stops = insertCheapest(start.coords, end.coords, stops, s)
        } else {
            for (s in addedStops) stops = insertCheapest(start.coords, end.coords, stops, s)
        }
        val out = dest.copy(
            startPoint = start,
            endPoint = end,
            stops = stops.mapIndexed { i, s -> s.copy(order = i + 1) },
        )
        return if (isUserPlace(dest.id)) withRouteLength(out) else out
    }

    /** Длина своего маршрута: по прямой между точками с запасом на извилистость дорог. */
    fun withRouteLength(d: Destination): Destination {
        val pts = listOf(d.startPoint.coords) + d.stops.map { it.coords } + d.endPoint.coords
        val km = Math.round(pts.zipWithNext { a, b -> Geo.distanceKm(a, b) }.sum() * 1.35 * 10) / 10.0
        val hours = Math.round((km / 12 + d.stops.sumOf { it.visitMinutes } / 60.0) * 10) / 10.0
        return d.copy(route = d.route.copy(distanceKm = km, durationH = hours))
    }

    /** Заготовка маршрута для своего места: старт и финиш в центре, точки добавляет пользователь. */
    fun destinationFor(p: UserPlace): Destination {
        val center = RoutePoint("${p.name}, центр", p.coords, "своим ходом")
        return Destination(
            id = p.id,
            name = p.name,
            settlementType = "своё место",
            mustHave = 1,
            regionId = USER_REGION,
            distanceFromKremlinKm = Math.round(Geo.distanceKm(Geo.KREMLIN, p.coords) * 10) / 10.0,
            coords = p.coords,
            intro = listOf(p.note.ifBlank { "Это место вы добавили сами. Добавьте в него точки — из них сложится маршрут." }),
            startPoint = center,
            endPoint = center,
            route = RouteInfo(
                distanceKm = 0.0,
                durationH = 0.0,
                difficulty = "лёгкий",
                shape = "петля",
                surfaceNotes = "",
                seasonNotes = "",
                safetyNotes = "Маршрут составлен вами — дорогу прокладывает навигатор.",
            ),
            stops = emptyList(),
            dish = Dish("Перекус в дорогу", "тематическая замена", "Своё место: блюдо не подобрано.", listOf("Возьмите с собой воду и перекус."), emptyList()),
            title = Title(
                id = p.id,
                name = "Первопроходец: ${p.name}",
                legend = "Проложил свой маршрут и прошёл все его точки.",
                ritual = "Сфотографироваться у первой точки.",
                pairVariant = "Первопроходцы: ${p.name}",
            ),
            sources = emptyList(),
            routeVersion = 3,
        )
    }

    fun toStop(u: UserStop, required: Boolean = false) = Stop(
        id = u.id,
        order = 0,
        name = u.name,
        coords = u.coords,
        coordsVerified = true,
        kind = "смотреть снаружи",
        // В чужом месте своя точка не мешает получить звание; в своём — обязательна.
        optional = !required,
        visitMinutes = 15,
        guideStory = listOf(u.note.ifBlank { "Эту точку вы добавили сами." }),
        facts = emptyList(),
    )

    /** Вставляем точку туда, где она меньше всего удлиняет маршрут. */
    fun insertCheapest(start: GeoPoint, end: GeoPoint, stops: List<Stop>, stop: Stop): List<Stop> {
        val pts = listOf(start) + stops.map { it.coords } + end
        var best = 0
        var bestCost = Double.MAX_VALUE
        for (i in 0 until pts.size - 1) {
            val cost = Geo.distanceKm(pts[i], stop.coords) + Geo.distanceKm(stop.coords, pts[i + 1]) - Geo.distanceKm(pts[i], pts[i + 1])
            if (cost < bestCost) {
                bestCost = cost
                best = i
            }
        }
        return stops.take(best) + stop + stops.drop(best)
    }
}

/**
 * Координаты из того, что пользователь скопировал: «55.75, 37.61», «55,75 37,61», «55.75° N, 37.61° E»,
 * ссылка Яндекс Карт (ll= / pt= / whatshere — там сначала долгота) или Google Maps (@lat,lon / q=lat,lon).
 */
object CoordParser {
    private const val NUM = """-?\d{1,3}(?:[.,]\d+)?"""
    private const val SEP = """(?:,|%2C)"""
    /** В ссылках Яндекса сначала долгота; метка (pt, whatshere) важнее центра карты (ll). */
    private val yandex = listOf("""whatshere(?:%5B|\[)point(?:%5D|])""", "pt", "ll")
        .map { Regex("""[?&]$it=($NUM)$SEP($NUM)""", RegexOption.IGNORE_CASE) }
    private val googleAt = Regex("""@($NUM),($NUM)""")
    private val googleQ = Regex("""[?&](?:q|query|ll|destination)=($NUM)$SEP($NUM)""")
    private val plainDot = Regex("""(?<![\d.,])(-?\d{1,3}\.\d+)\s*°?\s*[NnСс]?\s*[,;\s]\s*(-?\d{1,3}\.\d+)(?![\d.])""")
    private val plainComma = Regex("""(?<![\d.,])(-?\d{1,3},\d+)\s*°?\s*[NnСс]?\s*[;\s]\s*(-?\d{1,3},\d+)(?![\d,])""")

    fun parse(text: String): GeoPoint? {
        val t = text.trim()
        if (t.isEmpty()) return null
        if (t.contains("yandex", ignoreCase = true) || t.contains("ya.ru")) {
            for (r in yandex) r.find(t)?.let { m -> point(m.groupValues[2], m.groupValues[1])?.let { return it } }
        }
        for (r in listOf(googleAt, googleQ, plainDot, plainComma)) {
            r.find(t)?.let { m -> point(m.groupValues[1], m.groupValues[2])?.let { return it } }
        }
        return null
    }

    private fun point(lat: String, lon: String): GeoPoint? {
        val la = lat.replace(',', '.').toDoubleOrNull() ?: return null
        val lo = lon.replace(',', '.').toDoubleOrNull() ?: return null
        if (la !in -90.0..90.0 || lo !in -180.0..180.0) return null
        return GeoPoint(la, lo)
    }
}
