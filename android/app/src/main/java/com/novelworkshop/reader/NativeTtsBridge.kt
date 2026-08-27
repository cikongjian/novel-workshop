package com.novelworkshop.reader

import android.content.Context
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject

class NativeTtsBridge(
    context: Context,
    private val dispatchScript: (String) -> Unit,
    private val openTtsSettingsAction: () -> Boolean,
    private val installTtsDataAction: () -> Boolean,
    private val keepScreenOnAction: (Boolean) -> Unit = {},
) {
    private val appContext = context.applicationContext
    private val playbackLifecycle = NativeTtsPlaybackLifecycle(appContext, keepScreenOnAction)
    private val queuePlayer = NativeTtsQueuePlayer(
        lifecycle = playbackLifecycle,
        selectEngine = { voiceName -> selectReadySpeakEngine(voiceName) },
        dispatchEvent = { type, requestId, message, voiceName, engineId, available, queueIndex, queueTotal, paragraphIndex, text ->
            dispatchEventSafely(
                type = type,
                requestId = requestId,
                message = message,
                voiceName = voiceName,
                engineId = engineId,
                available = available,
                queueIndex = queueIndex,
                queueTotal = queueTotal,
                paragraphIndex = paragraphIndex,
                text = text,
            )
        },
        isAvailable = { selectStatusEngine()?.hasUsableVoice() == true },
    )

    @Volatile
    private var systemEngine: ReaderTtsEngine? = null

    @Volatile
    private var offlineEngine: ReaderTtsEngine? = null

    init {
        TtsPlaybackController.registerStopPlaybackAction {
            stop(null)
        }
    }

    init {
        getSystemEngine()
    }

    @JavascriptInterface
    fun isAvailable(): Boolean {
        return selectStatusEngine()?.hasUsableVoice() == true
    }

    @JavascriptInterface
    fun getVoicesJson(): String {
        return buildVoicesArray().toString()
    }

    @JavascriptInterface
    fun getStatusJson(): String {
        return buildStatusPayload().toString()
    }

    @JavascriptInterface
    fun speak(requestId: String, text: String, rate: Double, pitch: Double, voiceName: String): Boolean {
        playbackLifecycle.setPreview(text)
        val candidates = selectSpeakEngines(voiceName)
        if (candidates.isEmpty()) {
            dispatchEvent(type = "error", requestId = requestId, message = "安卓本地语音暂不可用，请先检查系统 TTS 或使用内置离线语音")
            return false
        }

        for (engine in candidates) {
            if (!engine.isReady() || !engine.hasUsableVoice()) continue
            if (engine.speak(requestId, text, rate, pitch, voiceName)) {
                return true
            }
        }

        val system = getSystemEngine()
        val offline = getOfflineEngine()
        val message = when {
            system?.isReady() == true && system.hasUsableVoice() != true && offline?.hasUsableVoice() != true ->
                "未检测到可用中文语音，且内置离线语音当前不可用，请先安装系统中文语音"
            offline?.hasUsableVoice() == true ->
                "内置离线语音调用失败，请稍后重试"
            else -> "安卓本地语音暂未就绪，请稍后重试"
        }
        dispatchEvent(type = "error", requestId = requestId, message = message)
        return false
    }

    @JavascriptInterface
    fun speakQueue(requestId: String, segmentsJson: String, rate: Double, pitch: Double, voiceName: String): Boolean {
        return queuePlayer.speakQueue(requestId, segmentsJson, rate, pitch, voiceName)
    }

    @JavascriptInterface
    fun supportsQueue(): Boolean = true

    @JavascriptInterface
    fun stop(requestId: String?) {
        if (queuePlayer.stop(requestId)) return
        getSystemEngine()?.stop(requestId)
        getOfflineEngine()?.stop(requestId)
    }

    @JavascriptInterface
    fun openTtsSettings(): Boolean = openTtsSettingsAction()

    @JavascriptInterface
    fun installTtsData(): Boolean = installTtsDataAction()

    @JavascriptInterface
    fun canInstallTtsData(): Boolean = true

    @JavascriptInterface
    fun canOpenTtsSettings(): Boolean = true

    @JavascriptInterface
    fun getPreferredSetupAction(): String {
        val system = systemEngine
        val offline = getOfflineEngine()
        return when {
            system?.hasUsableVoice() == true -> "none"
            offline?.hasUsableVoice() == true -> "none"
            system == null -> "settings"
            !system.isReady() -> "settings"
            !system.hasUsableVoice() -> "install"
            else -> "none"
        }
    }

    fun dispatchReady() {
        if (selectStatusEngine()?.isReady() != true) return
        dispatchEvent(type = "ready", voices = buildVoicesArray())
    }

    fun dispatchVoices() {
        dispatchEvent(type = "voices", voices = buildVoicesArray())
    }

    fun isPlaybackActive(): Boolean = playbackLifecycle.isActive()

    fun shutdown() {
        queuePlayer.shutdown()
        playbackLifecycle.shutdown()
        TtsPlaybackController.clearStopPlaybackAction()
        systemEngine?.shutdown()
        offlineEngine?.shutdown()
    }

    private fun buildVoicesArray(): JSONArray {
        val result = JSONArray()

        for (voice in collectVoices()) {
            val item = JSONObject()
            item.put("name", voice.name)
            item.put("lang", voice.lang)
            item.put("default", voice.isDefault)
            item.put("localService", voice.localService)
            item.put("voiceURI", voice.voiceURI)
            result.put(item)
        }

        return result
    }

    private fun dispatchEvent(
        type: String,
        requestId: String? = null,
        message: String? = null,
        voiceName: String? = null,
        voices: JSONArray? = null,
    ) {
        val payload = buildStatusPayload()
        payload.put("type", type)
        if (!requestId.isNullOrBlank()) payload.put("requestId", requestId)
        if (!message.isNullOrBlank()) payload.put("message", message)
        if (!voiceName.isNullOrBlank()) payload.put("voiceName", voiceName)
        if (voices != null) payload.put("voices", voices)

        dispatchScript("window.dispatchEvent(new CustomEvent('nw-android-tts',{detail:$payload}));")
    }

    private fun getSystemEngine(): ReaderTtsEngine? {
        systemEngine?.let { return it }
        return synchronized(this) {
            systemEngine ?: createEngine("system") {
                SystemTtsEngine(
                    context = appContext,
                    eventListener = { event -> dispatchEngineEvent("system", event) },
                    onReadyCallback = {
                        dispatchReady()
                        dispatchVoices()
                    },
                )
            }.also { created ->
                systemEngine = created
            }
        }
    }

    private fun getOfflineEngine(): ReaderTtsEngine? {
        offlineEngine?.let { return it }
        return synchronized(this) {
            offlineEngine ?: createEngine("offline-sherpa") {
                OfflineSherpaTtsEngine(appContext) { event ->
                    dispatchEngineEvent("offline-sherpa", event)
                }
            }.also { created ->
                offlineEngine = created
            }
        }
    }

    private fun selectStatusEngine(): ReaderTtsEngine? {
        val system = systemEngine
        val offline = getOfflineEngine()
        return when {
            system?.hasUsableVoice() == true -> system
            offline?.hasUsableVoice() == true -> offline
            system?.isReady() == true -> system
            offline?.isReady() == true -> offline
            system != null -> system
            else -> offline
        }
    }

    private fun createEngine(engineId: String, factory: () -> ReaderTtsEngine): ReaderTtsEngine? {
        return try {
            factory()
        } catch (error: Throwable) {
            dispatchEventSafely(
                type = "error",
                message = error.message ?: "Failed to initialize Android TTS engine",
                engineId = engineId,
            )
            null
        }
    }

    private fun selectSpeakEngines(voiceName: String): List<ReaderTtsEngine> {
        val existingSystem = systemEngine
        val offline = getOfflineEngine()
        val preferOffline = isOfflineVoiceRequested(voiceName)
        val ordered = when {
            preferOffline -> listOfNotNull(offline, existingSystem ?: getSystemEngine())
            existingSystem?.hasUsableVoice() == true -> listOfNotNull(existingSystem, offline)
            offline?.hasUsableVoice() == true -> listOfNotNull(offline, existingSystem ?: getSystemEngine())
            else -> listOfNotNull(existingSystem ?: getSystemEngine(), offline)
        }
        return ordered.distinctBy { it.engineId }
    }

    private fun selectReadySpeakEngine(voiceName: String): ReaderTtsEngine? {
        return selectSpeakEngines(voiceName).firstOrNull { engine ->
            engine.isReady() && engine.hasUsableVoice()
        }
    }

    private fun isOfflineVoiceRequested(voiceName: String): Boolean {
        val normalized = voiceName.trim()
        if (normalized.isBlank()) return false
        return normalized.equals("MeloTTS Chinese Female", ignoreCase = true) ||
            normalized.startsWith("offline-sherpa", ignoreCase = true)
    }

    private fun dispatchEventSafely(
        type: String,
        requestId: String? = null,
        message: String? = null,
        voiceName: String? = null,
        engineId: String = "none",
        available: Boolean = false,
        voices: JSONArray? = null,
        queueIndex: Int? = null,
        queueTotal: Int? = null,
        paragraphIndex: Int? = null,
        text: String? = null,
    ) {
        val payload = selectStatusEngine()?.let { buildStatusPayload() } ?: JSONObject().apply {
            put("engineId", engineId)
            put("ready", false)
            put("available", available)
            put("voiceCount", 0)
            put("needsInstall", false)
            put("needsSettings", true)
            put("message", "")
            put("preferredSetupAction", "settings")
        }
        payload.put("type", type)
        if (!requestId.isNullOrBlank()) payload.put("requestId", requestId)
        if (!message.isNullOrBlank()) payload.put("message", message)
        if (!voiceName.isNullOrBlank()) payload.put("voiceName", voiceName)
        payload.put("engineId", engineId)
        payload.put("available", available || payload.optBoolean("available"))
        if (voices != null) payload.put("voices", voices)
        if (queueIndex != null) payload.put("queueIndex", queueIndex)
        if (queueTotal != null) payload.put("queueTotal", queueTotal)
        if (paragraphIndex != null) payload.put("paragraphIndex", paragraphIndex)
        if (!text.isNullOrBlank()) payload.put("text", text)
        dispatchScript("window.dispatchEvent(new CustomEvent('nw-android-tts',{detail:$payload}));")
    }

    private fun dispatchEngineEvent(engineId: String, event: NativeTtsEngineEvent) {
        if (queuePlayer.handleEngineEvent(engineId, event)) return
        if (queuePlayer.isQueueUtteranceEvent(event.requestId)) return

        when (event.type) {
            "start" -> {
                playbackLifecycle.begin(event.requestId.orEmpty(), engineId, event.voiceName.orEmpty())
            }
            "end", "stop", "error" -> {
                playbackLifecycle.finish()
            }
        }
        dispatchEventSafely(
            type = event.type,
            requestId = event.requestId,
            message = event.message,
            voiceName = event.voiceName,
            engineId = engineId,
            available = selectStatusEngine()?.hasUsableVoice() == true,
        )
    }

    private fun collectVoices(): List<NativeTtsVoiceInfo> {
        val voices = linkedMapOf<String, NativeTtsVoiceInfo>()
        for (voice in systemEngine?.getVoices().orEmpty()) {
            voices.putIfAbsent("${voice.name}::${voice.lang}", voice)
        }
        for (voice in getOfflineEngine()?.getVoices().orEmpty()) {
            voices.putIfAbsent("${voice.name}::${voice.lang}", voice)
        }
        return voices.values.toList()
    }

    private fun buildStatusPayload(): JSONObject {
        val engine = selectStatusEngine()
        val system = systemEngine
        val offline = getOfflineEngine()
        val ready = engine?.isReady() == true
        val available = engine?.hasUsableVoice() == true
        val needsInstall = !available && system?.isReady() == true && system.hasUsableVoice() != true && offline?.hasUsableVoice() != true
        val needsSettings = !available && offline?.hasUsableVoice() != true
        val payload = JSONObject()
        payload.put("engineId", engine?.engineId ?: "none")
        payload.put("ready", ready)
        payload.put("available", available)
        payload.put("voiceCount", collectVoices().size)
        payload.put("needsInstall", needsInstall)
        payload.put("needsSettings", needsSettings)
        payload.put(
            "message",
            when {
                available -> ""
                needsInstall -> "未检测到可用中文语音，且内置离线语音当前不可用，请先安装或切换系统中文语音"
                needsSettings -> "安卓本地语音暂未就绪，请稍后重试"
                else -> ""
            },
        )
        payload.put("preferredSetupAction", getPreferredSetupAction())
        return payload
    }

}
