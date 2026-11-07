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
import kotlinx.coroutines.withContext
import java.util.Calendar
import java.util.concurrent.TimeUnit

/** Запуск в фоне (не прерывается, если погасить экран) + ежедневный автозапуск. */
class RunWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val dry = inputData.getBoolean(KEY_DRY, true)
        ensureChannel(applicationContext)
        setForeground(foregroundInfo("Идёт отклик на вакансии…"))
        if (inputData.getBoolean(KEY_DAILY, false)) RunLog.clear(applicationContext)
        try {
            val summary = Runner(applicationContext, dry) { isStopped }.run()
            notify(applicationContext, "Автоотклик завершён", summary)
            Result.success()
        } catch (e: Exception) {
            RunLog.add(applicationContext, "Ошибка: ${e.message}")
            notify(applicationContext, "Автоотклик: ошибка", e.message.orEmpty())
            Result.failure()
        }
    }

    private fun foregroundInfo(text: String): ForegroundInfo {
        val n = NotificationCompat.Builder(applicationContext, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_send)
            .setContentTitle("HH Автоотклик")
            .setContentText(text)
            .setOngoing(true)
            .build()
        return if (Build.VERSION.SDK_INT >= 29) ForegroundInfo(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else ForegroundInfo(1, n)
    }

    companion object {
        const val KEY_DRY = "dry"
        const val KEY_DAILY = "daily"
        const val CHANNEL = "run"
        const val ONE_SHOT = "run_now"
        const val DAILY = "run_daily"

        fun ensureChannel(ctx: Context) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Автоотклик", NotificationManager.IMPORTANCE_LOW))
        }

        fun notify(ctx: Context, title: String, text: String) {
            val pi = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
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
