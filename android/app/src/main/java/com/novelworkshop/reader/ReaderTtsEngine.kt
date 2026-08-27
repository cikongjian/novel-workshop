package com.novelworkshop.reader

data class NativeTtsVoiceInfo(
    val name: String,
    val lang: String,
    val isDefault: Boolean = false,
    val localService: Boolean = true,
    val voiceURI: String = "android:$name",
)

data class NativeTtsEngineEvent(
    val type: String,
    val requestId: String? = null,
    val message: String? = null,
    val voiceName: String? = null,
)

interface ReaderTtsEngine {
    val engineId: String

    fun isReady(): Boolean

    fun hasUsableVoice(): Boolean

    fun getVoices(): List<NativeTtsVoiceInfo>

    fun speak(requestId: String, text: String, rate: Double, pitch: Double, voiceName: String): Boolean

    fun stop(requestId: String?): Boolean

    fun shutdown()
}
