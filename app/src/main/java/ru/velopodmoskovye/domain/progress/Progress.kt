package ru.velopodmoskovye.domain.progress

import ru.velopodmoskovye.domain.edit.EditApplier
import ru.velopodmoskovye.domain.model.Destination
import ru.velopodmoskovye.domain.model.SpiralPack
import ru.velopodmoskovye.domain.spiral.SpiralBuilder

data class DestinationProgress(
    val destinationId: String,
    val required: Int,
    val requiredVisited: Int,
    val optional: Int,
    val optionalVisited: Int,
) {
    val complete: Boolean get() = required > 0 && requiredVisited == required
    val bonus: Boolean get() = complete && optional > 0 && optionalVisited == optional
    val started: Boolean get() = requiredVisited + optionalVisited > 0
    val fraction: Float get() = if (required + optional == 0) 0f else (requiredVisited + optionalVisited).toFloat() / (required + optional)
}

enum class TitleKind { PLACE, PLACE_BONUS, REGION, RING, STARS, SPIRAL, SUPERLATIVE }

data class EarnedTitle(val id: String, val kind: TitleKind, val name: String, val description: String)

/** Сводная статистика для экрана «Звания и статистика». */
data class Stats(
    val placesTotal: Int,
    val placesWithContent: Int,
    val placesComplete: Int,
    val regionsTotal: Int,
    val regionsComplete: Int,
    val stopsVisited: Int,
    val routeKmComplete: Double,
    val openedAreaKm2: Double,
) {
    val openedShare: Double get() = openedAreaKm2 / MOSCOW_AND_OBLAST_KM2

    companion object {
        /** Москва (~2 561 км²) + Московская область (~44 329 км²). */
        const val MOSCOW_AND_OBLAST_KM2 = 46_890.0
    }
}

object ProgressCalculator {
    fun destination(dest: Destination, visitedStopIds: Set<String>): DestinationProgress {
        val req = dest.stops.filter { !it.optional }
        val opt = dest.stops.filter { it.optional }
        return DestinationProgress(
            dest.id,
            req.size, req.count { it.id in visitedStopIds },
            opt.size, opt.count { it.id in visitedStopIds },
        )
    }

    /** Все звания, которые заработаны при текущих посещениях. */
    fun earnedTitles(
        spiral: SpiralPack,
        destinations: Map<String, Destination>,
        visitedStopIds: Set<String>,
    ): List<EarnedTitle> {
        val result = mutableListOf<EarnedTitle>()
        val completePlaceIds = mutableSetOf<String>()
        for (place in spiral.places) {
            val dest = place.destinationId?.let { destinations[it] } ?: continue
            val p = destination(dest, visitedStopIds)
            if (p.complete) {
                completePlaceIds += place.id
                result += EarnedTitle("place:${dest.id}", TitleKind.PLACE, dest.title.name, dest.title.legend)
            }
            if (p.bonus && dest.title.bonusVariant != null) {
                result += EarnedTitle("bonus:${dest.id}", TitleKind.PLACE_BONUS, dest.title.bonusVariant, "Все точки места, включая необязательные: ${dest.name}")
            }
        }
        // Свои места не входят в мета-звания: «вся спираль», кольца и округа — по общей спирали.
        val route = spiral.places.filterNot { EditApplier.isUserPlace(it.id) }
        for (region in spiral.regions) {
            val places = route.filter { it.regionId == region.id }
            if (places.isNotEmpty() && places.all { it.id in completePlaceIds }) {
                result += EarnedTitle("region:${region.id}", TitleKind.REGION, "Знаток округа «${region.name}»", "Пройдены все места округа: ${places.size}")
            }
        }
        for (ring in spiral.rings) {
            val places = route.filter { it.ring == ring.index }
            if (places.isNotEmpty() && places.all { it.id in completePlaceIds }) {
                result += EarnedTitle("ring:${ring.index}", TitleKind.RING, "Покоритель кольца «${ring.name}»", "Пройдены все места кольца: ${places.size}")
            }
        }
        val stars = route.filter { it.mustHave == 3 }
        if (stars.isNotEmpty() && stars.all { it.id in completePlaceIds }) {
            result += EarnedTitle("stars", TitleKind.STARS, "Собиратель звёзд", "Пройдены все обязательные места ★: ${stars.size}")
        }
        if (route.isNotEmpty() && route.all { it.id in completePlaceIds }) {
            result += EarnedTitle("spiral", TitleKind.SPIRAL, "Велопаломник Подмосковья", "Вся спираль пройдена — от ЦАО до самого дальнего места области")
        }
        for (s in spiral.superlatives) {
            if (s.placeId != null && s.placeId in completePlaceIds) {
                result += EarnedTitle("superlative:${s.id}", TitleKind.SUPERLATIVE, s.title, s.note)
            }
        }
        return result
    }

    fun ringName(index: Int): String = SpiralBuilder.RING_NAMES.getOrElse(index) { "кольцо ${index + 1}" }
}
