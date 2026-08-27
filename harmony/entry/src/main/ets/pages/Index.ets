import { webview } from '@kit.ArkWeb';
import { http } from '@kit.NetworkKit';
import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { HarmonyTtsBridge } from '../bridge/HarmonyTtsBridge';
import { HarmonyShellBridge } from '../bridge/HarmonyShellBridge';
import { HarmonyShellConfig } from '../bridge/HarmonyShellConfig';
import { HarmonyBackgroundAudioTask } from '../bridge/HarmonyBackgroundAudioTask';

// 壳应用加载的服务地址，构建前改成自己的部署地址
const DEFAULT_WEB_URL: string = 'https://your-domain.example.com/';
const SHELL_VERSION: string = '1.0.0';

interface HotUpdatePayload {
  entryUrl?: string;
  minimumShellVersion?: string;
  message?: string;
}

class HttpRequestOptions {
  method: http.RequestMethod;
  connectTimeout: number;
  readTimeout: number;

  constructor(connectTimeout: number, readTimeout: number) {
    this.method = http.RequestMethod.GET;
    this.connectTimeout = connectTimeout;
    this.readTimeout = readTimeout;
  }
}

class HarmonyTtsProxy {
  private bridge: HarmonyTtsBridge;

  constructor(bridge: HarmonyTtsBridge) {
    this.bridge = bridge;
  }

  isAvailable(): boolean {
    return this.bridge.isAvailable();
  }

  getVoicesJson(): string {
    return this.bridge.getVoicesJson();
  }

  getStatusJson(): string {
    return this.bridge.getStatusJson();
  }

  speak(requestId: string, text: string, rate: number, pitch: number, voiceName: string): boolean {
    return this.bridge.speak(requestId, text, rate, pitch, voiceName);
  }

  speakQueue(requestId: string, segmentsJson: string, rate: number, pitch: number, voiceName: string): boolean {
    return this.bridge.speakQueue(requestId, segmentsJson, rate, pitch, voiceName);
  }

  supportsQueue(): boolean {
    return this.bridge.supportsQueue();
  }

  stop(): void {
    this.bridge.stop();
  }
}

class HarmonyShellProxy {
  private bridge: HarmonyShellBridge;

  constructor(bridge: HarmonyShellBridge) {
    this.bridge = bridge;
  }

  retry(): void {
    this.bridge.retry();
  }

  openExternal(url?: string): void {
    this.bridge.openExternal(url);
  }
}

class ShellRuntimePayload {
  platform: string;
  appVersion: string;
  entryUrl: string;
  offlineReason: string;

  constructor(platform: string, appVersion: string, entryUrl: string, offlineReason: string) {
    this.platform = platform;
    this.appVersion = appVersion;
    this.entryUrl = entryUrl;
    this.offlineReason = offlineReason;
  }
}

@Entry
@Component
struct Index {
  private webController: webview.WebviewController = new webview.WebviewController();
  private ttsBridge: HarmonyTtsBridge | null = null;
  private shellBridge: HarmonyShellBridge | null = null;
  private shellConfig: HarmonyShellConfig | null = null;
  private lastEntryUrl: string = '';
  private lastOfflineReason: string = '';
  private isOfflinePage: boolean = false;
  @State private webSrcString: string = 'about:blank';

  aboutToAppear(): void {
    const appContext: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
    this.shellConfig = new HarmonyShellConfig(appContext);

    this.ttsBridge = new HarmonyTtsBridge(
      (script: string): void => {
        try {
          this.webController.runJavaScript(script);
        } catch {
          // WebView 可能尚未就绪
        }
      },
      new HarmonyBackgroundAudioTask(appContext)
    );

    this.shellBridge = new HarmonyShellBridge(
      (): void => {
        if (this.lastEntryUrl) {
          this.navigateToEntry(this.lastEntryUrl);
        }
      },
      (url?: string): void => {
        this.openExternalUrl(url);
      }
    );

    // 首屏立即加载默认入口，避免停留在 about:blank 白屏；
    // 自定义 override 入口（热更新）在 controller 绑定后于 onControllerAttached 中解析切换
    this.lastEntryUrl = DEFAULT_WEB_URL;
    this.webSrcString = this.buildEntryUrl(DEFAULT_WEB_URL);
  }

