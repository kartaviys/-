package ru.velopodmoskovye.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.velopodmoskovye.data.content.ContentParser
import ru.velopodmoskovye.domain.edit.CoordParser
import ru.velopodmoskovye.domain.edit.EditApplier
import ru.velopodmoskovye.domain.edit.StopMove
import ru.velopodmoskovye.domain.edit.StopOrder
import ru.velopodmoskovye.domain.edit.UserPlace
import ru.velopodmoskovye.domain.edit.UserEdits
import ru.velopodmoskovye.domain.edit.UserStop
import ru.velopodmoskovye.domain.model.GeoPoint
import java.io.File

class UserEditsTest {
    private val dir = File(System.getProperty("contentDir") ?: "../content/pack")
    private val pack = ContentParser.parse { File(dir, it).readText(Charsets.UTF_8) }
    private val dest = pack.destinations.getValue("kolomna")

    private fun near(a: GeoPoint?, lat: Double, lon: Double) =
        a != null && Math.abs(a.lat - lat) < 1e-6 && Math.abs(a.lon - lon) < 1e-6

    @Test
    fun parsesPlainCoordinates() {
        assertTrue(near(CoordParser.parse("55.751244, 37.618423"), 55.751244, 37.618423))
        assertTrue(near(CoordParser.parse("55.751244 37.618423"), 55.751244, 37.618423))
        assertTrue(near(CoordParser.parse("55,751244 37,618423"), 55.751244, 37.618423))
        assertTrue(near(CoordParser.parse("55.751244° N, 37.618423° E"), 55.751244, 37.618423))
        assertNull(CoordParser.parse("Коломна"))
        assertNull(CoordParser.parse("155.1, 37.6"))
    }

    @Test
    fun parsesMapLinks() {
        // В Яндекс Картах сначала долгота.
        assertTrue(near(CoordParser.parse("https://yandex.ru/maps/?ll=37.618423%2C55.751244&z=17"), 55.751244, 37.618423))
        assertTrue(near(CoordParser.parse("https://yandex.ru/maps/?pt=37.618423,55.751244&z=17"), 55.751244, 37.618423))
        assertTrue(near(CoordParser.parse("https://yandex.ru/maps/?whatshere%5Bpoint%5D=37.618423%2C55.751244&z=17"), 55.751244, 37.618423))
        assertTrue(near(CoordParser.parse("https://www.google.com/maps/@55.751244,37.618423,17z"), 55.751244, 37.618423))
        assertTrue(near(CoordParser.parse("https://www.google.com/maps/search/?api=1&query=55.751244,37.618423"), 55.751244, 37.618423))
    }

    @Test
    fun moveChangesCoordsAndKeepsOrder() {
        val s = dest.stops[1]
        val p = GeoPoint(s.coords.lat + 0.001, s.coords.lon + 0.001)
        val out = EditApplier.apply(dest, UserEdits(moves = listOf(StopMove(dest.id, s.id, p, 1L))))
        val moved = out.stops.first { it.id == s.id }
        assertEquals(p, moved.coords)
        assertTrue(moved.coordsVerified)
        assertEquals(dest.stops.map { it.id }, out.stops.map { it.id })
        // Остальные места не трогаем.
        val other = pack.destinations.getValue("tula")
        assertEquals(other, EditApplier.apply(other, UserEdits(moves = listOf(StopMove(dest.id, s.id, p, 1L)))))
    }

    @Test
    fun startAndEndCanBeMoved() {
        val p = GeoPoint(55.1, 38.75)
        val out = EditApplier.apply(dest, UserEdits(moves = listOf(StopMove(dest.id, EditApplier.START, p, 1L))))
        assertEquals(p, out.startPoint.coords)
        assertEquals(dest.endPoint.coords, out.endPoint.coords)
    }

