import { textToSpeech } from '@kit.CoreSpeechKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { HarmonyBackgroundAudioTask } from './HarmonyBackgroundAudioTask';

class HarmonyTtsVoiceItem {
  name: string;
  lang: string;
  default: boolean;

  constructor(name: string, lang: string, isDefault: boolean) {
    this.name = name;
    this.lang = lang;
    this.default = isDefault;
  }
}

class TtsStatusPayload {
  engineId: string;
  ready: boolean;
  available: boolean;
  voiceCount: number;
  needsInstall: boolean;
  needsSettings: boolean;
  message: string;
  preferredSetupAction: string;

  constructor(available: boolean, voiceCount: number, message: string, preferredSetupAction: string) {
    this.engineId = 'harmony-core-speech';
    this.ready = available;
    this.available = available;
    this.voiceCount = voiceCount;
    this.needsInstall = false;
    this.needsSettings = !available;
    this.message = message;
    this.preferredSetupAction = preferredSetupAction;
  }
}

// 探测状态：unknown=尚未探测，available=引擎可用，unavailable=引擎创建失败（模拟器/缺语音包）
type TtsProbeState = 'unknown' | 'available' | 'unavailable';
type HarmonyTtsEngineMode = 'offline' | 'online';

class HarmonyTtsQueueSegment {
  text: string;
  paragraphIndex: number;

  constructor(text: string, paragraphIndex: number) {
    this.text = text;
    this.paragraphIndex = paragraphIndex;
  }
}

interface HarmonyTtsQueueSegmentPayload {
  text?: string;
  paragraphIndex?: number;
}

const PROBE_FAIL_MESSAGE: string =
  '未检测到系统语音引擎（模拟器通常不带语音包），可改用在线音色听书';
const HARMONY_TTS_SEGMENT_TIMEOUT_MS: number = 45000;
const HARMONY_TTS_MIN_SEGMENT_MS: number = 1800;
const HARMONY_TTS_MS_PER_CHAR: number = 320;
const HARMONY_TTS_TAIL_BUFFER_MS: number = 1200;

export class HarmonyTtsBridge {
  private engine: textToSpeech.TextToSpeechEngine | null = null;
  private engineReady = true;
  private voices: HarmonyTtsVoiceItem[] = [
    // 华为 CoreSpeechKit 系统 TTS 当前仅支持 person=0 单一音色（聆小珊 女声），
    // 无系统男声；需要更多音色请使用在线音色（edge-online）
    new HarmonyTtsVoiceItem('聆小珊 (鸿蒙系统女声)', 'zh-CN', true)
  ];
  private dispatchScript: (script: string) => void;
  private creatingEngine = false;
  private probeState: TtsProbeState = 'unknown';
  private probing = false;
  private backgroundAudioTask: HarmonyBackgroundAudioTask | null;
  private activeQueueId: string = '';
  private queueSegments: HarmonyTtsQueueSegment[] = [];
  private queueIndex: number = -1;
  private queueRate: number = 1;
  private queuePitch: number = 1;
  private queueStopping: boolean = false;
  private engineMode: HarmonyTtsEngineMode = 'offline';
  private segmentWatchdogTimer: number = -1;
  private segmentAdvanceTimer: number = -1;
  private queueSegmentStartedAtMs: number = 0;

  constructor(dispatchScript: (script: string) => void, backgroundAudioTask: HarmonyBackgroundAudioTask | null = null) {
    this.dispatchScript = dispatchScript;
    this.backgroundAudioTask = backgroundAudioTask;
    this.probe();
  }

  isAvailable(): boolean {
    return this.probeState !== 'unavailable';
  }

  getVoicesJson(): string {
    if (this.probeState === 'unavailable') {
      return '[]';
    }
    return JSON.stringify(this.voices);
  }

  getStatusJson(): string {
    if (this.probeState === 'unavailable') {
      const status: TtsStatusPayload = new TtsStatusPayload(false, 0, PROBE_FAIL_MESSAGE, 'none');
      return JSON.stringify(status);
    }
    // unknown 时乐观返回可用，避免探测未完成就被判死；真实失败由 probe 回调纠正
    const available: boolean = this.probeState === 'available';
    const voiceCount: number = available ? this.voices.length : 0;
    const status: TtsStatusPayload = new TtsStatusPayload(true, voiceCount, '', 'none');
    return JSON.stringify(status);
  }

