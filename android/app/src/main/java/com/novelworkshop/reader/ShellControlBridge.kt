package com.novelworkshop.reader

import android.webkit.JavascriptInterface

class ShellControlBridge(
    private val retryAction: () -> Unit,
    private val openExternalAction: (String?) -> Unit,
) {
    @JavascriptInterface
    fun retry() {
        retryAction()
    }

    @JavascriptInterface
    fun openExternal(url: String?) {
        openExternalAction(url)
    }
}
