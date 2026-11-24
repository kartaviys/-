package ru.hhautoapply

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class Application(
    val vacancyId: String,
    val title: String,
    val employer: String,
    val url: String,
    val formUrl: String,
    val language: String,
    val status: String,
    val channel: String,
    val letter: String,
    val createdAt: String,
)

/** Журнал откликов. status: applied / dry_run / needs_browser / manual / skipped / failed */
class Db(ctx: Context) : SQLiteOpenHelper(ctx, "applications.db", null, 2) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE applications (
                vacancy_id TEXT PRIMARY KEY, title TEXT, employer TEXT, url TEXT, form_url TEXT,
                language TEXT, status TEXT, channel TEXT, letter TEXT, error TEXT, created_at TEXT)""",
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            // В первой версии контакты могли быть взяты из меню профиля или подвала.
            db.execSQL(
                """UPDATE applications
                    SET letter = CASE WHEN letter LIKE '📇 Контакты HR:' || char(10) || '%'
                                      AND instr(letter, char(10, 10)) > 0
                                      THEN substr(letter, instr(letter, char(10, 10)) + 2)
                                      ELSE letter END,
                        form_url = url,
                        error = CASE WHEN error LIKE 'контакты: написали HR %' THEN error ELSE '' END
                    WHERE channel = 'ods' AND status = 'saved' AND error LIKE 'контакты:%'""",
            )
        }
    }

    private fun now() = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date())
    private fun today() = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    fun status(vacancyId: String): String? =
        readableDatabase.rawQuery("SELECT status FROM applications WHERE vacancy_id = ?", arrayOf(vacancyId)).use {
            if (it.moveToFirst()) it.getString(0) else null
        }

    /** Уже обработана: повторно не трогаем. dry_run и failed можно пробовать снова. */
    fun seen(vacancyId: String): Boolean {
        val row = readableDatabase.rawQuery("SELECT status, created_at FROM applications WHERE vacancy_id = ?", arrayOf(vacancyId)).use {
            if (it.moveToFirst()) it.getString(0) to (it.getString(1) ?: "") else null
        } ?: return false
        return when (row.first) {
            "applied", "manual", "needs_browser", "skipped", "saved", "hidden" -> true
            // неудачную попытку повторяем не раньше чем через 3 дня, чтобы не ходить на одну вакансию каждую сессию
            "failed" -> row.second >= SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(System.currentTimeMillis() - 3 * 86_400_000L))
            else -> false // dry_run — пробный прогон, реальный отклик ещё не отправлялся
        }
    }

    /** Отметить вакансию как уже откликнутую ранее (вне приложения), не трогая записи с письмом. */
    fun markAppliedElsewhere(vacancyId: String, title: String, url: String, channel: String) {
        if (status(vacancyId) == "applied") return
        record(vacancyId, title, "", url, url, "", "applied", channel, error = "откликались ранее")
    }

    fun record(
        vacancyId: String, title: String, employer: String, url: String, formUrl: String,
        language: String, status: String, channel: String, letter: String = "", error: String = "",
    ) {
        val v = ContentValues().apply {
            put("vacancy_id", vacancyId); put("title", title); put("employer", employer); put("url", url)
            put("form_url", formUrl); put("language", language); put("status", status); put("channel", channel)
            put("letter", letter); put("error", error); put("created_at", now())
        }
        writableDatabase.insertWithOnConflict("applications", null, v, SQLiteDatabase.CONFLICT_REPLACE)
    }

    /** Обновить письмо/описание, ссылку и примечание, не меняя статус (контакты HR для ODS). */
    fun updateDetails(vacancyId: String, letter: String, formUrl: String, error: String) {
        val v = ContentValues().apply { put("letter", letter); put("form_url", formUrl); put("error", error) }
        writableDatabase.update("applications", v, "vacancy_id = ?", arrayOf(vacancyId))
    }

    fun errorOf(vacancyId: String): String =
        readableDatabase.rawQuery("SELECT error FROM applications WHERE vacancy_id = ?", arrayOf(vacancyId)).use { if (it.moveToFirst()) it.getString(0) ?: "" else "" }

    fun setStatus(vacancyId: String, status: String) {
        val v = ContentValues().apply { put("status", status); put("created_at", now()) }
        writableDatabase.update("applications", v, "vacancy_id = ?", arrayOf(vacancyId))
    }

    fun appliedTodayIn(channel: String): Int = readableDatabase.rawQuery(
        "SELECT COUNT(*) FROM applications WHERE status = 'applied' AND channel = ? AND created_at >= ? AND channel != 'earlier' AND (error IS NULL OR error != 'откликались ранее')", arrayOf(channel, today()),
    ).use { it.moveToFirst(); it.getInt(0) }

    fun appliedToday(): Int = readableDatabase.rawQuery(
        "SELECT COUNT(*) FROM applications WHERE status = 'applied' AND created_at >= ? AND channel != 'earlier' AND (error IS NULL OR error != 'откликались ранее')", arrayOf(today()),
    ).use { it.moveToFirst(); it.getInt(0) }

    /** Отправленные отклики по дням и ресурсам за последние days дней (без «откликались ранее»). */
    fun appliedByDay(days: Int): Map<String, Map<String, Int>> {
        val from = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(System.currentTimeMillis() - (days - 1) * 86_400_000L))
        return readableDatabase.rawQuery(
            "SELECT substr(created_at, 1, 10) d, channel, COUNT(*) FROM applications WHERE status = 'applied' AND created_at >= ? " +
                "AND channel != 'earlier' AND (error IS NULL OR (error != 'откликались ранее' AND error != 'уже откликались')) GROUP BY d, channel",
            arrayOf(from),
        ).use { c ->
            val out = mutableMapOf<String, MutableMap<String, Int>>()
            while (c.moveToNext()) out.getOrPut(c.getString(0)) { mutableMapOf() }[c.getString(1) ?: ""] = c.getInt(2)
            out
        }
    }

    fun list(where: String = "1=1", args: Array<String> = emptyArray(), limit: Int = 5000): List<Application> =
        readableDatabase.rawQuery(
            "SELECT vacancy_id, title, employer, url, form_url, language, status, channel, letter, created_at " +
                "FROM applications WHERE $where ORDER BY created_at DESC LIMIT $limit", args,
        ).use { c ->
            val out = mutableListOf<Application>()
            while (c.moveToNext()) out += Application(
                c.getString(0), c.getString(1) ?: "", c.getString(2) ?: "", c.getString(3) ?: "",
                c.getString(4) ?: "", c.getString(5) ?: "", c.getString(6) ?: "", c.getString(7) ?: "",
                c.getString(8) ?: "", c.getString(9) ?: "",
            )
            out
        }

    fun pendingBrowser() = list("status = 'needs_browser'")

    fun countsByStatus(): Map<String, Int> =
        readableDatabase.rawQuery("SELECT status, COUNT(*) FROM applications GROUP BY status", null).use { c ->
            val m = mutableMapOf<String, Int>()
            while (c.moveToNext()) m[c.getString(0)] = c.getInt(1)
            m
        }

    companion object {
        val STATUS_RU = mapOf(
            "applied" to "✅ Отклик отправлен",
            "dry_run" to "📝 Пробный (не отправлен)",
            "needs_browser" to "🧾 Ждёт анкету",
            "manual" to "✋ Пропущен / вручную",
            "skipped" to "⏭ Пропущен",
            "failed" to "❌ Ошибка",
            "saved" to "📌 Сохранена (ODS)",
        )
        val CHANNEL_RU = mapOf(
            "api" to "через API hh",
            "hh_test" to "тест на hh",
            "external" to "сайт работодателя",
            "earlier" to "откликались раньше",
            "filter" to "фильтр: компьютерное зрение",
            "hh_site" to "hh через сайт (агент)",
            "linkedin_agent" to "LinkedIn (агент)",
            "habr_agent" to "Хабр Карьера (агент)",
            "ods" to "ODS #jobs",
            "ods_tg" to "ODS → Telegram (рассылка HR)",
        )
    }
}