  // 启动时真实探测一次引擎是否可创建：先离线后在线，长章节朗读优先避开在线服务超时
  private probe(): void {
    if (this.probing || this.probeState !== 'unknown') {
      return;
    }
    this.probing = true;
    const self: HarmonyTtsBridge = this;
    const offlineParams: textToSpeech.CreateEngineParams = {
      language: 'zh-CN',
      person: 0,
      online: 0
    };

    textToSpeech.createEngine(offlineParams, (err: BusinessError, engine: textToSpeech.TextToSpeechEngine): void => {
      if (!err && engine) {
        self.engine = engine;
        self.engineMode = 'offline';
        self.setupListener();
        self.markProbe('available');
        return;
      }
      self.probeOnline();
    });
  }

  private probeOnline(): void {
    const self: HarmonyTtsBridge = this;
    const onlineParams: textToSpeech.CreateEngineParams = {
      language: 'zh-CN',
      person: 0,
      online: 1
    };

    textToSpeech.createEngine(onlineParams, (err: BusinessError, engine: textToSpeech.TextToSpeechEngine): void => {
      if (!err && engine) {
        self.engine = engine;
        self.engineMode = 'online';
        self.setupListener();
        self.markProbe('available');
        return;
      }
      self.markProbe('unavailable');
    });
  }

  private markProbe(state: TtsProbeState): void {
    this.probing = false;
    this.probeState = state;
    // 通知前端刷新状态：available → 触发音色发现；unavailable → 前端自动回退在线引擎
    this.dispatchEvent('ready');
  }

  speak(requestId: string, text: string, rate: number, pitch: number, _voiceName: string): boolean {
    if (!text || text.trim().length === 0) {
      return false;
    }
    // 探测已确认引擎不可用（模拟器/缺语音包）：直接拒绝，让前端回退到在线引擎
    if (this.probeState === 'unavailable') {
      return false;
    }
    if (this.engine) {
      return this.doSpeak(requestId, text, rate, pitch);
    }
    if (!this.creatingEngine) {
      this.creatingEngine = true;
      this.createEngineLazy(requestId, text, rate, pitch);
    }
    return true;
  }

  speakQueue(requestId: string, segmentsJson: string, rate: number, pitch: number, _voiceName: string): boolean {
    const segments: HarmonyTtsQueueSegment[] = this.parseQueueSegments(segmentsJson);
    if (!requestId || segments.length === 0) {
      return false;
    }
    if (this.probeState === 'unavailable') {
      return false;
    }

    this.stopQueue(false);
    this.activeQueueId = requestId;
    this.queueSegments = segments;
    this.queueIndex = -1;
    this.queueRate = rate;
    this.queuePitch = pitch;
    this.queueStopping = false;
    this.backgroundAudioTask?.start();
    this.dispatchEvent(
      'queue-start',
      requestId,
      '',
      0,
      segments.length,
      segments[0].paragraphIndex,
      segments[0].text
    );

    if (this.engine) {
      return this.speakNextQueueSegment(requestId);
    }
    if (!this.creatingEngine) {
      this.creatingEngine = true;
      this.queueIndex = 0;
      this.createEngineLazy(requestId + ':0', segments[0].text, rate, pitch);
    }
    return true;
  }

  supportsQueue(): boolean {
    return true;
  }

  stop(): void {
    if (this.activeQueueId) {
      this.stopQueue(true);
      return;
    }
    if (!this.engine) {
      return;
    }
    try {
      this.engine.stop();
    } catch {
      // ignore
    }
  }

  shutdown(): void {
    this.stopQueue(false);
    this.backgroundAudioTask?.stop();
    if (!this.engine) {
      return;
    }
    try {
      this.engine.shutdown();
    } catch {
      // ignore
    }
    this.engine = null;
  }

  private createEngineLazy(pendingRequestId: string, pendingText: string, rate: number, pitch: number): void {
    const self: HarmonyTtsBridge = this;
    const params: textToSpeech.CreateEngineParams = {
      language: 'zh-CN',
      person: 0,
      online: 0
    };

    textToSpeech.createEngine(params, (err: BusinessError, engine: textToSpeech.TextToSpeechEngine) => {
      self.creatingEngine = false;
      if (err || !engine) {
        self.tryOnlineEngine(pendingRequestId, pendingText, rate, pitch);
        return;
      }
      self.engine = engine;
      self.engineMode = 'offline';
      self.setupListener();
      self.doSpeak(pendingRequestId, pendingText, rate, pitch);
    });
  }

