# Android Reader Shell

这个目录是一个最小 Android WebView 壳，目标只有一件事：
让现有网页在 Android 安装后优先使用系统 `TextToSpeech`，不走服务端 TTS。

## 当前方案

- `WebView` 加载你现有部署好的网页。
- 原生 `TextToSpeech` 通过 `window.AndroidTTS` 暴露给前端。
- 前端 `useClientTTS` 会优先检测 `AndroidTTS`，存在时直接走手机本机语音。
- 如果不是 Android 壳环境，前端仍然回退到浏览器 `speechSynthesis`。

## 构建

壳应用需要一个已部署的服务地址。构建前请把加载地址改成你自己的部署地址：

```text
https://your-domain.example.com/
```

先安装 Android Studio 和 SDK，然后在这个目录执行：

```bash
./gradlew assembleDebug
```

如果你要出一个可分发的 release 包，也可以直接：

```bash
./gradlew assembleRelease
```

默认情况下，`release` 会回退到 debug keystore 签名，方便你先真机安装验证。
如果要正式分发，请传入自己的 keystore：

```bash
./gradlew assembleRelease \
  -PNW_RELEASE_STORE_FILE=C:\\path\\to\\release.keystore \
  -PNW_RELEASE_STORE_PASSWORD=*** \
  -PNW_RELEASE_KEY_ALIAS=*** \
  -PNW_RELEASE_KEY_PASSWORD=***
```

也可以在 `android/release-signing.local.properties` 写入同名配置。
仓库里提供了模板：

```text
android/release-signing.local.properties.example
```

应用名、包名、版本号默认从 `android/gradle.properties` 读取：

```text
NW_APP_NAME
NW_APPLICATION_ID
NW_VERSION_CODE
NW_VERSION_NAME
```

也可以在本地额外维护一份模板副本做发布前改值：

```text
android/release-branding.local.properties.example
```

如果你想把最终分发文件统一拷贝到 `android/releases/`，可以直接执行：

```bash
./gradlew stageReleaseArtifacts
```

它会生成：

- `android/releases/<app-name>-v<version>-<code>-release.apk`
- `android/releases/<app-name>-v<version>-<code>-release.aab`

如果你想连同环境设置、SHA-256 校验和 APK 签名信息一起自动整理，直接运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\build-release.ps1
```

脚本还会额外生成：

- `android/releases/release-manifest.txt`

如果后面你换域名，或者需要切到别的入口，再覆盖这个参数：

```bash
./gradlew assembleDebug -PNW_WEB_URL=https://你的新地址
```

如果你是本地联调，也可以临时用：

```bash
./gradlew assembleDebug -PNW_WEB_URL=http://10.0.2.2:5173
```

说明：

- `10.0.2.2` 只适用于 Android 模拟器访问宿主机。
- 真机安装时要换成手机能访问到的实际域名或局域网地址。
- 当前机器如果 SDK 只有 Android 36 平台，工程会使用 `compileSdk=36`，但 `targetSdk` 仍保持 34。
- 热更新入口默认读取 `<你的站点>/app-shell/update.json`，可以用 `entryUrl` 远程切换前端入口，不需要重新发 APK。

## 品牌风格

- Android 图标使用仓库现有方形品牌标的同一套色彩和星形符号。
- 已同时配置自适应图标、圆形图标和启动背景，避免 Android 上出现另一套临时视觉。

## JS Bridge

原生会向网页注入：

```ts
window.AndroidTTS.isAvailable(): boolean
window.AndroidTTS.getVoicesJson(): string
window.AndroidTTS.speak(requestId, text, rate, pitch, voiceName): boolean
window.AndroidTTS.stop(requestId?): void
```

并通过浏览器事件把状态回传给前端：

```ts
window.addEventListener('nw-android-tts', (event) => {
  console.log(event.detail)
})
```

事件类型包括：

- `ready`
- `voices`
- `start`
- `end`
- `stop`
- `error`