  // controller 与 Web 组件完成绑定后再解析持久化的 override 入口，避免过早 loadUrl 抛异常被吞
  private resolveEntryAfterAttach(): void {
    const config: HarmonyShellConfig | null = this.shellConfig;
    if (!config) {
      return;
    }
    config.resolveEntryUrl(DEFAULT_WEB_URL).then((entryUrl: string): void => {
      if (entryUrl && entryUrl !== this.lastEntryUrl) {
        // 有 override 入口：loadUrl 会重新加载页面，已注册的 JS 代理随之生效
        this.navigateToEntry(entryUrl);
      } else {
        // 无 override：刷新一次让首屏（经 src 加载）也能拿到刚注册的 JS 代理
        this.lastEntryUrl = entryUrl || DEFAULT_WEB_URL;
        try {
          this.webController.refresh();
        } catch (err) {
          console.error('resolveEntryAfterAttach refresh failed: ' + JSON.stringify(err));
        }
      }
      this.checkHotUpdate(this.lastEntryUrl);
    }).catch((): void => {
      // 解析失败时保持已加载的默认入口，仍刷新一次确保代理生效
      try {
        this.webController.refresh();
      } catch (err) {
        console.error('resolveEntryAfterAttach fallback refresh failed: ' + JSON.stringify(err));
      }
      this.checkHotUpdate(DEFAULT_WEB_URL);
    });
  }

  aboutToDisappear(): void {
    if (this.ttsBridge) {
      this.ttsBridge.shutdown();
    }
  }

  onBackPress(): boolean {
    if (this.isOfflinePage) {
      return false;
    }
    if (this.webController.accessBackward()) {
      this.webController.backward();
      return true;
    }
    return false;
  }

  build(): void {
    Column() {
      Web({ src: this.webSrcString, controller: this.webController })
        .domStorageAccess(true)
        .javaScriptAccess(true)
        .zoomAccess(false)
        .width('100%')
        .height('100%')
        .backgroundColor('#0A1322')
        .onControllerAttached((): void => {
          // controller 已绑定：先注册 JS 代理（registerJavaScriptProxy 支持多对象，
          // 不像链式 .javaScriptProxy() 后者会覆盖前者导致 AndroidTTS 丢失），
          // 再解析 override 入口；二者都会触发页面（重新）加载使代理生效
          this.registerJsProxies();
          this.resolveEntryAfterAttach();
        })
        .onPageEnd((event: OnPageEndEvent): void => {
          if (this.isOfflinePage) {
            this.dispatchOfflineData();
            return;
          }
          this.dispatchShellRuntime();
          this.dispatchVoices();
        })
        .onErrorReceive((event: OnErrorReceiveEvent): void => {
          const req: WebResourceRequest | null = event?.request ?? null;
          const err: WebResourceError | null = event?.error ?? null;
          if (!req || !req.isMainFrame()) {
            return;
          }
          const failingUrl: string = req.getRequestUrl() ?? '';
          const errInfo: string = (err && err.getErrorInfo) ? err.getErrorInfo() : '';
          this.showOfflineFallback(failingUrl, errInfo);
        })
        .onHttpErrorReceive((event: OnHttpErrorReceiveEvent): void => {
          const req: WebResourceRequest | null = event?.request ?? null;
          const resp: WebResourceResponse | null = event?.response ?? null;
          if (!req || !req.isMainFrame()) {
            return;
          }
          const statusCode: number = (resp && resp.getResponseCode) ? resp.getResponseCode() : 0;
          if (statusCode < 400) {
            return;
          }
          const failingUrl: string = req.getRequestUrl() ?? '';
          this.showOfflineFallback(failingUrl, 'HTTP ' + statusCode.toString());
        })
    }
    .width('100%')
    .height('100%')
  }

  private navigateToEntry(entryUrl: string): void {
    if (!entryUrl) {
      return;
    }
    this.lastEntryUrl = entryUrl;
    this.lastOfflineReason = '';
    this.isOfflinePage = false;
    const targetUrl: string = this.buildEntryUrl(entryUrl);
    this.webSrcString = targetUrl;
    try {
      this.webController.loadUrl(targetUrl);
    } catch (err) {
      // controller 尚未就绪时 loadUrl 会抛异常；src 已更新，记录后由组件按 src 加载兜底
      console.error('navigateToEntry loadUrl failed: ' + JSON.stringify(err));
    }
  }

  // 用 registerJavaScriptProxy 注册多个 JS 代理对象（互不覆盖）；
  // 生效需触发一次页面加载，由调用方（resolveEntryAfterAttach）统一 refresh / loadUrl
  private registerJsProxies(): void {
    try {
      const ttsProxy: HarmonyTtsProxy = new HarmonyTtsProxy(this.ttsBridge!);
      this.webController.registerJavaScriptProxy(
        ttsProxy, 'AndroidTTS',
        ['isAvailable', 'getVoicesJson', 'getStatusJson', 'speak', 'speakQueue', 'supportsQueue', 'stop']
      );
      const shellProxy: HarmonyShellProxy = new HarmonyShellProxy(this.shellBridge!);
      this.webController.registerJavaScriptProxy(
        shellProxy, 'AndroidShellControl',
        ['retry', 'openExternal']
      );
    } catch (err) {
      console.error('registerJsProxies failed: ' + JSON.stringify(err));
    }
  }

