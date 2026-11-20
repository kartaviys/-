package ru.hhautoapply

import android.content.Context
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Мониторинг скорости: сколько времени уходит на один отклик, отдельно для каждого ресурса (hh, Хабр, LinkedIn, сайты…).
 * Время вакансии — от её открытия до записи результата (проверка, письмо, анкета, отправка, паузы на капчу).
 * «Время работы» включает и пропущенные вакансии — из него считается, сколько откликов выходит в час.
 * Хранится локально по дням (SharedPreferences «timing», ключ t_ГГГГ-ММ-ДД).
 */
object Timing {
    data class Row(
        var applied: Long = 0, var appliedMs: Long = 0, var minMs: Long = 0, var maxMs: Long = 0, var lastMs: Long = 0,
        var all: Long = 0, var allMs: Long = 0,
    ) {
        fun plus(o: Row) = Row(
            applied + o.applied, appliedMs + o.appliedMs,
            listOf(minMs, o.minMs).filter { it > 0 }.minOrNull() ?: 0, maxOf(maxMs, o.maxMs), if (o.lastMs > 0) o.lastMs else lastMs,
            all + o.all, allMs + o.allMs,
        )
        val avgMs get() = if (applied > 0) appliedMs / applied else 0
        val perHour get() = if (allMs > 0) applied * 3_600_000.0 / allMs else 0.0
    }

    private fun sp(ctx: Context) = ctx.getSharedPreferences("timing", Context.MODE_PRIVATE)
    private fun day(date: Date = Date()) = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)

    private fun read(ctx: Context, d: String): MutableMap<String, Row> {
        val o = JSONObject(sp(ctx).getString("t_$d", null) ?: "{}")
        return o.keys().asSequence().associateWith { k ->
            val r = o.getJSONObject(k)
            Row(r.optLong("a"), r.optLong("am"), r.optLong("min"), r.optLong("max"), r.optLong("last"), r.optLong("n"), r.optLong("nm"))
        }.toMutableMap()
    }

    // ---------- замер текущей вакансии ----------
    private var curChannel = ""
    private var curStart = 0L

    /** Начало работы с вакансией. Если предыдущая не была закрыта (пропущена), её время идёт в «время работы». */
    @Synchronized
    fun begin(ctx: Context, channel: String) {
        end(ctx, applied = false)
        curChannel = channel; curStart = System.currentTimeMillis()
    }

    /** Результат по текущей вакансии. Возвращает длительность (мс) или 0, если замера не было. */
    @Synchronized
    fun end(ctx: Context, applied: Boolean): Long {
        if (curStart == 0L) return 0
        val ms = System.currentTimeMillis() - curStart
        add(ctx, curChannel, ms, applied)
        curStart = 0L
        return ms
    }

    @Synchronized
    fun add(ctx: Context, channel: String, ms: Long, applied: Boolean) {
        val d = day()
        val m = read(ctx, d)
        val r = m.getOrPut(channel) { Row() }
        r.all++; r.allMs += ms
        if (applied) {
            r.applied++; r.appliedMs += ms; r.lastMs = ms
            r.minMs = if (r.minMs == 0L) ms else minOf(r.minMs, ms)
            r.maxMs = maxOf(r.maxMs, ms)
        }
        val o = JSONObject()
        for ((k, v) in m) o.put(k, JSONObject().put("a", v.applied).put("am", v.appliedMs).put("min", v.minMs).put("max", v.maxMs)
            .put("last", v.lastMs).put("n", v.all).put("nm", v.allMs))
        sp(ctx).edit().putString("t_$d", o.toString()).apply()
    }

    /** По ресурсам за последние n дней (включая сегодня). */
    fun byChannel(ctx: Context, n: Int): Map<String, Row> {
        val cal = Calendar.getInstance()
        val acc = mutableMapOf<String, Row>()
        repeat(n) {
            for ((k, r) in read(ctx, day(cal.time))) acc[k] = acc[k]?.plus(r) ?: r
            cal.add(Calendar.DAY_OF_MONTH, -1)
        }
        return acc
    }

    fun dur(ms: Long): String {
        if (ms <= 0) return "—"
        val s = (ms + 500) / 1000
        return when {
            s < 60 -> "$s с"
            s < 3600 -> "${s / 60} мин ${s % 60} с"
            else -> "${s / 3600} ч ${(s % 3600) / 60} мин"
        }
    }

    fun name(channel: String) = Db.CHANNEL_RU[channel] ?: Sites.byKey(channel)?.name ?: Sources.byKey(channel)?.name ?: channel

    /** Строка для экрана агента: последний и средний отклик сегодня по этому ресурсу. */
    fun shortLine(ctx: Context, channel: String): String {
        val r = read(ctx, day())[channel] ?: return ""
        if (r.applied == 0L) return "⏱ Сегодня: просмотрено ${r.all}, откликов пока нет (${dur(r.allMs)} работы)"
        return "⏱ Отклик: последний ${dur(r.lastMs)}, в среднем ${dur(r.avgMs)} · сегодня ${r.applied} откл., " +
            String.format(Locale.US, "%.1f", r.perHour) + " в час"
    }

    private fun block(title: String, m: Map<String, Row>): String {
        if (m.isEmpty()) return "$title\n   данных нет\n"
        val sb = StringBuilder("$title\n")
        for ((k, r) in m.entries.sortedByDescending { it.value.applied }) {
            sb.append("• ${name(k)}\n")
            if (r.applied > 0) {
                sb.append("   отклик: в среднем ${dur(r.avgMs)}, быстрее всего ${dur(r.minMs)}, дольше всего ${dur(r.maxMs)}\n")
                sb.append("   откликов ${r.applied} из ${r.all} просмотренных · " + String.format(Locale.US, "%.1f", r.perHour) +
                    " откл./час · работа ${dur(r.allMs)}\n")
            } else sb.append("   откликов нет · просмотрено ${r.all} за ${dur(r.allMs)}\n")
        }
        return sb.toString()
    }

    /** Подробный отчёт: сегодня, 7 и 30 дней по каждому ресурсу. */
    fun report(ctx: Context): String {
        val sb = StringBuilder()
        sb.append(block("Сегодня", byChannel(ctx, 1))).append('\n')
        sb.append(block("За 7 дней", byChannel(ctx, 7))).append('\n')
        sb.append(block("За 30 дней", byChannel(ctx, 30))).append('\n')
        sb.append("Время отклика — от открытия вакансии до отправки: проверка, письмо, анкета, ожидание капчи или вашего подтверждения. " +
            "«Откл./час» учитывает и время на пропущенные вакансии; паузы между откликами не считаются.")
        return sb.toString()
    }
}