  private tryOnlineEngine(pendingRequestId: string, pendingText: string, rate: number, pitch: number): void {
    const self: HarmonyTtsBridge = this;
    const params: textToSpeech.CreateEngineParams = {
      language: 'zh-CN',
      person: 0,
      online: 1
    };

    textToSpeech.createEngine(params, (err: BusinessError, engine: textToSpeech.TextToSpeechEngine) => {
      if (err || !engine) {
        const errMsg: string = (err && err.message) ? err.message : '未知错误';
        // 离线引擎也创建失败：标记不可用，后续 speak 不再重试并让前端回退在线引擎
        self.probeState = 'unavailable';
        self.dispatchEvent('error', pendingRequestId, '语音引擎初始化失败: ' + errMsg);
        return;
      }
      self.engine = engine;
      self.engineMode = 'online';
      self.setupListener();
      self.doSpeak(pendingRequestId, pendingText, rate, pitch);
    });
  }

  private doSpeak(requestId: string, text: string, rate: number, pitch: number): boolean {
    if (!this.engine) {
      return false;
    }
    try {
      const params: textToSpeech.SpeakParams = {
        requestId: requestId,
        extraParams: {
          // 鸿蒙 speed/pitch 区间约 [0.5, 2]，1 为正常；对前端传入做防御性钳制
          speed: this.clampSpeechParam(rate),
          pitch: this.clampSpeechParam(pitch)
        }
      };
      this.engine.speak(text, params);
      return true;
    } catch {
      this.dispatchEvent('error', requestId, '语音合成调用失败');
      return false;
    }
  }

  // 将前端语速/音高钳制到引擎接受区间，无效值回落为 1（正常）
  private clampSpeechParam(value: number): number {
    if (typeof value !== 'number' || isNaN(value) || value <= 0) {
      return 1;
    }
    if (value < 0.5) {
      return 0.5;
    }
    if (value > 2) {
      return 2;
    }
    return value;
  }

  private setupListener(): void {
    if (!this.engine) {
      return;
    }
    const self: HarmonyTtsBridge = this;
    this.engine.setListener({
      onStart: (id: string): void => {
        if (self.handleQueueStart(id)) {
          return;
        }
        self.dispatchEvent('start', id);
      },
      onComplete: (id: string): void => {
        if (self.handleQueueComplete(id)) {
          return;
        }
        self.dispatchEvent('end', id);
      },
      onStop: (id: string): void => {
        if (self.handleQueueStop(id)) {
          return;
        }
        self.dispatchEvent('stop', id);
      },
      onError: (id: string, code: number, msg: string): void => {
        const message: string = '语音错误(' + code.toString() + '): ' + msg;
        if (self.handleQueueError(id, message)) {
          return;
        }
        self.dispatchEvent('error', id, message);
      }
    });
  }

  private speakNextQueueSegment(queueId: string): boolean {
    if (!this.engine || queueId !== this.activeQueueId || this.queueStopping) {
      return false;
    }
    const nextIndex: number = this.queueIndex + 1;
    if (nextIndex >= this.queueSegments.length) {
      return false;
    }
    const segment: HarmonyTtsQueueSegment = this.queueSegments[nextIndex];
    this.queueIndex = nextIndex;
    const accepted: boolean = this.doSpeak(queueId + ':' + nextIndex.toString(), segment.text, this.queueRate, this.queuePitch);
    if (!accepted) {
      this.dispatchEvent(
        'error',
        queueId,
        '语音合成调用失败',
        nextIndex,
        this.queueSegments.length,
        segment.paragraphIndex,
        segment.text
      );
      this.stopQueue(true);
    } else {
      this.armSegmentWatchdog(queueId, nextIndex);
    }
    return accepted;
  }

  private handleQueueStart(utteranceId: string): boolean {
    const index: number = this.getQueueSegmentIndex(utteranceId);
    if (index < 0) {
      return false;
    }
    const queueId: string = this.getQueueIdFromUtteranceId(utteranceId);
    if (queueId !== this.activeQueueId) {
      return true;
    }
    this.clearSegmentWatchdog();
    this.queueSegmentStartedAtMs = Date.now();
    const segment: HarmonyTtsQueueSegment | undefined = this.queueSegments[index];
    this.dispatchEvent(
      'segment-start',
      queueId,
      '',
      index,
      this.queueSegments.length,
      segment?.paragraphIndex,
      segment?.text
    );
    this.dispatchEvent(
      'start',
      queueId,
      '',
      index,
      this.queueSegments.length,
      segment?.paragraphIndex,
      segment?.text
    );
    return true;
  }