  private buildEntryUrl(entryUrl: string): string {
    if (!entryUrl) {
      return DEFAULT_WEB_URL;
    }
    const sep: string = entryUrl.includes('?') ? '&' : '?';
    return entryUrl + sep + 'nwShell=harmony&nwShellVersion=' + SHELL_VERSION;
  }

  private dispatchShellRuntime(): void {
    const payload: ShellRuntimePayload = new ShellRuntimePayload(
      'harmony', SHELL_VERSION, this.lastEntryUrl, this.lastOfflineReason
    );
    const payloadJson: string = JSON.stringify(payload);
    const script: string =
      '(()=>{const d=' + payloadJson +
      ';window.__NW_HARMONY_SHELL__=d;' +
      "window.dispatchEvent(new CustomEvent('nw-shell-ready',{detail:d}));" +
      "window.dispatchEvent(new Event('online'));})();";
    try {
      this.webController.runJavaScript(script);
    } catch {
      // WebView 销毁
    }
  }

  private dispatchVoices(): void {
    const script: string =
      "(()=>{const b=window.AndroidTTS;if(!b)return;try{window.dispatchEvent(new CustomEvent('nw-android-tts',{detail:{type:'voices',ready:true,available:b.isAvailable?b.isAvailable():true,voiceCount:0}}));}catch(e){}})();";
    try {
      this.webController.runJavaScript(script);
    } catch {
      // WebView 销毁
    }
  }

  private dispatchOfflineData(): void {
    const entryUrl: string = this.lastEntryUrl || '';
    const reason: string = this.lastOfflineReason || 'Network unavailable';
    const script: string =
      "(()=>{window.__NW_OFFLINE__={entryUrl:'" + entryUrl.replace(/'/g, "\\'") +
      "',reason:'" + reason.replace(/'/g, "\\'") +
      "'};window.dispatchEvent(new CustomEvent('nw-offline-ready'));})();";
    try {
      this.webController.runJavaScript(script);
    } catch {
      // WebView 销毁
    }
  }

  private showOfflineFallback(_failingUrl: string, reason: string): void {
    if (this.isOfflinePage) {
      return;
    }
    this.lastOfflineReason = reason || 'Network unavailable';
    this.isOfflinePage = true;
    this.webSrcString = 'rawfile://offline.html';
  }

  private openExternalUrl(targetUrl?: string): void {
    const url: string = targetUrl || this.lastEntryUrl;
    if (!url) {
      return;
    }
    try {
      const appContext: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
      appContext.openLink(url);
    } catch {
      // 无法打开外部链接
    }
  }

  private checkHotUpdate(seedEntryUrl: string): void {
    const config: HarmonyShellConfig = this.shellConfig!;
    const configUrl: string = config.resolveHotUpdateConfigUrl('', seedEntryUrl);
    if (!configUrl) {
      return;
    }

    const httpRequest: http.HttpRequest = http.createHttp();
    const reqOptions: HttpRequestOptions = new HttpRequestOptions(5000, 5000);
    httpRequest.request(configUrl, reqOptions, (err: BusinessError, data: http.HttpResponse): void => {
      httpRequest.destroy();
      if (err) {
        return;
      }
      const body: string = (data.result as string) || '';
      if (!body) {
        return;
      }
      let payload: HotUpdatePayload;
      try {
        payload = JSON.parse(body) as HotUpdatePayload;
      } catch {
        return;
      }

      if (payload.minimumShellVersion) {
        const currentVersion: number = this.parseSemver(SHELL_VERSION);
        const requiredVersion: number = this.parseSemver(payload.minimumShellVersion);
        if (currentVersion < requiredVersion) {
          this.showToast(payload.message || '当前版本过低，请更新应用');
          return;
        }
      }

      if (payload.entryUrl) {
        const normalized: string | null = config.normalizeHttpUrl(payload.entryUrl);
        if (normalized && normalized !== this.lastEntryUrl) {
          config.persistEntryUrlOverride(normalized);
          this.navigateToEntry(normalized);
          if (payload.message) {
            this.showToast(payload.message);
          }
        }
      }
    });
  }

  private parseSemver(version: string): number {
    const parts: string[] = version.split('.');
    let result: number = 0;
    for (let i: number = 0; i < 3; i++) {
      const raw: string = parts[i] || '0';
      const val: number = parseInt(raw, 10);
      result = result * 1000 + (isNaN(val) ? 0 : val);
    }
    return result;
  }

  private showToast(message: string): void {
    const script: string =
      "window.dispatchEvent(new CustomEvent('nw-harmony-toast',{detail:{message:" +
      JSON.stringify(message) + '}}));';
    try {
      this.webController.runJavaScript(script);
    } catch {
      // WebView 销毁
    }
  }
}
