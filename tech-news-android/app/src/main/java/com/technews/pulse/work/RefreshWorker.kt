package com.technews.pulse.work

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.technews.pulse.MainActivity
import com.technews.pulse.R
import com.technews.pulse.TechPulseApp
import com.technews.pulse.data.AppSettings
import java.util.concurrent.TimeUnit

class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val repo = (applicationContext as TechPulseApp).repository
        val result = runCatching { repo.refresh() }.getOrElse { return Result.retry() }
        val settings = repo.store.settings.value
        if (settings.notify && result.newPassed.isNotEmpty()) notify(result.newPassed.size, result.newPassed
            .sortedByDescending { it.verdict.score }.take(3).map { it.article.title })
        return Result.success()
    }

    @SuppressLint("MissingPermission")
    private fun notify(count: Int, titles: List<String>) {
        val ctx = applicationContext
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val intent = PendingIntent.getActivity(
            ctx, 0,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val style = NotificationCompat.InboxStyle()
        titles.forEach { style.addLine(it) }
        val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Новых технических статей: $count")
            .setContentText(titles.firstOrNull().orEmpty())
            .setStyle(style)
            .setContentIntent(intent)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, n)
    }

    companion object {
        const val CHANNEL_ID = "new_articles"
        private const val NOTIFICATION_ID = 1001
        private const val WORK_NAME = "techpulse_refresh"

        fun schedule(context: Context, settings: AppSettings) {
            val wm = WorkManager.getInstance(context)
            if (!settings.backgroundRefresh) {
                wm.cancelUniqueWork(WORK_NAME)
                return
            }
            val request = PeriodicWorkRequestBuilder<RefreshWorker>(settings.refreshHours.toLong(), TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInitialDelay(settings.refreshHours.toLong(), TimeUnit.HOURS)
                .build()
            wm.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
        }
    }
}