    @Test
    fun addedStopIsInsertedNearItsNeighbours() {
        val a = dest.stops[1].coords
        val b = dest.stops[2].coords
        val mid = GeoPoint((a.lat + b.lat) / 2, (a.lon + b.lon) / 2)
        val u = UserStop(dest.id, EditApplier.USER_PREFIX + "1", "Моя точка", mid, "", 1L)
        val out = EditApplier.apply(dest, UserEdits(added = listOf(u)))
        assertEquals(dest.stops.size + 1, out.stops.size)
        val i = out.stops.indexOfFirst { it.id == u.id }
        assertEquals(2, i)
        assertTrue(out.stops[i].optional)
        assertEquals((1..out.stops.size).toList(), out.stops.map { it.order })
    }

    @Test
    fun editsListOperations() {
        val m = StopMove(dest.id, "x", GeoPoint(1.0, 2.0), 1L)
        val e = UserEdits().withMove(m).withMove(m.copy(coords = GeoPoint(3.0, 4.0)))
        assertEquals(1, e.moves.size)
        assertEquals(GeoPoint(3.0, 4.0), e.moves[0].coords)
        assertTrue(e.withoutMove(dest.id, "x").isEmpty)
        // Перенос своей точки меняет её саму, а не создаёт отдельную правку.
        val u = UserStop(dest.id, "user-1", "Моя", GeoPoint(1.0, 1.0), "", 1L)
        val e2 = UserEdits().withAdded(u).withMove(StopMove(dest.id, "user-1", GeoPoint(2.0, 2.0), 2L))
        assertTrue(e2.moves.isEmpty())
        assertEquals(GeoPoint(2.0, 2.0), e2.added[0].coords)
        assertFalse(e2.withoutAdded(dest.id, "user-1").count > 0)
    }

    @Test
    fun customOrderIsApplied() {
        val ids = dest.stops.map { it.id }
        val swapped = listOf(ids[1], ids[0]) + ids.drop(2)
        val out = EditApplier.apply(dest, UserEdits(orders = listOf(StopOrder(dest.id, swapped))))
        assertEquals(swapped, out.stops.map { it.id })
        assertEquals((1..ids.size).toList(), out.stops.map { it.order })
        // Точка, добавленная после сохранения порядка, не теряется.
        val u = UserStop(dest.id, EditApplier.USER_PREFIX + "9", "Новая", dest.stops[0].coords, "", 9L)
        val out2 = EditApplier.apply(dest, UserEdits(added = listOf(u), orders = listOf(StopOrder(dest.id, swapped))))
        assertEquals(ids.size + 1, out2.stops.size)
        assertTrue(out2.stops.any { it.id == u.id })
        assertEquals(swapped, out2.stops.map { it.id }.filter { it != u.id })
    }

    @Test
    fun userPlaceJoinsSpiralWithRequiredStops() {
        val place = UserPlace(EditApplier.PLACE_PREFIX + "1", "Моё место", GeoPoint(55.9, 38.5), "", 1L)
        val stop = UserStop(place.id, EditApplier.USER_PREFIX + "2", "Родник", GeoPoint(55.905, 38.505), "", 2L)
        val merged = pack.withEdits(UserEdits(added = listOf(stop), places = listOf(place)))
        assertEquals(pack.spiral.places.size + 1, merged.spiral.places.size)
        val sp = merged.spiral.places.first { it.id == place.id }
        assertEquals(place.id, sp.destinationId)
        assertTrue(sp.ring > 0)
        val d = merged.destinations.getValue(place.id)
        assertEquals(1, d.stops.size)
        assertFalse(d.stops[0].optional)
        assertTrue(d.route.distanceKm > 0)
        // Общая спираль не перемешалась: свои места только вставлены.
        assertEquals(pack.spiral.places.map { it.id }, merged.spiral.places.map { it.id }.filter { it != place.id })
        // Пустое своё место не даёт звание.
        val empty = pack.withEdits(UserEdits(places = listOf(place)))
        assertFalse(ru.velopodmoskovye.domain.progress.ProgressCalculator.destination(empty.destinations.getValue(place.id), emptySet()).complete)
        assertTrue(UserEdits(places = listOf(place), added = listOf(stop)).withoutPlace(place.id).isEmpty)
    }
}