  private handleQueueComplete(utteranceId: string): boolean {
    const index: number = this.getQueueSegmentIndex(utteranceId);
    if (index < 0) {
      return false;
    }
    const queueId: string = this.getQueueIdFromUtteranceId(utteranceId);
    if (queueId !== this.activeQueueId) {
      return true;
    }
    const segment: HarmonyTtsQueueSegment | undefined = this.queueSegments[index];
    const waitMs: number = this.calculateRemainingSegmentDelay(segment);
    this.clearSegmentAdvanceTimer();
    if (waitMs <= 0) {
      this.advanceQueueAfterComplete(queueId, index);
      return true;
    }
    const self: HarmonyTtsBridge = this;
    this.segmentAdvanceTimer = setTimeout((): void => {
      self.advanceQueueAfterComplete(queueId, index);
    }, waitMs);
    return true;
  }

  private handleQueueStop(utteranceId: string): boolean {
    const index: number = this.getQueueSegmentIndex(utteranceId);
    if (index < 0) {
      return false;
    }
    const queueId: string = this.getQueueIdFromUtteranceId(utteranceId);
    if (queueId !== this.activeQueueId) {
      return true;
    }
    this.clearSegmentWatchdog();
    this.clearSegmentAdvanceTimer();
    if (!this.queueStopping) {
      this.stopQueue(true);
    }
    return true;
  }

  private handleQueueError(utteranceId: string, message: string): boolean {
    const index: number = this.getQueueSegmentIndex(utteranceId);
    if (index < 0) {
      return false;
    }
    const queueId: string = this.getQueueIdFromUtteranceId(utteranceId);
    if (queueId !== this.activeQueueId) {
      return true;
    }
    this.clearSegmentWatchdog();
    this.clearSegmentAdvanceTimer();
    const segment: HarmonyTtsQueueSegment | undefined = this.queueSegments[index];
    this.dispatchEvent(
      'error',
      queueId,
      message,
      index,
      this.queueSegments.length,
      segment?.paragraphIndex,
      segment?.text
    );
    this.stopQueue(false);
    return true;
  }

  private finishQueue(queueId: string): void {
    this.clearSegmentWatchdog();
    this.clearSegmentAdvanceTimer();
    const lastIndex: number = this.queueIndex;
    const total: number = this.queueSegments.length;
    const segment: HarmonyTtsQueueSegment | undefined = this.queueSegments[lastIndex];
    this.activeQueueId = '';
    this.queueSegments = [];
    this.queueIndex = -1;
    this.queueStopping = false;
    this.backgroundAudioTask?.stop();
    this.dispatchEvent('end', queueId, '', lastIndex, total, segment?.paragraphIndex);
  }

  private stopQueue(dispatchStop: boolean): void {
    if (!this.activeQueueId && this.queueSegments.length === 0) {
      return;
    }
    const queueId: string = this.activeQueueId;
    const index: number = this.queueIndex;
    const total: number = this.queueSegments.length;
    const segment: HarmonyTtsQueueSegment | undefined = this.queueSegments[index];
    this.queueStopping = true;
    this.clearSegmentWatchdog();
    this.clearSegmentAdvanceTimer();
    try {
      this.engine?.stop();
    } catch {
      // ignore
    }
    this.activeQueueId = '';
    this.queueSegments = [];
    this.queueIndex = -1;
    this.queueStopping = false;
    this.backgroundAudioTask?.stop();
    if (dispatchStop && queueId) {
      this.dispatchEvent('stop', queueId, '', index, total, segment?.paragraphIndex);
    }
  }

  private advanceQueueAfterComplete(queueId: string, index: number): void {
    if (queueId !== this.activeQueueId || index !== this.queueIndex || this.queueStopping) {
      return;
    }
    this.clearSegmentAdvanceTimer();
    const segment: HarmonyTtsQueueSegment | undefined = this.queueSegments[index];
    this.dispatchEvent(
      'segment-end',
      queueId,
      '',
      index,
      this.queueSegments.length,
      segment?.paragraphIndex,
      segment?.text
    );
    if (index >= this.queueSegments.length - 1) {
      this.finishQueue(queueId);
      return;
    }
    this.speakNextQueueSegment(queueId);
  }

