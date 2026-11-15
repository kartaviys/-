package ru.hhautoapply

import android.content.Context
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Учёт расхода нейросети по дням и провайдерам: запросы, входные/выходные токены, деньги.
 * Хранится локально (SharedPreferences, ключ usage_ГГГГ-ММ-ДД).
 */
object Usage {
    data class Row(var calls: Long = 0, var input: Long = 0, var output: Long = 0, var cost: Double = 0.0)

    private fun sp(ctx: Context) = ctx.getSharedPreferences("usage", Context.MODE_PRIVATE)
    private fun day(date: Date = Date()) = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)

    private fun read(ctx: Context, d: String): MutableMap<String, Row> {
        val o = JSONObject(sp(ctx).getString("usage_$d", null) ?: "{}")
        return o.keys().asSequence().associateWith { k ->
            val r = o.getJSONObject(k)
            Row(r.optLong("calls"), r.optLong("in"), r.optLong("out"), r.optDouble("cost", 0.0))
        }.toMutableMap()
    }

    @Synchronized
    fun add(ctx: Context, provider: String, input: Long, output: Long, cost: Double) {
        val d = day()
        val m = read(ctx, d)
        val r = m.getOrPut(provider) { Row() }
        r.calls++; r.input += input; r.output += output; r.cost += cost
        val o = JSONObject()
        for ((k, v) in m) o.put(k, JSONObject().put("calls", v.calls).put("in", v.input).put("out", v.output).put("cost", v.cost))
        sp(ctx).edit().putString("usage_$d", o.toString()).apply()
    }

    fun total(ctx: Context, d: String = day()): Row = read(ctx, d).values.fold(Row()) { acc, r ->
        acc.calls += r.calls; acc.input += r.input; acc.output += r.output; acc.cost += r.cost; acc
    }

    fun todayCost(ctx: Context) = total(ctx).cost

    /** Сумма за последние n дней (включая сегодня). */
    fun lastDays(ctx: Context, n: Int): Row {
        val cal = Calendar.getInstance()
        val acc = Row()
        repeat(n) {
            val r = total(ctx, day(cal.time))
            acc.calls += r.calls; acc.input += r.input; acc.output += r.output; acc.cost += r.cost
            cal.add(Calendar.DAY_OF_MONTH, -1)
        }
        return acc
    }

    fun money(v: Double) = "$" + String.format(Locale.US, if (v < 1) "%.4f" else "%.2f", v)
    fun tokens(v: Long) = when {
        v >= 1_000_000 -> String.format(Locale.US, "%.1fM", v / 1e6)
        v >= 1_000 -> String.format(Locale.US, "%.1fK", v / 1e3)
        else -> v.toString()
    }

    fun shortLine(ctx: Context): String {
        val t = total(ctx)
        val budget = Prefs.get(ctx, "daily_budget").replace(',', '.').toDoubleOrNull() ?: 0.0
        return "💰 Нейросеть сегодня: ${t.calls} запросов, ${tokens(t.input + t.output)} токенов ≈ ${money(t.cost)}" +
            (if (budget > 0) " из ${money(budget)}" else "") + " · за 30 дней ≈ ${money(lastDays(ctx, 30).cost)}"
    }

    /** Подробный отчёт: последние 14 дней по провайдерам. */
    fun report(ctx: Context): String {
        val cal = Calendar.getInstance()
        val sb = StringBuilder()
        repeat(14) {
            val d = day(cal.time)
            val m = read(ctx, d)
            if (m.isNotEmpty()) {
                val t = total(ctx, d)
                sb.append("$d — ${money(t.cost)}\n")
                for ((p, r) in m) {
                    sb.append("   $p: ${r.calls} запр., вход ${tokens(r.input)}, выход ${tokens(r.output)} ≈ ${money(r.cost)}\n")
                }
            }
            cal.add(Calendar.DAY_OF_MONTH, -1)
        }
        val w = lastDays(ctx, 7)
        val mo = lastDays(ctx, 30)
        sb.append("\nЗа 7 дней: ${money(w.cost)} (${tokens(w.input + w.output)} токенов)\n")
        sb.append("За 30 дней: ${money(mo.cost)} (${tokens(mo.input + mo.output)} токенов)\n")
        sb.append("\nЦены (за 1M токенов): Claude Haiku 5.5 — $0.10 вход / $0.50 выход; DeepSeek — ≈$0.28 / $0.42. " +
            "Своя модель — по ценам из настроек (локальная — бесплатно). " +
            "Это оценка по ответам API; точная сумма — в кабинете провайдера.")
        return sb.toString().ifBlank { "Расходов пока нет." }
    }
}
