package com.technews.pulse

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import com.technews.pulse.data.Repository
import com.technews.pulse.work.RefreshWorker

class TechPulseApp : Application() {
    lateinit var repository: Repository
        private set

    override fun onCreate() {
        super.onCreate()
        repository = Repository(this)
        val channel = NotificationChannel(
            RefreshWorker.CHANNEL_ID, "Новые технические статьи", NotificationManager.IMPORTANCE_DEFAULT,
        ).apply { description = "Уведомления о свежих статьях после фонового обновления" }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        RefreshWorker.schedule(this, repository.store.settings.value)
    }
}
