package com.novelworkshop.reader

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Looper
import android.net.Uri
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.view.WindowManager
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var nativeTtsBridge: NativeTtsBridge
    private lateinit var shellControlBridge: ShellControlBridge
    private lateinit var shellConfigStore: ShellConfigStore
    private val backgroundExecutor = Executors.newSingleThreadExecutor()
    private var lastEntryUrl = ""
    private var lastOfflineReason = ""

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
        super.onCreate(savedInstanceState)

        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        shellConfigStore = ShellConfigStore(this)
        webView = WebView(this)
        webView.setBackgroundColor(Color.BLACK)
        nativeTtsBridge = NativeTtsBridge(
            context = this,
            dispatchScript = { script ->
                webView.post {
                    if (!isDestroyed) {
                        webView.evaluateJavascript(script, null)
                    }
                }
            },
            openTtsSettingsAction = { openTtsSettings() },
            installTtsDataAction = { installTtsData() },
            keepScreenOnAction = { enabled: Boolean ->
                if (enabled) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            },
        )
        shellControlBridge = ShellControlBridge(
            retryAction = {
                webView.post {
                    loadEntryUrl(lastEntryUrl.ifBlank { shellConfigStore.resolveEntryUrl(BuildConfig.WEB_URL) }, forceReload = true)
                }
            },
            openExternalAction = { url ->
                openExternalUrl(url ?: lastEntryUrl)
            },
        )

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            builtInZoomControls = false
            displayZoomControls = false
            loadsImagesAutomatically = true
            useWideViewPort = true
            loadWithOverviewMode = false
            allowFileAccess = true
            allowContentAccess = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportMultipleWindows(false)
            setSupportZoom(false)
            textZoom = 100
            userAgentString = buildString {
                append(userAgentString)
                append(' ')
                append(BuildConfig.SHELL_USER_AGENT_SUFFIX)
            }
            disableAutoDarkening(this)
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val target = request?.url?.toString().orEmpty()
                if (target.isBlank()) return false
                return !isWebUrl(target) && openExternalUrl(target)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                nativeTtsBridge.dispatchReady()
                nativeTtsBridge.dispatchVoices()
                injectShellCompatCss()
                dispatchShellRuntime()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame != true) return
                showOfflineFallback(
                    failingUrl = request.url?.toString().orEmpty(),
                    reason = error?.description?.toString().orEmpty(),
                )
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: android.webkit.WebResourceResponse?,
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                if (request?.isForMainFrame != true) return
                val statusCode = errorResponse?.statusCode ?: return
                if (statusCode < 400) return
                showOfflineFallback(
                    failingUrl = request.url?.toString().orEmpty(),
                    reason = "HTTP $statusCode",
                )
            }
        }
        webView.addJavascriptInterface(nativeTtsBridge, "AndroidTTS")
        webView.addJavascriptInterface(shellControlBridge, "AndroidShellControl")

        setContentView(webView)

        val initialEntryUrl = shellConfigStore.resolveEntryUrl(BuildConfig.WEB_URL)
        lastEntryUrl = initialEntryUrl
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            loadEntryUrl(initialEntryUrl)
        }

        checkHotUpdate(initialEntryUrl)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        nativeTtsBridge.dispatchVoices()
        dispatchShellRuntime()
    }

    override fun onPause() {
        if (!nativeTtsBridge.isPlaybackActive()) {
            webView.onPause()
        }
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
            return
        }
        super.onBackPressed()
    }

    override fun onDestroy() {
        backgroundExecutor.shutdownNow()
        if (this::webView.isInitialized) {
            webView.removeJavascriptInterface("AndroidShellControl")
            webView.removeJavascriptInterface("AndroidTTS")
            webView.stopLoading()
            webView.destroy()
        }
        if (this::nativeTtsBridge.isInitialized) {
            nativeTtsBridge.shutdown()
        }
        super.onDestroy()
    }

    private fun checkHotUpdate(seedEntryUrl: String) {
        val configUrl = shellConfigStore.resolveHotUpdateConfigUrl(BuildConfig.HOT_UPDATE_CONFIG_URL, seedEntryUrl) ?: return
        backgroundExecutor.execute {
            val checker = ShellUpdateChecker(shellConfigStore)
            val payload = checker.fetch(configUrl) ?: return@execute

            if (!checker.isShellVersionSupported(BuildConfig.VERSION_NAME, payload.minimumShellVersion)) {
                runOnUiThread {
                    Toast.makeText(
                        this,
                        payload.message ?: "A newer APK is required for this release.",
                        Toast.LENGTH_LONG,
                    ).show()
                }
                return@execute
            }

            val updatedEntryUrl = payload.entryUrl ?: return@execute
            val persistedEntryUrl = shellConfigStore.persistEntryUrlOverride(updatedEntryUrl) ?: return@execute
            if (persistedEntryUrl == lastEntryUrl) return@execute

            runOnUiThread {
                loadEntryUrl(persistedEntryUrl, forceReload = true)
                if (!payload.message.isNullOrBlank()) {
                    Toast.makeText(this, payload.message, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun loadEntryUrl(entryUrl: String, forceReload: Boolean = false) {
        val normalizedUrl = shellConfigStore.normalizeHttpUrl(entryUrl)
        if (normalizedUrl.isNullOrBlank()) {
            showOfflineFallback(entryUrl, "Invalid shell entry URL")
            return
        }

        lastEntryUrl = normalizedUrl
        lastOfflineReason = ""
        val targetUrl = Uri.parse(normalizedUrl).buildUpon()
            .appendQueryParameter("nwShell", "android")
            .appendQueryParameter("nwShellVersion", BuildConfig.VERSION_NAME)
            .build()
            .toString()

        if (!forceReload && webView.url == targetUrl) return
        webView.loadUrl(targetUrl)
    }

    private fun showOfflineFallback(failingUrl: String, reason: String) {
        if (failingUrl.startsWith(OFFLINE_ASSET_URL)) return

        lastOfflineReason = reason.ifBlank { "Network unavailable" }
        val offlineUrl = Uri.parse(OFFLINE_ASSET_URL).buildUpon()
            .appendQueryParameter("entryUrl", lastEntryUrl.ifBlank { failingUrl })
            .appendQueryParameter("reason", lastOfflineReason)
            .build()
            .toString()
        webView.loadUrl(offlineUrl)
    }

    private fun dispatchShellRuntime() {
        if (!this::webView.isInitialized) return

        val detail = JSONObject().apply {
            put("platform", "android")
            put("appVersion", BuildConfig.VERSION_NAME)
            put("entryUrl", lastEntryUrl)
            put("offlineReason", lastOfflineReason)
            put("hotUpdateConfigUrl", shellConfigStore.resolveHotUpdateConfigUrl(BuildConfig.HOT_UPDATE_CONFIG_URL, lastEntryUrl) ?: "")
        }

        val script = """
            (() => {
              const detail = $detail;
              window.__NW_ANDROID_SHELL__ = detail;
              window.dispatchEvent(new CustomEvent('nw-shell-ready', { detail }));
            })();
        """.trimIndent()

        webView.post {
            if (!isDestroyed) {
                webView.evaluateJavascript(script, null)
            }
        }
    }

    private fun injectShellCompatCss() {
        if (!this::webView.isInitialized) return

        val script = """
            (() => {
              const css = ${JSONObject.quote(ANDROID_SHELL_COMPAT_CSS)};
              const id = 'nw-android-shell-compat-style';
              let style = document.getElementById(id);
              if (!style) {
                style = document.createElement('style');
                style.id = id;
                document.head.appendChild(style);
              }
              style.textContent = css;
              document.documentElement.classList.remove('dark');
              document.documentElement.style.colorScheme = 'light';
            })();
        """.trimIndent()

        webView.post {
            if (!isDestroyed) {
                webView.evaluateJavascript(script, null)
            }
        }
    }

    private fun isWebUrl(targetUrl: String): Boolean {
        val scheme = Uri.parse(targetUrl).scheme?.lowercase()
        return scheme == "http" || scheme == "https" || targetUrl.startsWith(OFFLINE_ASSET_URL)
    }

    private fun disableAutoDarkening(settings: WebSettings) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
            @Suppress("DEPRECATION")
            WebSettingsCompat.setForceDark(settings, WebSettingsCompat.FORCE_DARK_OFF)
        }
    }

    private fun openExternalUrl(targetUrl: String): Boolean {
        if (targetUrl.isBlank()) return false
        return startActivitySafely(Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)))
    }

    private fun openTtsSettings(): Boolean {
        return openActivity(Intent(TTS_SETTINGS_ACTION)) ||
            openActivity(Intent(Settings.ACTION_SETTINGS))
    }

    private fun installTtsData(): Boolean {
        return openActivity(Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)) || openTtsSettings()
    }

    private fun openActivity(intent: Intent): Boolean {
        return startActivitySafely(intent)
    }

    private fun startActivitySafely(intent: Intent): Boolean {
        val resolvable = try {
            intent.resolveActivity(packageManager) != null
        } catch (_: Throwable) {
            false
        }
        if (!resolvable) return false

        if (Looper.myLooper() == Looper.getMainLooper()) {
            return try {
                startActivity(intent)
                true
            } catch (_: Throwable) {
                false
            }
        }

        val opened = AtomicBoolean(false)
        val latch = CountDownLatch(1)

        runOnUiThread {
            try {
                startActivity(intent)
                opened.set(true)
            } catch (_: Throwable) {
                opened.set(false)
            } finally {
                latch.countDown()
            }
        }

        return try {
            latch.await(2, TimeUnit.SECONDS)
            opened.get()
        } catch (_: Throwable) {
            false
        }
    }

    companion object {
        private const val OFFLINE_ASSET_URL = "file:///android_asset/offline.html"
        private const val TTS_SETTINGS_ACTION = "com.android.settings.TTS_SETTINGS"
        private val ANDROID_SHELL_COMPAT_CSS = """
            html,
            body,
            .mobile-focus-page {
              color-scheme: light !important;
            }

            .mobile-app-hero .mobile-focus-metrics {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            html .mobile-published-page {
              --mpp-hero-hint: #476178 !important;
              --mpp-card-border: rgba(15, 118, 110, 0.1) !important;
              --mpp-card-bg: rgba(255, 255, 255, 0.94) !important;
              --mpp-cover-from: #15424f !important;
              --mpp-cover-to: #2563eb !important;
              --mpp-chip-bg: rgba(15, 118, 110, 0.12) !important;
              --mpp-chip-color: #0f766e !important;
              --mpp-chip-plain-bg: rgba(15, 23, 42, 0.06) !important;
              --mpp-chip-plain-color: #516577 !important;
              --mpp-chip-muted-bg: rgba(148, 163, 184, 0.18) !important;
              --mpp-chip-muted-color: #64748b !important;
              --mpp-metrics-bg: rgba(37, 99, 235, 0.08) !important;
              --mpp-metrics-color: #2454b6 !important;
              --mpp-note-color: #516577 !important;
              --mpp-note-summary-color: #0f766e !important;
              --mpp-btn-warn-bg: rgba(245, 158, 11, 0.12) !important;
              --mpp-btn-warn-color: #b45309 !important;
              --mpp-btn-warn-border: rgba(245, 158, 11, 0.18) !important;
              --mpp-btn-danger-bg: rgba(239, 68, 68, 0.1) !important;
              --mpp-btn-danger-color: #b91c1c !important;
              --mpp-btn-danger-border: rgba(239, 68, 68, 0.16) !important;
              --mpp-link-color: #2454b6 !important;
              --mpp-dialog-hint: #516577 !important;
            }
        """.trimIndent()
    }
}
