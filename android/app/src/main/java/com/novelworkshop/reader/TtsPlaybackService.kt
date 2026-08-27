package com.novelworkshop.reader

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat

data class TtsPlaybackNotificationState(
    val requestId: String,
    val engineId: String,
    val voiceName: String,
    val previewText: String,
)

class TtsPlaybackService : Service() {
    private lateinit var notificationManager: NotificationManager
    private lateinit var audioManager: AudioManager
    private lateinit var mediaSession: MediaSessionCompat
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus = false

    private val audioFocusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK,
            -> TtsPlaybackController.requestStopPlayback()
        }
    }

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(NotificationManager::class.java)
        audioManager = getSystemService(AudioManager::class.java)
        createNotificationChannel()
        mediaSession = MediaSessionCompat(this, MEDIA_SESSION_TAG).apply {
            isActive = false
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onStop() {
                    TtsPlaybackController.requestStopPlayback()
                }

                override fun onPause() {
                    TtsPlaybackController.requestStopPlayback()
                }
            })
            setPlaybackState(buildPlaybackState(PlaybackStateCompat.STATE_STOPPED))
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_OR_UPDATE -> {
                val state = extractState(intent) ?: return START_NOT_STICKY
                startOrUpdateForeground(state)
            }
            ACTION_STOP_PLAYBACK -> {
                TtsPlaybackController.requestStopPlayback()
            }
            ACTION_STOP_SERVICE -> stopForegroundPlayback()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopForegroundPlayback()
        mediaSession.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startOrUpdateForeground(state: TtsPlaybackNotificationState) {
        ensureAudioFocus()
        mediaSession.isActive = true
        mediaSession.setPlaybackState(buildPlaybackState(PlaybackStateCompat.STATE_PLAYING))

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(getString(R.string.tts_notification_title))
            .setContentText(state.previewText.ifBlank { getString(R.string.tts_notification_text_fallback) })
            .setSubText(state.voiceName.ifBlank { state.engineId })
            .setContentIntent(buildOpenAppPendingIntent())
            .setDeleteIntent(buildStopPlaybackPendingIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(
                NotificationCompat.Action(
                    0,
                    getString(R.string.tts_notification_stop),
                    buildStopPlaybackPendingIntent(),
                ),
            )
            .setStyle(
                MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0),
            )
            .build()

        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification,
            FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
        )
    }

    private fun stopForegroundPlayback() {
        abandonAudioFocus()
        if (::mediaSession.isInitialized) {
            mediaSession.setPlaybackState(buildPlaybackState(PlaybackStateCompat.STATE_STOPPED))
            mediaSession.isActive = false
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.tts_notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.tts_notification_channel_description)
            setShowBadge(false)
        }
        notificationManager.createNotificationChannel(channel)
    }

    private fun ensureAudioFocus() {
        if (hasAudioFocus) return
        val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setOnAudioFocusChangeListener(audioFocusChangeListener)
            .setAcceptsDelayedFocusGain(false)
            .setWillPauseWhenDucked(true)
            .build()
        val result = audioManager.requestAudioFocus(focusRequest)
        if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            audioFocusRequest = focusRequest
            hasAudioFocus = true
        }
    }

    private fun abandonAudioFocus() {
        if (!hasAudioFocus) return
        audioFocusRequest?.let { request ->
            audioManager.abandonAudioFocusRequest(request)
        }
        audioFocusRequest = null
        hasAudioFocus = false
    }

    private fun buildPlaybackState(state: Int): PlaybackStateCompat {
        return PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_STOP or
                    PlaybackStateCompat.ACTION_PAUSE or
                    PlaybackStateCompat.ACTION_PLAY_PAUSE,
            )
            .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
            .build()
    }

    private fun buildOpenAppPendingIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            this,
            REQUEST_CODE_OPEN_APP,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun buildStopPlaybackPendingIntent(): PendingIntent {
        val intent = Intent(this, TtsPlaybackService::class.java).apply {
            action = ACTION_STOP_PLAYBACK
        }
        return PendingIntent.getService(
            this,
            REQUEST_CODE_STOP_PLAYBACK,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun extractState(intent: Intent): TtsPlaybackNotificationState? {
        val requestId = intent.getStringExtra(EXTRA_REQUEST_ID).orEmpty()
        if (requestId.isBlank()) return null
        return TtsPlaybackNotificationState(
            requestId = requestId,
            engineId = intent.getStringExtra(EXTRA_ENGINE_ID).orEmpty(),
            voiceName = intent.getStringExtra(EXTRA_VOICE_NAME).orEmpty(),
            previewText = intent.getStringExtra(EXTRA_PREVIEW_TEXT).orEmpty(),
        )
    }

    companion object {
        private const val CHANNEL_ID = "tts_playback"
        private const val NOTIFICATION_ID = 2001
        private const val MEDIA_SESSION_TAG = "NovelWorkshopReaderTts"
        private const val ACTION_START_OR_UPDATE = "com.novelworkshop.reader.tts.START_OR_UPDATE"
        private const val ACTION_STOP_PLAYBACK = "com.novelworkshop.reader.tts.STOP_PLAYBACK"
        private const val ACTION_STOP_SERVICE = "com.novelworkshop.reader.tts.STOP_SERVICE"
        private const val EXTRA_REQUEST_ID = "requestId"
        private const val EXTRA_ENGINE_ID = "engineId"
        private const val EXTRA_VOICE_NAME = "voiceName"
        private const val EXTRA_PREVIEW_TEXT = "previewText"
        private const val REQUEST_CODE_OPEN_APP = 2002
        private const val REQUEST_CODE_STOP_PLAYBACK = 2003
        private const val FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK = 0x00000002

        fun start(context: Context, state: TtsPlaybackNotificationState) {
            val intent = Intent(context, TtsPlaybackService::class.java).apply {
                action = ACTION_START_OR_UPDATE
                putExtra(EXTRA_REQUEST_ID, state.requestId)
                putExtra(EXTRA_ENGINE_ID, state.engineId)
                putExtra(EXTRA_VOICE_NAME, state.voiceName)
                putExtra(EXTRA_PREVIEW_TEXT, state.previewText)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, TtsPlaybackService::class.java).apply {
                action = ACTION_STOP_SERVICE
            }
            context.startService(intent)
        }
    }
}