  private calculateRemainingSegmentDelay(segment: HarmonyTtsQueueSegment | undefined): number {
    if (!segment || this.queueSegmentStartedAtMs <= 0) {
      return HARMONY_TTS_MIN_SEGMENT_MS;
    }
    const normalizedText: string = segment.text.replace(/\s+/g, '');
    const speed: number = this.clampSpeechParam(this.queueRate);
    const estimatedMs: number = Math.max(
      HARMONY_TTS_MIN_SEGMENT_MS,
      Math.ceil((normalizedText.length * HARMONY_TTS_MS_PER_CHAR) / speed)
    ) + HARMONY_TTS_TAIL_BUFFER_MS;
    const elapsedMs: number = Math.max(0, Date.now() - this.queueSegmentStartedAtMs);
    return Math.max(0, estimatedMs - elapsedMs);
  }

  private parseQueueSegments(segmentsJson: string): HarmonyTtsQueueSegment[] {
    try {
      const raw: HarmonyTtsQueueSegmentPayload[] = JSON.parse(segmentsJson) as HarmonyTtsQueueSegmentPayload[];
      if (!Array.isArray(raw)) {
        return [];
      }
      const result: HarmonyTtsQueueSegment[] = [];
      raw.forEach((item: HarmonyTtsQueueSegmentPayload, index: number): void => {
        const text: string = String(item.text ?? '').trim();
        if (!text) {
          return;
        }
        const rawParagraphIndex: number = Number(item.paragraphIndex ?? index);
        result.push(new HarmonyTtsQueueSegment(
          text,
          isNaN(rawParagraphIndex) ? index : rawParagraphIndex
        ));
      });
      return result;
    } catch {
      return [];
    }
  }

  private getQueueSegmentIndex(utteranceId: string): number {
    const markerIndex: number = utteranceId.lastIndexOf(':');
    if (markerIndex < 0) {
      return -1;
    }
    const index: number = parseInt(utteranceId.slice(markerIndex + 1), 10);
    return isNaN(index) ? -1 : index;
  }

  private getQueueIdFromUtteranceId(utteranceId: string): string {
    const markerIndex: number = utteranceId.lastIndexOf(':');
    if (markerIndex < 0) {
      return utteranceId;
    }
    return utteranceId.slice(0, markerIndex);
  }

  private armSegmentWatchdog(queueId: string, index: number): void {
    this.clearSegmentWatchdog();
    const self: HarmonyTtsBridge = this;
    this.segmentWatchdogTimer = setTimeout((): void => {
      if (queueId !== self.activeQueueId || index !== self.queueIndex || self.queueStopping) {
        return;
      }
      const segment: HarmonyTtsQueueSegment | undefined = self.queueSegments[index];
      self.dispatchEvent(
        'segment-end',
        queueId,
        '',
        index,
        self.queueSegments.length,
        segment?.paragraphIndex,
        segment?.text
      );
      if (index >= self.queueSegments.length - 1) {
        self.finishQueue(queueId);
        return;
      }
      self.speakNextQueueSegment(queueId);
    }, HARMONY_TTS_SEGMENT_TIMEOUT_MS);
  }

  private clearSegmentWatchdog(): void {
    if (this.segmentWatchdogTimer < 0) {
      return;
    }
    clearTimeout(this.segmentWatchdogTimer);
    this.segmentWatchdogTimer = -1;
  }

  private clearSegmentAdvanceTimer(): void {
    if (this.segmentAdvanceTimer < 0) {
      return;
    }
    clearTimeout(this.segmentAdvanceTimer);
    this.segmentAdvanceTimer = -1;
  }

  dispatchEvent(
    type: string,
    requestId: string = '',
    message: string = '',
    queueIndex?: number,
    queueTotal?: number,
    paragraphIndex?: number,
    text?: string
  ): void {
    const available: boolean = this.probeState !== 'unavailable';
    const payload: string = JSON.stringify({
      type: type,
      requestId: requestId,
      message: message,
      ready: this.probeState !== 'unknown',
      available: available,
      voiceCount: available ? this.voices.length : 0,
      queueIndex: queueIndex,
      queueTotal: queueTotal,
      paragraphIndex: paragraphIndex,
      text: text
    });
    this.dispatchScript(
      'window.dispatchEvent(new CustomEvent(' + "'nw-android-tts',{detail:" + payload + '}));'
    );
  }
}
