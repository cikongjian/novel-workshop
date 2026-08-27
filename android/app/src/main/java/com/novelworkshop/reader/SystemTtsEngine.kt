package com.novelworkshop.reader

import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.util.Locale

class SystemTtsEngine(
    context: Context,
    private val eventListener: (NativeTtsEngineEvent) -> Unit,
    private val onReadyCallback: (() -> Unit)? = null,
) : ReaderTtsEngine, TextToSpeech.OnInitListener {
    private val appContext = context.applicationContext
    private var ready = false
    private var currentRequestId = ""
    private var tts: TextToSpeech? = null
    private var initAttempt = 0
    private val mainHandler = Handler(Looper.getMainLooper())

    override val engineId: String = "system"

    init {
        initializeTts()
    }

    override fun onInit(status: Int) {
        ready = status == TextToSpeech.SUCCESS
        if (!ready) {
            eventListener(NativeTtsEngineEvent(type = "error", message = "Android TextToSpeech init failed: $status"))
            scheduleRetry()
            return
        }

        try {
            tts?.language = Locale.SIMPLIFIED_CHINESE
        } catch (error: Throwable) {
            ready = false
            eventListener(
                NativeTtsEngineEvent(
                    type = "error",
                    message = error.message ?: "Android TextToSpeech language init failed",
                ),
            )
            scheduleRetry()
            return
        }
        onReadyCallback?.invoke()
    }

    override fun isReady(): Boolean = ready

    override fun hasUsableVoice(): Boolean {
        val engine = tts ?: return false
        if (!ready) return false
        val voices = getVoices()
        if (voices.isNotEmpty()) {
            return voices.any { it.lang.startsWith("zh", ignoreCase = true) }
        }
        val availability = try {
            engine.isLanguageAvailable(Locale.SIMPLIFIED_CHINESE)
        } catch (_: Throwable) {
            TextToSpeech.LANG_NOT_SUPPORTED
        }
        return availability >= TextToSpeech.LANG_AVAILABLE
    }

    override fun getVoices(): List<NativeTtsVoiceInfo> {
        val engine = tts ?: return emptyList()
        if (!ready) return emptyList()
        val defaultVoiceName = try {
            engine.defaultVoice?.name
        } catch (_: Throwable) {
            null
        }

        return engine.voices.orEmpty().sortedWith(
            compareBy<Voice> { it.locale?.language != Locale.SIMPLIFIED_CHINESE.language }
                .thenBy { it.isNetworkConnectionRequired }
                .thenBy { it.name },
        ).map { voice ->
            NativeTtsVoiceInfo(
                name = voice.name,
                lang = voice.locale?.toLanguageTag() ?: Locale.SIMPLIFIED_CHINESE.toLanguageTag(),
                isDefault = voice.name == defaultVoiceName,
                localService = !voice.isNetworkConnectionRequired,
                voiceURI = "android:${voice.name}",
            )
        }
    }

    override fun speak(requestId: String, text: String, rate: Double, pitch: Double, voiceName: String): Boolean {
        val engine = tts ?: return false
        if (!ready || text.isBlank()) return false

        currentRequestId = requestId
        try {
            engine.setSpeechRate(rate.toFloat().coerceIn(0.5f, 2.0f))
            engine.setPitch(pitch.toFloat().coerceIn(0.5f, 2.0f))
            selectVoice(voiceName)
        } catch (error: Throwable) {
            eventListener(
                NativeTtsEngineEvent(
                    type = "error",
                    requestId = requestId,
                    message = error.message ?: "Android TextToSpeech configure failed",
                ),
            )
            return false
        }

        val result = try {
            engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, requestId)
        } catch (error: Throwable) {
            eventListener(
                NativeTtsEngineEvent(
                    type = "error",
                    requestId = requestId,
                    message = error.message ?: "Android TextToSpeech speak crashed",
                ),
            )
            return false
        }
        if (result != TextToSpeech.SUCCESS) {
            eventListener(
                NativeTtsEngineEvent(
                    type = "error",
                    requestId = requestId,
                    message = "Android TextToSpeech speak failed: $result",
                ),
            )
            return false
        }
        return true
    }

    override fun stop(requestId: String?): Boolean {
        val engine = tts ?: return false
        if (!ready) return false
        if (!requestId.isNullOrBlank() && requestId != currentRequestId) return false

        val stoppedRequestId = currentRequestId
        try {
            engine.stop()
        } catch (_: Throwable) {
            return false
        }
        if (stoppedRequestId.isNotBlank()) {
            eventListener(
                NativeTtsEngineEvent(
                    type = "stop",
                    requestId = stoppedRequestId,
                    voiceName = engine.voice?.name,
                ),
            )
        }
        return true
    }

    override fun shutdown() {
        mainHandler.removeCallbacksAndMessages(null)
        try {
            tts?.stop()
        } catch (_: Throwable) {
        }
        try {
            tts?.shutdown()
        } catch (_: Throwable) {
        }
        tts = null
    }

    private fun selectVoice(voiceName: String): String {
        val engine = tts ?: return Locale.SIMPLIFIED_CHINESE.toLanguageTag()
        val voices = engine.voices.orEmpty()
        val preferred = voiceName.takeIf { it.isNotBlank() }?.let { target ->
            voices.firstOrNull { it.name == target }
        }

        val chosenVoice = preferred
            ?: voices.firstOrNull {
                it.locale?.language == Locale.SIMPLIFIED_CHINESE.language && !it.isNetworkConnectionRequired
            }
            ?: voices.firstOrNull { it.locale?.language == Locale.SIMPLIFIED_CHINESE.language }

        if (chosenVoice != null) {
            engine.voice = chosenVoice
            return chosenVoice.name
        }

        engine.language = Locale.SIMPLIFIED_CHINESE
        return engine.voice?.name ?: Locale.SIMPLIFIED_CHINESE.toLanguageTag()
    }

    private fun scheduleRetry() {
        if (initAttempt >= MAX_INIT_ATTEMPTS) return
        mainHandler.postDelayed({ retryInit() }, INIT_RETRY_DELAY_MS)
    }

    private fun retryInit() {
        try { tts?.stop() } catch (_: Throwable) {}
        try { tts?.shutdown() } catch (_: Throwable) {}
        tts = null
        ready = false
        initAttempt += 1
        initializeTts()
    }

    private fun initializeTts() {
        try {
            val engine = if (initAttempt == 0) {
                TextToSpeech(appContext, this)
            } else {
                val packageIndex = initAttempt - 1
                if (packageIndex >= KNOWN_ENGINE_PACKAGES.size) return
                val packageName = KNOWN_ENGINE_PACKAGES[packageIndex]
                if (!isEngineInstalled(packageName)) {
                    scheduleRetry()
                    return
                }
                TextToSpeech(appContext, this, packageName)
            }
            tts = engine
            engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    eventListener(
                        NativeTtsEngineEvent(
                            type = "start",
                            requestId = utteranceId.orEmpty(),
                            voiceName = tts?.voice?.name,
                        ),
                    )
                }

                override fun onDone(utteranceId: String?) {
                    eventListener(
                        NativeTtsEngineEvent(
                            type = "end",
                            requestId = utteranceId.orEmpty(),
                            voiceName = tts?.voice?.name,
                        ),
                    )
                }

                override fun onStop(utteranceId: String?, interrupted: Boolean) {
                    eventListener(
                        NativeTtsEngineEvent(
                            type = "stop",
                            requestId = utteranceId.orEmpty(),
                            voiceName = tts?.voice?.name,
                        ),
                    )
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    eventListener(
                        NativeTtsEngineEvent(
                            type = "error",
                            requestId = utteranceId.orEmpty(),
                            message = "Android TTS error",
                        ),
                    )
                }

                override fun onError(utteranceId: String?, errorCode: Int) {
                    eventListener(
                        NativeTtsEngineEvent(
                            type = "error",
                            requestId = utteranceId.orEmpty(),
                            message = "Android TTS error code=$errorCode",
                        ),
                    )
                }
            })
        } catch (error: Throwable) {
            ready = false
            tts = null
            eventListener(
                NativeTtsEngineEvent(
                    type = "error",
                    message = error.message ?: "Android TextToSpeech init crashed",
                ),
            )
            scheduleRetry()
        }
    }

    @Suppress("DEPRECATION")
    private fun isEngineInstalled(packageName: String): Boolean {
        return try {
            appContext.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }

    companion object {
        private const val INIT_RETRY_DELAY_MS = 1500L

        private val KNOWN_ENGINE_PACKAGES = listOf(
            "com.google.android.tts",
            "com.iflytek.speechsuite",
            "com.iflytek.tts",
            "com.samsung.SMT",
            "com.baidu.duersdk.opensdk",
            "com.huawei.hiai",
            "com.xiaomi.mibrain.speech",
        )

        /** First attempt uses default engine, then one attempt per known package. */
        private val MAX_INIT_ATTEMPTS = 1 + KNOWN_ENGINE_PACKAGES.size
    }
}
