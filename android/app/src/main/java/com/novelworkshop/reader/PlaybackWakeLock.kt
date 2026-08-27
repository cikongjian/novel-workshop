package com.novelworkshop.reader

import android.content.Context
import android.os.PowerManager

class PlaybackWakeLock(context: Context) {
    private val powerManager = context.applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
    private var wakeLock: PowerManager.WakeLock? = null

    @Synchronized
    fun acquire() {
        val manager = powerManager ?: return
        val lock = wakeLock ?: manager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "NovelWorkshopReader:TtsPlayback",
        ).apply {
            setReferenceCounted(false)
        }.also {
            wakeLock = it
        }

        if (!lock.isHeld) {
            lock.acquire()
        }
    }

    @Synchronized
    fun release() {
        val lock = wakeLock ?: return
        if (!lock.isHeld) return
        try {
            lock.release()
        } catch (_: Throwable) {
        }
    }
}
