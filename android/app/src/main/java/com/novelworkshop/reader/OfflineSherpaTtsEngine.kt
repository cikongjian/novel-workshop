package com.novelworkshop.reader

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import com.k2fsa.sherpa.onnx.GeneratedAudio
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.getOfflineTtsConfig
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class OfflineSherpaTtsEngine(
    context: Context,
    private val eventListener: (NativeTtsEngineEvent) -> Unit,
) : ReaderTtsEngine {
    private val appContext = context.applicationContext
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val loadLock = Any()

    @Volatile
    private var currentRequestId = ""

    @Volatile
    private var stopRequested = false

    @Volatile
    private var currentAudioTrack: AudioTrack? = null

    @Volatile
    private var tts: OfflineTts? = null

    override val engineId: String = "offline-sherpa"

    override fun isReady(): Boolean = assetsAvailable()

    override fun hasUsableVoice(): Boolean = assetsAvailable()

    override fun getVoices(): List<NativeTtsVoiceInfo> {
        if (!assetsAvailable()) return emptyList()
        return listOf(
            NativeTtsVoiceInfo(
                name = OFFLINE_VOICE_NAME,
                lang = "zh-CN",
                isDefault = true,
                localService = true,
                voiceURI = "offline-sherpa:$OFFLINE_VOICE_ID",
            ),
        )
    }

    override fun speak(requestId: String, text: String, rate: Double, pitch: Double, voiceName: String): Boolean {
        if (!assetsAvailable() || text.isBlank()) return false

        stop(null)
        currentRequestId = requestId
        stopRequested = false

        executor.execute {
            val taskRequestId = requestId
            try {
                val engine = ensureTtsLoaded() ?: run {
                    dispatchError(taskRequestId, "离线语音模型未准备好")
                    return@execute
                }

                if (taskRequestId != currentRequestId || stopRequested) {
                    return@execute
                }

                eventListener(
                    NativeTtsEngineEvent(
                        type = "start",
                        requestId = taskRequestId,
                        voiceName = OFFLINE_VOICE_NAME,
                    ),
                )

                val audio = generateAudio(
                    engine = engine,
                    text = text,
                    rate = rate,
                )
                if (audio == null) {
                    resetEngine()
                    dispatchError(taskRequestId, "离线语音模型未能生成音频，已自动重置引擎，请再试一次")
                    return@execute
                }

                if (taskRequestId != currentRequestId || stopRequested) {
                    return@execute
                }

                playAudio(audio, taskRequestId)

                if (!stopRequested && taskRequestId == currentRequestId) {
                    eventListener(
                        NativeTtsEngineEvent(
                            type = "end",
                            requestId = taskRequestId,
                            voiceName = OFFLINE_VOICE_NAME,
                        ),
                    )
                }
            } catch (error: Throwable) {
                if (taskRequestId == currentRequestId && !stopRequested) {
                    dispatchError(taskRequestId, error.message ?: "离线语音合成失败")
                }
            }
        }

        return true
    }

    override fun stop(requestId: String?): Boolean {
        if (!requestId.isNullOrBlank() && requestId != currentRequestId) return false
        val stoppedRequestId = currentRequestId
        if (stoppedRequestId.isBlank()) return false

        stopRequested = true
        releaseAudioTrack()
        eventListener(
            NativeTtsEngineEvent(
                type = "stop",
                requestId = stoppedRequestId,
                voiceName = OFFLINE_VOICE_NAME,
            ),
        )
        currentRequestId = ""
        return true
    }

    override fun shutdown() {
        stop(null)
        executor.shutdownNow()
        synchronized(loadLock) {
            tts?.release()
            tts = null
        }
    }

    private fun ensureTtsLoaded(): OfflineTts? {
        tts?.let { return it }

        synchronized(loadLock) {
            tts?.let { return it }
            if (!assetsAvailable()) return null

            val config = getOfflineTtsConfig(
                modelDir = MODEL_DIR,
                modelName = "model.onnx",
                acousticModelName = "",
                vocoder = "",
                voices = "",
                lexicon = "lexicon.txt",
                dataDir = MODEL_DIR,
                dictDir = "$MODEL_DIR/dict",
                ruleFsts = RULE_FSTS,
                ruleFars = "",
                numThreads = 2,
            )

            return OfflineTts(
                assetManager = appContext.assets,
                config = config,
            ).also {
                tts = it
            }
        }
    }

    private fun generateAudio(engine: OfflineTts, text: String, rate: Double): GeneratedAudio? {
        val speed = rate.toFloat().coerceIn(MIN_SPEED, MAX_SPEED)
        val normalizedText = normalizeInputText(text)
        if (normalizedText.isBlank()) return null

        val direct = engine.generate(
            text = normalizedText,
            sid = 0,
            speed = speed,
        ) as GeneratedAudio?
        if (direct != null) {
            return direct
        }

        val relaxedText = buildFallbackInputText(normalizedText)
        if (relaxedText == normalizedText || relaxedText.isBlank()) {
            return null
        }

        return engine.generate(
            text = relaxedText,
            sid = 0,
            speed = speed,
        ) as GeneratedAudio?
    }

    private fun playAudio(audio: GeneratedAudio, requestId: String) {
        val pcm = floatSamplesToPcm16(audio.samples)
        val channelConfig = AudioFormat.CHANNEL_OUT_MONO
        val encoding = AudioFormat.ENCODING_PCM_16BIT
        val minBufferSize = AudioTrack.getMinBufferSize(audio.sampleRate, channelConfig, encoding)
        val bufferSizeInBytes = maxOf(minBufferSize, pcm.size)

        val audioTrack = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(encoding)
                    .setSampleRate(audio.sampleRate)
                    .setChannelMask(channelConfig)
                    .build(),
            )
            .setBufferSizeInBytes(bufferSizeInBytes)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()

        currentAudioTrack = audioTrack
        try {
            audioTrack.play()

            var offset = 0
            while (offset < pcm.size) {
                if (stopRequested || requestId != currentRequestId) {
                    return
                }

                val written = audioTrack.write(pcm, offset, pcm.size - offset, AudioTrack.WRITE_BLOCKING)
                if (written <= 0) {
                    throw IllegalStateException("AudioTrack write failed: $written")
                }
                offset += written
            }
        } finally {
            releaseAudioTrack(audioTrack)
        }
    }

    private fun releaseAudioTrack(expected: AudioTrack? = null) {
        val track = currentAudioTrack ?: expected ?: return
        currentAudioTrack = null
        try {
            track.stop()
        } catch (_: Throwable) {
        }
        try {
            track.flush()
        } catch (_: Throwable) {
        }
        try {
            track.release()
        } catch (_: Throwable) {
        }
    }

    private fun assetsAvailable(): Boolean {
        return try {
            val children = appContext.assets.list(MODEL_DIR).orEmpty()
            children.contains("model.onnx") && children.contains("tokens.txt") && children.contains("lexicon.txt")
        } catch (_: Throwable) {
            false
        }
    }

    private fun dispatchError(requestId: String, message: String) {
        eventListener(
            NativeTtsEngineEvent(
                type = "error",
                requestId = requestId,
                message = message,
                voiceName = OFFLINE_VOICE_NAME,
            ),
        )
    }

    private fun resetEngine() {
        synchronized(loadLock) {
            try {
                tts?.release()
            } catch (_: Throwable) {
            }
            tts = null
        }
    }

    private fun normalizeInputText(text: String): String {
        return text
            .replace('\u3000', ' ')
            .replace('\n', ' ')
            .replace('\r', ' ')
            .replace('“', '"')
            .replace('”', '"')
            .replace('‘', '\'')
            .replace('’', '\'')
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun buildFallbackInputText(text: String): String {
        return text
            .replace(Regex("[^\\p{IsHan}A-Za-z0-9，。！？；：、,.!?;:()（）《》“”\"'\\-\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun floatSamplesToPcm16(samples: FloatArray): ByteArray {
        val result = ByteArray(samples.size * 2)
        for (index in samples.indices) {
            val clamped = samples[index].coerceIn(-1.0f, 1.0f)
            val sample = (clamped * 32767.0f).toInt()
            result[index * 2] = sample.toByte()
            result[index * 2 + 1] = (sample shr 8).toByte()
        }
        return result
    }

    companion object {
        private const val MODEL_DIR = "vits-melo-tts-zh_en"
        private const val OFFLINE_VOICE_ID = "melo-zh-en-female"
        private const val OFFLINE_VOICE_NAME = "MeloTTS Chinese Female"
        private const val MIN_SPEED = 0.5f
        private const val MAX_SPEED = 2.0f
        private const val RULE_FSTS = "$MODEL_DIR/phone.fst,$MODEL_DIR/date.fst,$MODEL_DIR/number.fst"
    }
}
