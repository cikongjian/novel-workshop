package com.novelworkshop.reader

import android.content.Context
import android.net.Uri

class ShellConfigStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun resolveEntryUrl(defaultUrl: String): String {
        return normalizeHttpUrl(prefs.getString(KEY_ENTRY_URL_OVERRIDE, null))
            ?: normalizeHttpUrl(defaultUrl)
            ?: defaultUrl
    }

    fun persistEntryUrlOverride(entryUrl: String): String? {
        val normalized = normalizeHttpUrl(entryUrl) ?: return null
        prefs.edit().putString(KEY_ENTRY_URL_OVERRIDE, normalized).apply()
        return normalized
    }

    fun clearEntryUrlOverride() {
        prefs.edit().remove(KEY_ENTRY_URL_OVERRIDE).apply()
    }

    fun normalizeHttpUrl(rawUrl: String?): String? {
        val trimmed = rawUrl?.trim().orEmpty()
        if (trimmed.isEmpty()) return null

        val uri = Uri.parse(trimmed)
        val scheme = uri.scheme?.lowercase() ?: return null
        val host = uri.host?.trim().orEmpty()
        if ((scheme != "http" && scheme != "https") || host.isEmpty()) return null

        return uri.toString()
    }

    fun resolveHotUpdateConfigUrl(explicitConfigUrl: String, entryUrl: String): String? {
        normalizeHttpUrl(explicitConfigUrl)?.let { return it }

        val entryUri = Uri.parse(normalizeHttpUrl(entryUrl) ?: return null)
        return Uri.Builder()
            .scheme(entryUri.scheme)
            .encodedAuthority(entryUri.encodedAuthority)
            .encodedPath("/app-shell/update.json")
            .build()
            .toString()
    }

    companion object {
        private const val PREFS_NAME = "nw-reader-shell"
        private const val KEY_ENTRY_URL_OVERRIDE = "entry_url_override"
    }
}
