package com.novelworkshop.reader

import org.json.JSONObject
import java.io.BufferedInputStream
import java.net.HttpURLConnection
import java.net.URL

data class ShellUpdatePayload(
    val entryUrl: String?,
    val minimumShellVersion: String?,
    val message: String?,
)

class ShellUpdateChecker(
    private val configStore: ShellConfigStore,
) {
    fun fetch(configUrl: String): ShellUpdatePayload? {
        val connection = (URL(configUrl).openConnection() as? HttpURLConnection) ?: return null
        return try {
            connection.requestMethod = "GET"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.setRequestProperty("Accept", "application/json")
            connection.connect()

            if (connection.responseCode !in 200..299) {
                return null
            }

            val body = BufferedInputStream(connection.inputStream).bufferedReader(Charsets.UTF_8).use { it.readText() }
            val json = JSONObject(body)
            ShellUpdatePayload(
                entryUrl = configStore.normalizeHttpUrl(json.optString("entryUrl")),
                minimumShellVersion = json.optString("minimumShellVersion").ifBlank { null },
                message = json.optString("message").ifBlank { null },
            )
        } catch (_: Throwable) {
            null
        } finally {
            connection.disconnect()
        }
    }

    fun isShellVersionSupported(currentVersion: String, minimumVersion: String?): Boolean {
        if (minimumVersion.isNullOrBlank()) return true
        return compareSemver(currentVersion, minimumVersion) >= 0
    }

    private fun compareSemver(left: String, right: String): Int {
        val leftParts = left.split('.')
        val rightParts = right.split('.')
        val max = maxOf(leftParts.size, rightParts.size)

        for (index in 0 until max) {
            val leftValue = leftParts.getOrNull(index)?.toIntOrNull() ?: 0
            val rightValue = rightParts.getOrNull(index)?.toIntOrNull() ?: 0
            if (leftValue != rightValue) {
                return leftValue.compareTo(rightValue)
            }
        }

        return 0
    }

    companion object {
        private const val CONNECT_TIMEOUT_MS = 4_000
        private const val READ_TIMEOUT_MS = 4_000
    }
}
