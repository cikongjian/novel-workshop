package com.novelworkshop.reader

import org.json.JSONArray

data class NativeTtsQueueSegment(
    val text: String,
    val paragraphIndex: Int,
)

class NativeTtsQueuePlayer(
    private val lifecycle: NativeTtsPlaybackLifecycle,
    private val selectEngine: (String) -> ReaderTtsEngine?,
    private val dispatchEvent: (
        type: String,
        requestId: String?,
        message: String?,
        voiceName: String?,
        engineId: String,
        available: Boolean,
        queueIndex: Int?,
        queueTotal: Int?,
        paragraphIndex: Int?,
        text: String?,
    ) -> Unit,
    private val isAvailable: () -> Boolean,
) {
    private val lock = Any()

    @Volatile
    private var activeRunId = ""

    @Volatile
    private var activeEngine: ReaderTtsEngine? = null

    private var activeVoiceName = ""
    private var activeRate = 1.0
    private var activePitch = 1.0
    private var segments: List<NativeTtsQueueSegment> = emptyList()
    private var currentIndex = -1
    private var stopping = false

    fun speakQueue(
        requestId: String,
        segmentsJson: String,
        rate: Double,
        pitch: Double,
        voiceName: String,
    ): Boolean {
        val parsedSegments = parseSegments(segmentsJson)
        if (requestId.isBlank() || parsedSegments.isEmpty()) return false

        val engine = selectEngine(voiceName) ?: run {
            dispatchEvent(
                "error",
                requestId,
                "Android native TTS is not available",
                voiceName,
                "none",
                isAvailable(),
                null,
                parsedSegments.size,
                null,
                null,
            )
            return false
        }

        synchronized(lock) {
            stopLocked(dispatchStop = false)
            activeRunId = requestId
            activeEngine = engine
            activeVoiceName = voiceName
            activeRate = rate
            activePitch = pitch
            segments = parsedSegments
            currentIndex = -1
            stopping = false
        }

        lifecycle.setPreview(parsedSegments.firstOrNull()?.text.orEmpty())
        lifecycle.begin(requestId, engine.engineId, voiceName)
        dispatchEvent(
            "queue-start",
            requestId,
            null,
            voiceName,
            engine.engineId,
            isAvailable(),
            0,
            parsedSegments.size,
            parsedSegments.firstOrNull()?.paragraphIndex,
            parsedSegments.firstOrNull()?.text,
        )
        return speakNext(requestId)
    }

    fun stop(requestId: String?): Boolean {
        val stoppedRunId: String
        val stoppedEngineId: String
        val stoppedVoiceName: String
        val stoppedIndex: Int
        val stoppedSegments: List<NativeTtsQueueSegment>
        synchronized(lock) {
            if (activeRunId.isBlank()) return false
            if (!requestId.isNullOrBlank() && requestId != activeRunId) return false
            stoppedRunId = activeRunId
            stoppedEngineId = activeEngine?.engineId ?: "none"
            stoppedVoiceName = activeVoiceName
            stoppedIndex = currentIndex
            stoppedSegments = segments
            stopLocked(dispatchStop = false)
        }
        dispatchEvent(
            "stop",
            stoppedRunId,
            null,
            stoppedVoiceName,
            stoppedEngineId,
            isAvailable(),
            stoppedIndex.takeIf { it >= 0 },
            stoppedSegments.size.takeIf { it > 0 },
            stoppedSegments.getOrNull(stoppedIndex)?.paragraphIndex,
            null,
        )
        lifecycle.finish()
        return true
    }

    fun handleEngineEvent(engineId: String, event: NativeTtsEngineEvent): Boolean {
        val runId = activeRunId
        if (runId.isBlank() || !event.requestId.orEmpty().startsWith("$runId:")) {
            return false
        }

        val index = parseSegmentIndex(event.requestId.orEmpty())
        val segment = segments.getOrNull(index)
        when (event.type) {
            "start" -> {
                dispatchEvent(
                    "start",
                    runId,
                    event.message,
                    event.voiceName,
                    engineId,
                    isAvailable(),
                    index,
                    segments.size,
                    segment?.paragraphIndex,
                    segment?.text,
                )
                return true
            }
            "end" -> {
                dispatchEvent(
                    "segment-end",
                    runId,
                    event.message,
                    event.voiceName,
                    engineId,
                    isAvailable(),
                    index,
                    segments.size,
                    segment?.paragraphIndex,
                    segment?.text,
                )
                if (runId == activeRunId && !stopping) {
                    if (index >= segments.lastIndex) {
                        finishQueue(runId, engineId, event.voiceName)
                    } else {
                        speakNext(runId)
                    }
                }
                return true
            }
            "stop" -> {
                if (!stopping) {
                    stop(runId)
                }
                return true
            }
            "error" -> {
                dispatchEvent(
                    "error",
                    runId,
                    event.message,
                    event.voiceName,
                    engineId,
                    isAvailable(),
                    index,
                    segments.size,
                    segment?.paragraphIndex,
                    segment?.text,
                )
                stop(runId)
                return true
            }
        }
        return false
    }

    fun isQueueUtteranceEvent(requestId: String?): Boolean {
        return requestId.orEmpty().contains(':')
    }

    fun shutdown() {
        synchronized(lock) {
            stopLocked(dispatchStop = false)
        }
    }

    private fun speakNext(runId: String): Boolean {
        val engine: ReaderTtsEngine
        val segment: NativeTtsQueueSegment
        val utteranceId: String
        synchronized(lock) {
            if (runId != activeRunId || stopping) return false
            val nextIndex = currentIndex + 1
            segment = segments.getOrNull(nextIndex) ?: return false
            engine = activeEngine ?: return false
            currentIndex = nextIndex
            utteranceId = "$runId:$nextIndex"
        }

        dispatchEvent(
            "segment-start",
            runId,
            null,
            activeVoiceName,
            engine.engineId,
            isAvailable(),
            currentIndex,
            segments.size,
            segment.paragraphIndex,
            segment.text,
        )

        val accepted = engine.speak(utteranceId, segment.text, activeRate, activePitch, activeVoiceName)
        if (!accepted) {
            dispatchEvent(
                "error",
                runId,
                "Android native TTS failed to start the next segment",
                activeVoiceName,
                engine.engineId,
                isAvailable(),
                currentIndex,
                segments.size,
                segment.paragraphIndex,
                segment.text,
            )
            stop(runId)
        }
        return accepted
    }

    private fun finishQueue(runId: String, engineId: String, voiceName: String?) {
        synchronized(lock) {
            if (runId != activeRunId) return
            activeRunId = ""
            activeEngine = null
            stopping = false
        }
        dispatchEvent(
            "end",
            runId,
            null,
            voiceName,
            engineId,
            isAvailable(),
            segments.lastIndex.takeIf { it >= 0 },
            segments.size,
            segments.lastOrNull()?.paragraphIndex,
            null,
        )
        lifecycle.finish()
    }

    private fun stopLocked(dispatchStop: Boolean) {
        stopping = true
        activeEngine?.stop(null)
        activeRunId = ""
        activeEngine = null
        activeVoiceName = ""
        currentIndex = -1
        segments = emptyList()
        stopping = false
        if (dispatchStop) {
            lifecycle.finish()
        }
    }

    private fun parseSegments(segmentsJson: String): List<NativeTtsQueueSegment> {
        return try {
            val array = JSONArray(segmentsJson)
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val text = item.optString("text").trim()
                    if (text.isBlank()) continue
                    add(
                        NativeTtsQueueSegment(
                            text = text,
                            paragraphIndex = item.optInt("paragraphIndex", index),
                        ),
                    )
                }
            }
        } catch (_: Throwable) {
            emptyList()
        }
    }

    private fun parseSegmentIndex(requestId: String): Int {
        return requestId.substringAfterLast(':', "-1").toIntOrNull() ?: -1
    }
}
