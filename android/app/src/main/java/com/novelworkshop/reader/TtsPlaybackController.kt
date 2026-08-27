package com.novelworkshop.reader

object TtsPlaybackController {
    @Volatile
    private var stopPlaybackAction: (() -> Unit)? = null

    fun registerStopPlaybackAction(action: () -> Unit) {
        stopPlaybackAction = action
    }

    fun clearStopPlaybackAction() {
        stopPlaybackAction = null
    }

    fun requestStopPlayback() {
        stopPlaybackAction?.invoke()
    }
}
