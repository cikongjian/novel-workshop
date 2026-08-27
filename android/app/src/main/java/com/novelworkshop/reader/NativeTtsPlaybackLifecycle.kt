package com.novelworkshop.reader

import android.content.Context

class NativeTtsPlaybackLifecycle(
    context: Context,
    private val keepScreenOnAction: (Boolean) -> Unit = {},
) {
    private val appContext = context.applicationContext
    private val playbackWakeLock = PlaybackWakeLock(appContext)

    @Volatile
    private var playbackActive = false

    @Volatile
    private var playbackPreview = ""

    fun isActive(): Boolean = playbackActive

    fun setPreview(text: String) {
        playbackPreview = text
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(48)
    }

    fun begin(requestId: String, engineId: String, voiceName: String) {
        playbackActive = true
        keepScreenOnAction(true)
        playbackWakeLock.acquire()
        TtsPlaybackService.start(
            appContext,
            TtsPlaybackNotificationState(
                requestId = requestId,
                engineId = engineId,
                voiceName = voiceName,
                previewText = playbackPreview,
            ),
        )
    }

    fun finish() {
        playbackActive = false
        keepScreenOnAction(false)
        playbackWakeLock.release()
        TtsPlaybackService.stop(appContext)
    }

    fun shutdown() {
        playbackActive = false
        playbackWakeLock.release()
        TtsPlaybackService.stop(appContext)
    }
}
