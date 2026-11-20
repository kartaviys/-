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
        // запросы помощи у человека: капча, вход, подтверждение отправки, другое; сколько остались без ответа
        var hCaptcha: Long = 0, var hLogin: Long = 0, var hConfirm: Long = 0, var hOther: Long = 0, var hMissed: Long = 0,
    ) {
        fun plus(o: Row) = Row(
            applied + o.applied, appliedMs + o.appliedMs,
            listOf(minMs, o.minMs).filter { it > 0 }.minOrNull() ?: 0, maxOf(maxMs, o.maxMs), if (o.lastMs > 0) o.lastMs else lastMs,
            all + o.all, allMs + o.allMs,
            hCaptcha + o.hCaptcha, hLogin + o.hLogin, hConfirm + o.hConfirm, hOther + o.hOther, hMissed + o.hMissed,
        )
        val help get() = hCaptcha + hLogin + hConfirm + hOther
        val avgMs get() = if (applied > 0) appliedMs / applied else 0
        val perHour get() = if (allMs > 0) applied * 3_600_000.0 / allMs else 0.0
    }

    private fun sp(ctx: Context) = ctx.getSharedPreferences("timing", Context.MODE_PRIVATE)
    private fun day(date: Date = Date()) = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)

    private fun read(ctx: Context, d: String): MutableMap<String, Row> {
        val o = JSONObject(sp(ctx).getString("t_$d", null) ?: "{}")
        return o.keys().asSequence().associateWith { k ->
            val r = o.getJSONObject(k)
            Row(r.optLong("a"), r.optLong("am"), r.optLong("min"), r.optLong("max"), r.optLong("last"), r.optLong("n"), r.optLong("nm"),
                r.optLong("hc"), r.optLong("hl"), r.optLong("hq"), r.optLong("ho"), r.optLong("hm"))
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
    private fun update(ctx: Context, channel: String, f: (Row) -> Unit) {
        val d = day()
        val m = read(ctx, d)
        f(m.getOrPut(channel) { Row() })
        val o = JSONObject()
        for ((k, v) in m) o.put(k, JSONObject().put("a", v.applied).put("am", v.appliedMs).put("min", v.minMs).put("max", v.maxMs)
            .put("last", v.lastMs).put("n", v.all).put("nm", v.allMs)
            .put("hc", v.hCaptcha).put("hl", v.hLogin).put("hq", v.hConfirm).put("ho", v.hOther).put("hm", v.hMissed))
        sp(ctx).edit().putString("t_$d", o.toString()).apply()
    }

    fun add(ctx: Context, channel: String, ms: Long, applied: Boolean) = update(ctx, channel) { r ->
        r.all++; r.allMs += ms
        if (applied) {
            r.applied++; r.appliedMs += ms; r.lastMs = ms
            r.minMs = if (r.minMs == 0L) ms else minOf(r.minMs, ms)
            r.maxMs = maxOf(r.maxMs, ms)
        }
    }

    enum class Help(val ru: String) { CAPTCHA("капча"), LOGIN("вход"), CONFIRM("подтверждение"), OTHER("другое") }

    fun helpKind(text: String, confirm: Boolean): Help = when {
        confirm -> Help.CONFIRM
        Regex("капч|captcha|провер\\w* браузер|робот", RegexOption.IGNORE_CASE).containsMatchIn(text) -> Help.CAPTCHA
        Regex("войдите|вход|логин|sign in|log in", RegexOption.IGNORE_CASE).containsMatchIn(text) -> Help.LOGIN
        else -> Help.OTHER
    }

    /** Запрос помощи у человека. channel пустой — берём ресурс текущей вакансии или запасной. */
    @Synchronized
    fun addHelp(ctx: Context, fallbackChannel: String, kind: Help, missed: Boolean = false) {
        val ch = if (curStart != 0L && curChannel.isNotBlank()) curChannel else fallbackChannel
        update(ctx, ch) { r ->
            when (kind) { Help.CAPTCHA -> r.hCaptcha++; Help.LOGIN -> r.hLogin++; Help.CONFIRM -> r.hConfirm++; Help.OTHER -> r.hOther++ }
            if (missed) r.hMissed++
        }
    }

    /** Отметить, что последний запрос помощи остался без ответа (15 минут). */
    @Synchronized
    fun helpMissed(ctx: Context, fallbackChannel: String) {
        val ch = if (curStart != 0L && curChannel.isNotBlank()) curChannel else fallbackChannel
        update(ctx, ch) { it.hMissed++ }
    }

    /**
     * Журнал по дням: по каждому агенту — сколько откликов отправлено (из журнала откликов),
     * сколько вакансий просмотрено и сколько раз просил помощи (капча, вход, подтверждение…).
     */
    fun dailyReport(ctx: Context, days: Int = 30): String {
        val applied = Db(ctx).appliedByDay(days) // день → (ресурс → откликов)
        val cal = Calendar.getInstance()
        val sb = StringBuilder()
        repeat(days) {
            val d = day(cal.time)
            cal.add(Calendar.DAY_OF_MONTH, -1)
            val t = read(ctx, d)
            val a = applied[d].orEmpty()
            val channels = (a.keys + t.keys).distinct()
            if (channels.isEmpty()) return@repeat
            val total = a.values.sum()
            val help = t.values.sumOf { it.help }
            sb.append("📅 $d — откликов $total" + (if (help > 0) ", просьб о помощи $help" else "") + "\n")
            for (ch in channels.sortedByDescending { a[it] ?: 0 }) {
                val r = t[ch]
                val parts = mutableListOf("откликов ${a[ch] ?: 0}")
                if (r != null && r.all > 0) parts += "просмотрено ${r.all}"
                if (r != null && r.applied > 0) parts += "ср. ${dur(r.avgMs)}"
                if (r != null && r.help > 0) {
                    val h = listOfNotNull(
                        r.hCaptcha.takeIf { it > 0 }?.let { "капча $it" }, r.hLogin.takeIf { it > 0 }?.let { "вход $it" },
                        r.hConfirm.takeIf { it > 0 }?.let { "подтверждение $it" }, r.hOther.takeIf { it > 0 }?.let { "другое $it" },
                    ).joinToString(", ")
                    parts += "помощь: $h" + (if (r.hMissed > 0) " (без ответа ${r.hMissed})" else "")
                }
                sb.append("   • ${name(ch)}: ${parts.joinToString(" · ")}\n")
            }
            sb.append('\n')
        }
        return sb.toString().ifBlank { "Пока пусто — статистика копится с этой версии (отклики берутся из журнала)." }
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

    fun name(channel: String) = if (channel == "single" || channel.isBlank()) "Одна вакансия (вручную)" else Db.CHANNEL_RU[channel] ?: Sites.byKey(channel)?.name ?: Sources.byKey(channel)?.name ?: channel

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
