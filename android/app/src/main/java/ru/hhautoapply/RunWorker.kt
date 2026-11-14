package ru.hhautoapply

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Calendar
import java.util.concurrent.TimeUnit

/** Запуск в фоне (не прерывается, если погасить экран) + ежедневный автозапуск. */
class RunWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val app = applicationContext
        ensureChannel(app)
        Prefs.migrate(app)
        val mode = inputData.getString(KEY_MODE) ?: "api"
        setForeground(foregroundInfo(if (mode == "agent") "Агент откликается на вакансии…" else "Идёт отклик на вакансии…"))
        if (mode == "agent") {
            return@withContext runAgent(inputData.getBoolean(KEY_SINGLE, false), inputData.getString(KEY_SOURCE).orEmpty())
        }
        val dry = inputData.getBoolean(KEY_DRY, true)
        if (inputData.getBoolean(KEY_DAILY, false)) RunLog.clear(app)
        try {
            val summary = Runner(app, dry) { isStopped }.run()
            notify(app, "Автоотклик завершён", summary)
            // hh через сайт или есть анкеты — сразу запускаем агента в этой же фоновой задаче (экран не нужен)
            val hhSite = Sources.byKey("hh")?.let { Sources.isOn(app, it) } == true && !HhMode.useApi(app)
            if (!dry && !isStopped && (hhSite || Db(app).pendingBrowser().isNotEmpty())) runAgent(false, "")
            Result.success()
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            RunLog.add(app, "Ошибка: ${e.message}")
            notify(app, "Автоотклик: ошибка", e.message.orEmpty())
            Result.failure()
        }
    }

    /** Агент в фоне: статус выводится в постоянное уведомление. */
    private suspend fun runAgent(single: Boolean, source: String): Result = coroutineScope {
        val app = applicationContext
        val updater = launch {
            AgentEngine.status.collect { text ->
                try { app.getSystemService(NotificationManager::class.java).notify(1, buildOngoing(text)) } catch (_: SecurityException) { }
            }
        }
        try {
            val summary = AgentEngine.run(app, single, source)
            notify(app, "Агент закончил", summary)
            Result.success()
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            RunLog.add(app, "Агент: ошибка — ${e.message}")
            notify(app, "Агент: ошибка", e.message.orEmpty())
            Result.failure()
        } finally {
            updater.cancel()
        }
    }

    private fun buildOngoing(text: String) = NotificationCompat.Builder(applicationContext, CHANNEL)
        .setSmallIcon(android.R.drawable.ic_menu_send)
        .setContentTitle("HH Автоотклик")
        .setContentText(text)
        .setStyle(NotificationCompat.BigTextStyle().bigText(text))
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(PendingIntent.getActivity(applicationContext, 5,
            Intent(applicationContext, AgentActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        .build()

    private fun foregroundInfo(text: String): ForegroundInfo {
        val n = buildOngoing(text)
        return if (Build.VERSION.SDK_INT >= 29) ForegroundInfo(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else ForegroundInfo(1, n)
    }

    companion object {
        const val KEY_DRY = "dry"
        const val KEY_MODE = "mode"
        const val KEY_SINGLE = "single"
        const val KEY_SOURCE = "source"
        const val AGENT = "agent_now"
        const val KEY_DAILY = "daily"
        const val CHANNEL = "run"
        const val ONE_SHOT = "run_now"
        const val DAILY = "run_daily"

        const val ATTENTION = "attention"

        fun ensureChannel(ctx: Context) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Автоотклик", NotificationManager.IMPORTANCE_LOW))
            nm.createNotificationChannel(NotificationChannel(ATTENTION, "Агенту нужна помощь (капча, вход)", NotificationManager.IMPORTANCE_HIGH)
                .apply { enableVibration(true) })
        }

        /** Громкое уведомление: агент ждёт человека (капча, вход, код). Тап возвращает в окно агента. */
        fun attention(ctx: Context, reason: String) {
            ensureChannel(ctx)
            val intent = Intent(ctx, AgentActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            val pi = PendingIntent.getActivity(ctx, 3, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = NotificationCompat.Builder(ctx, ATTENTION)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("Агенту нужна помощь")
                .setContentText(reason)
                .setStyle(NotificationCompat.BigTextStyle().bigText(reason))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build()
            try { ctx.getSystemService(NotificationManager::class.java).notify(4, n) } catch (_: SecurityException) { }
        }

        fun clearAttention(ctx: Context) = ctx.getSystemService(NotificationManager::class.java).cancel(4)

        fun notify(ctx: Context, title: String, text: String, openAgent: Boolean = false) {
            val target = if (openAgent) Intent(ctx, AgentActivity::class.java).putExtra(AgentActivity.EXTRA_AUTOSTART, true)
            else Intent(ctx, MainActivity::class.java)
            val pi = PendingIntent.getActivity(ctx, if (openAgent) 1 else 0, target, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_menu_send)
                .setContentTitle(title)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setContentText(text)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build()
            try {
                ctx.getSystemService(NotificationManager::class.java).notify(2, n)
            } catch (_: SecurityException) { }
        }

        private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun runNow(ctx: Context, dry: Boolean) {
            RunLog.clear(ctx)
            val req = OneTimeWorkRequestBuilder<RunWorker>()
                .setInputData(workDataOf(KEY_DRY to dry))
                .setConstraints(network)
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork(ONE_SHOT, ExistingWorkPolicy.KEEP, req)
        }

        fun stop(ctx: Context) = WorkManager.getInstance(ctx).cancelUniqueWork(ONE_SHOT)

        /** Запуск агента в фоне (работает и при выключенном экране). */
        fun startAgent(ctx: Context, single: Boolean = false, source: String = "") {
            val req = OneTimeWorkRequestBuilder<RunWorker>()
                .setInputData(workDataOf(KEY_MODE to "agent", KEY_SINGLE to single, KEY_SOURCE to source))
                .setConstraints(network)
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork(AGENT, ExistingWorkPolicy.KEEP, req)
        }

        fun stopAgent(ctx: Context) {
            AgentEngine.answer(false)
            WorkManager.getInstance(ctx).cancelUniqueWork(AGENT)
        }

        fun scheduleDaily(ctx: Context) {
            val wm = WorkManager.getInstance(ctx)
            if (!Prefs.bool(ctx, "daily_auto")) { wm.cancelUniqueWork(DAILY); return }
            val now = Calendar.getInstance()
            val next = (now.clone() as Calendar).apply {
                set(Calendar.HOUR_OF_DAY, Prefs.int(ctx, "daily_hour").coerceIn(0, 23))
                set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
                if (before(now)) add(Calendar.DAY_OF_MONTH, 1)
            }
            val req = PeriodicWorkRequestBuilder<RunWorker>(24, TimeUnit.HOURS)
                .setInitialDelay(next.timeInMillis - now.timeInMillis, TimeUnit.MILLISECONDS)
                .setInputData(workDataOf(KEY_DRY to false, KEY_DAILY to true))
                .setConstraints(network)
                .build()
            wm.enqueueUniquePeriodicWork(DAILY, ExistingPeriodicWorkPolicy.UPDATE, req)
        }
    }
}
