import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { CLIENT_TTS_STOPPED, useClientTTS, type ClientTTSSegment } from './useClientTTS';
import { useEdgeOnlineTTS } from './useEdgeOnlineTTS';
import { useReaderEdgeVoices } from './useReaderEdgeVoices';
import { formatReaderVoiceDisplay } from '../utils/reader-voice-display';
import { isEdgeVoiceValue, type ReaderVoiceOption } from '../utils/reader-edge-voice';
import { detectBrowserEnv } from '../utils/browser-env';
import { useAuthStore } from '../stores/auth';
import {
  hasAndroidNativeTTSBridge,
  installAndroidNativeTtsData,
  onAndroidNativeTTSEvent,
  openAndroidNativeTtsSettings,
  readAndroidNativeStatus,
} from '../utils/android-native-tts';

const READER_TTS_VOICE_STORAGE_KEY = 'nw-reader-tts:voice-name';
const SYSTEM_DEFAULT_VOICE_SENTINEL = '__SYSTEM_DEFAULT__';
const RATE_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;
const VOICE_PREVIEW_TEXT = '这是音色试听，你可以用这句话判断当前声音是否适合长时间听书。';
const TTS_SEPARATOR_ONLY_RE = /^[\s*，—=~～…_.。、:；！？\\/.-]+$/u;
const DEFAULT_READER_VOICE_KEY = 'Yunyang';
const MOBILE_TTS_CHUNK_LIMIT = 90;
const IOS_WEBVIEW_TTS_CHUNK_LIMIT = 60;

function shouldSkipTTSParagraph(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;
  return TTS_SEPARATOR_ONLY_RE.test(normalized);
}

function isDefaultReaderVoice(name: string): boolean {
  return new RegExp(DEFAULT_READER_VOICE_KEY, 'i').test(name);
}

function getBrowserSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis ?? null;
}

function splitLongSentence(text: string, paragraphIndex: number, chunkLimit: number): ClientTTSSegment[] {
  if (text.length <= chunkLimit) {
    return [{ text, paragraphIndex }];
  }

  const pieces: string[] = [];
  let remaining = text.trim();

  while (remaining.length > chunkLimit) {
    const candidate = remaining.slice(0, chunkLimit);
    const breakpoints = ['。', '！', '？', '；', '，', '、', '.', '!', '?', ';', ',', ' '];
    let cutIndex = -1;

    for (const marker of breakpoints) {
      const idx = candidate.lastIndexOf(marker);
      if (idx > cutIndex) {
        cutIndex = idx;
      }
    }

    const nextPiece = (cutIndex >= 0 ? remaining.slice(0, cutIndex + 1) : candidate).trim();
    if (!nextPiece) break;
    pieces.push(nextPiece);
    remaining = remaining.slice(nextPiece.length).trim();
  }

  if (remaining) {
    pieces.push(remaining);
  }

  return pieces.map((piece) => ({ text: piece, paragraphIndex }));
}

function splitParagraphForSpeech(text: string, paragraphIndex: number, chunkLimit: number): ClientTTSSegment[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^。！？!?；;]+[。！？!?；;]?/gu) ?? [normalized];
  const chunks: ClientTTSSegment[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    chunks.push(...splitLongSentence(trimmed, paragraphIndex, chunkLimit));
  }

  return chunks;
}

export function useReaderTTS(
  paragraphs: Ref<string[]>,
  novelContext?: { novelId: Ref<string>; novelTitle: Ref<string> },
) {
  const clientTTS = useClientTTS();
  const edgeOnline = useEdgeOnlineTTS();
  const edgeVoices = useReaderEdgeVoices();
  const auth = useAuthStore();
  const env = detectBrowserEnv();
  const activeParagraphIndex = ref(-1);
  const playbackRate = ref(1);
  const systemVoiceName = ref('');
  const voiceSelectionMode = ref<'auto' | 'system' | 'explicit'>('auto');
  const androidNativeStatus = ref(readAndroidNativeStatus());
  const voiceOptions = ref<ReaderVoiceOption[]>([]);
  const visible = ref(false);
  const voicePanelOpen = ref(false);
  const playbackRatePanelOpen = ref(false);
  const voicePreviewing = ref(false);
  const previewingVoiceName = ref('');
  let runToken = 0;
  let previewToken = 0;
  let speechSynthesisEventBound = false;
  let voiceRetryTimer: number | null = null;
  let voiceDiscoveryActive = false;

  const isEdgeMode = computed(() => edgeVoices.ttsEngineMode.value === 'edge-online');
  const systemSupported = computed(() => clientTTS.isSupported());
  // 当前引擎是否可用：在线模式恒可用（现代浏览器），系统模式取决于本地语音支持
  const supported = computed(() => (isEdgeMode.value ? edgeOnline.isSupported() : systemSupported.value));
  // 是否任一引擎可用，用于音色面板入口的可点击判断
  const canUseAnyTTS = computed(() => systemSupported.value || edgeOnline.isSupported());
  // 系统引擎受浏览器限制，必须切碎；在线引擎支持长文本，用更大粒度保证语调连贯
  const systemChunkLimit = env.isIOS && env.isWeChat ? IOS_WEBVIEW_TTS_CHUNK_LIMIT : MOBILE_TTS_CHUNK_LIMIT;
  const EDGE_CHUNK_LIMIT = 300;
  const chunkLimit = computed(() => (isEdgeMode.value ? EDGE_CHUNK_LIMIT : systemChunkLimit));
  const speakableParagraphs = computed(() =>
    paragraphs.value
      .map((text, index) => ({ text, index }))
      .filter((item) => !shouldSkipTTSParagraph(item.text)),
  );
  const speakQueue = computed(() =>
    speakableParagraphs.value.flatMap((item) =>
      splitParagraphForSpeech(item.text, item.index, chunkLimit.value),
    ),
  );
  const paragraphCount = computed(() => speakableParagraphs.value.length);
  const hasContent = computed(() => paragraphCount.value > 0);
  // 根据当前引擎取播放状态
  const speaking = computed(() => (isEdgeMode.value ? edgeOnline.speaking.value : clientTTS.speaking.value));
  const paused = computed(() => (isEdgeMode.value ? edgeOnline.paused.value : clientTTS.paused.value));
  const progress = computed(() => (isEdgeMode.value ? edgeOnline.progress.value : clientTTS.progress.value));
  const total = computed(() => (isEdgeMode.value ? edgeOnline.total.value : clientTTS.total.value));
  // 在线模式的预缓冲状态（系统模式无缓冲）
  const buffering = computed(() => isEdgeMode.value && edgeOnline.buffering.value);
  const bufferProgress = computed(() => (isEdgeMode.value ? edgeOnline.bufferProgress.value : 0));
  const currentSegmentIndex = computed(() =>
    isEdgeMode.value ? edgeOnline.currentSegmentIndex.value : clientTTS.currentSegmentIndex.value,
  );
  const currentParagraphIndex = computed(() =>
    isEdgeMode.value ? edgeOnline.currentParagraphIndex.value : clientTTS.currentParagraphIndex.value,
  );
  const currentText = computed(() => (isEdgeMode.value ? edgeOnline.currentText.value : clientTTS.currentText.value));
  const currentVoiceName = computed(() =>
    isEdgeMode.value ? edgeOnline.currentVoiceName.value : clientTTS.currentVoiceName.value,
  );
  const preferredTtsBackend = computed(() => clientTTS.getPreferredBackend());
  const usingBrowserFallback = computed(() =>
    hasAndroidNativeTTSBridge() &&
    !androidNativeStatus.value.available &&
    preferredTtsBackend.value === 'browser',
  );
  // 当前引擎是否可以工作（含自动回退到在线引擎的兜底）
  const ready = computed(() => {
    if (!hasContent.value) return false;
    if (isEdgeMode.value) return edgeOnline.isSupported();
    if (!systemSupported.value) {
      // 系统引擎不可用，但在线引擎可用 → 允许显示按钮，play时自动回退
      return edgeOnline.isSupported();
    }
    if (!hasAndroidNativeTTSBridge()) return true;
    return androidNativeStatus.value.available || usingBrowserFallback.value;
  });
  const showListenButton = computed(() =>
    hasContent.value && !visible.value,
  );
  const progressLabel = computed(() => {
    if (!supported.value) return '当前浏览器不支持本地听书';
    if (voicePreviewing.value) return '试听中';
    if (visible.value) {
      if (total.value <= 0) return '准备中';
      return `${Math.min(progress.value, total.value)} / ${total.value}`;
    }
    if (!hasContent.value) return '当前章节暂无可朗读内容';
    return `共 ${paragraphCount.value} 段`;
  });
  const playbackRateLabel = computed(() => `${playbackRate.value}x`);
  // 统一音色选项：在线音色在前，系统音色在后
  const voiceOptionItems = computed<ReaderVoiceOption[]>(() => {
    const filterValid = (item: ReaderVoiceOption) => item.value.trim().length > 0 && item.label.trim().length > 0;
    return [...edgeVoices.edgeVoiceOptions.value.filter(filterValid), ...voiceOptions.value.filter(filterValid)];
  });
  const onlineVoiceOptionItems = computed(() => voiceOptionItems.value.filter((item) => item.group === 'edge'));
  const systemVoiceOptionItems = computed(() => voiceOptionItems.value.filter((item) => item.group === 'system'));
  const hasOnlineVoices = computed(() => onlineVoiceOptionItems.value.length > 0);
  // 统一的已选音色值：在线模式返回 edge: 前缀项，系统模式返回系统音色名
  const selectedVoiceName = computed(() =>
    isEdgeMode.value && edgeVoices.edgeVoiceName.value
      ? `edge:${edgeVoices.edgeVoiceName.value}`
      : systemVoiceName.value,
  );
  const selectedVoiceOption = computed(() =>
    voiceOptionItems.value.find((item) => item.value === selectedVoiceName.value) ?? null,
  );
  const selectedVoiceLabel = computed(() => {
    if (!selectedVoiceName.value) return '系统默认音色';
    const matched = selectedVoiceOption.value;
    return matched?.label || '系统默认音色';
  });
  const selectedVoiceTitle = computed(() => selectedVoiceOption.value?.title || '系统默认');
  const effectiveVoiceLabel = computed(() => {
    if (isEdgeMode.value) {
      if (!edgeOnline.currentVoiceName.value) return selectedVoiceLabel.value;
      return formatReaderVoiceDisplay(edgeOnline.currentVoiceName.value).label;
    }
    if (!clientTTS.currentVoiceName.value) return selectedVoiceLabel.value;
    return formatReaderVoiceDisplay(clientTTS.currentVoiceName.value).label;
  });
  const effectiveVoiceSummary = computed(() => {
    if (isEdgeMode.value) {
      if (!edgeOnline.currentVoiceName.value) {
        return selectedVoiceOption.value
          ? `${selectedVoiceOption.value.title} · ${selectedVoiceOption.value.tone}`
          : '在线音色';
      }
      const display = formatReaderVoiceDisplay(edgeOnline.currentVoiceName.value);
      return `${display.title} · ${display.tone}`;
    }
    if (!clientTTS.currentVoiceName.value) {
      return selectedVoiceOption.value
        ? `${selectedVoiceOption.value.title} · ${selectedVoiceOption.value.tone}`
        : '系统默认';
    }
    const display = formatReaderVoiceDisplay(clientTTS.currentVoiceName.value);
    return `${display.title} · ${display.tone}`;
  });

  const compatibilityHint = computed(() => {
    if (isEdgeMode.value) {
      return '在线音色由云端合成，音质更自然动听，需要保持网络连接。首次朗读可能需要短暂加载，后续会预取下一句减少等待。';
    }
    if (hasAndroidNativeTTSBridge() && androidNativeStatus.value.available && androidNativeStatus.value.engineId === 'offline-sherpa') {
      return '当前已自动切换到 APK 内置离线语音，主要用于兼容鸿蒙、小米等系统 TTS 不稳定的设备。首次朗读可能需要等待几秒加载模型。';
    }
    if (hasAndroidNativeTTSBridge() && androidNativeStatus.value.available) {
      return '当前已接入安卓原生语音，朗读会直接使用手机系统 TTS。';
    }
    if (usingBrowserFallback.value) {
      return '当前系统 TTS 不可用，已自动回退为 WebView 语音朗读。华为/鸿蒙设备如果系统桥不兼容，通常会走这一条。';
    }
    if (hasAndroidNativeTTSBridge()) {
      return androidNativeStatus.value.message || '未检测到可用中文语音，请先在系统文字转语音设置里安装或切换中文语音。';
    }
    if (env.isIOS && env.isWeChat) {
      return '微信内打开在 iPhone 上兼容性最差。首次无声可再点一次；仍无声请右上角在 Safari 打开，并确认系统已安装中文语音。';
    }
    if (env.isAndroid && env.isWeChat) {
      return '安卓微信常拿不到系统语音服务。若没有音色或点击无声，请在系统浏览器打开，并安装中文 TTS 语音包。';
    }
    if (env.isIOS && env.isSafari) {
      return 'iPhone 需要保持页面前台，且系统“朗读内容”里已安装中文语音。';
    }
    if (env.isAndroid) {
      return '安卓建议使用 Chrome 或 Edge，并确认系统文字转语音已安装中文语音包。';
    }
    return '若点击朗读无声，优先检查系统语音包和浏览器声音权限。';
  });
  const showNativeTtsSetupAction = computed(() =>
    hasAndroidNativeTTSBridge() && !androidNativeStatus.value.available && !usingBrowserFallback.value,
  );
  const nativeTtsSetupLabel = computed(() =>
    androidNativeStatus.value.preferredSetupAction === 'install' ? '安装语音数据' : '打开语音设置',
  );

  function restoreSelectedVoice() {
    if (typeof window === 'undefined') return;
    // 恢复在线引擎模式与已选在线音色
    edgeVoices.restoreEdgeVoiceState();
    // 恢复系统音色选择
    const saved = window.localStorage.getItem(READER_TTS_VOICE_STORAGE_KEY);
    if (saved === SYSTEM_DEFAULT_VOICE_SENTINEL) {
      systemVoiceName.value = '';
      voiceSelectionMode.value = 'system';
      return;
    }
    systemVoiceName.value = typeof saved === 'string' ? saved : '';
    voiceSelectionMode.value = systemVoiceName.value ? 'explicit' : 'auto';
  }

  function refreshAndroidNativeStatus() {
    androidNativeStatus.value = readAndroidNativeStatus();
  }

  function persistSelectedVoice() {
    if (typeof window === 'undefined') return;
    if (voiceSelectionMode.value === 'system') {
      window.localStorage.setItem(READER_TTS_VOICE_STORAGE_KEY, SYSTEM_DEFAULT_VOICE_SENTINEL);
      return;
    }
    if (systemVoiceName.value) {
      window.localStorage.setItem(READER_TTS_VOICE_STORAGE_KEY, systemVoiceName.value);
      return;
    }
    window.localStorage.removeItem(READER_TTS_VOICE_STORAGE_KEY);
  }

  function findDefaultVoiceName(items: Array<{ value: string }>): string {
    return items.find((item) => isDefaultReaderVoice(item.value))?.value ?? '';
  }

  function getVoiceSortWeight(item: {
    value: string;
    region: string;
    isKnown: boolean;
  }): number {
    if (isDefaultReaderVoice(item.value)) return 0;
    if (item.isKnown && item.region.includes('大陆')) return 1;
    if (item.isKnown && (item.region.includes('香港') || item.region.includes('台湾'))) return 2;
    if (item.isKnown) return 3;
    return 9;
  }

  function refreshVoiceOptions() {
    refreshAndroidNativeStatus();
    if (!systemSupported.value) {
      voiceOptions.value = [];
      systemVoiceName.value = '';
      return;
    }

    const preferredVoices = clientTTS.getChineseVoices();
    const voices = preferredVoices.length > 0 ? preferredVoices : clientTTS.getVoices();
    const seen = new Set<string>();
    voiceOptions.value = voices
      .filter((voice) => {
        const normalized = voice.name.trim();
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .map((voice) => {
        const display = formatReaderVoiceDisplay(voice.name, voice.lang);
        return {
          value: voice.name,
          label: display.label,
          title: display.title,
          detail: display.detail,
          region: display.region,
          tone: display.tone,
          isKnown: display.isKnown,
          group: 'system' as const,
        };
      })
      .sort((a, b) => {
        const weightDiff = getVoiceSortWeight(a) - getVoiceSortWeight(b);
        if (weightDiff !== 0) return weightDiff;
        return a.label.localeCompare(b.label, 'zh-CN');
      });

    // 在线模式下不干预系统音色的自动选择
    if (isEdgeMode.value) return;

    if (voiceSelectionMode.value === 'auto') {
      systemVoiceName.value = findDefaultVoiceName(voiceOptions.value);
      voiceSelectionMode.value = systemVoiceName.value ? 'explicit' : 'system';
    }

    if (systemVoiceName.value && !seen.has(systemVoiceName.value)) {
      systemVoiceName.value = findDefaultVoiceName(voiceOptions.value);
      voiceSelectionMode.value = systemVoiceName.value ? 'explicit' : 'system';
    }
  }

  function bindVoiceChangedEvent() {
    if (!systemSupported.value || speechSynthesisEventBound || typeof window === 'undefined') return;
    const speechSynthesis = getBrowserSpeechSynthesis();
    if (!speechSynthesis || typeof speechSynthesis.addEventListener !== 'function') return;
    speechSynthesis.addEventListener('voiceschanged', refreshVoiceOptions);
    speechSynthesisEventBound = true;
  }

  function unbindVoiceChangedEvent() {
    if (!systemSupported.value || !speechSynthesisEventBound || typeof window === 'undefined') return;
    const speechSynthesis = getBrowserSpeechSynthesis();
    if (!speechSynthesis || typeof speechSynthesis.removeEventListener !== 'function') return;
    speechSynthesis.removeEventListener('voiceschanged', refreshVoiceOptions);
    speechSynthesisEventBound = false;
  }

  function clearVoiceRetryTimer() {
    voiceDiscoveryActive = false;
    if (voiceRetryTimer == null || typeof window === 'undefined') return;
    window.clearTimeout(voiceRetryTimer);
    voiceRetryTimer = null;
  }

  function closeVoicePanel() {
    voicePanelOpen.value = false;
  }

  function closePlaybackRatePanel() {
    playbackRatePanelOpen.value = false;
  }

  function toggleVoicePanel() {
    if (!canUseAnyTTS.value) return;
    closePlaybackRatePanel();
    voicePanelOpen.value = !voicePanelOpen.value;
    // 展开面板时拉取在线音色列表（幂等）
    if (voicePanelOpen.value) {
      void edgeVoices.loadOnlineVoices();
    }
  }

  function togglePlaybackRatePanel() {
    if (!ready.value && !visible.value) return;
    closeVoicePanel();
    playbackRatePanelOpen.value = !playbackRatePanelOpen.value;
  }

  function chooseVoice(voiceValue: string) {
    const shouldReplay = visible.value;
    if (isEdgeVoiceValue(voiceValue)) {
      // 选中在线音色：切到在线引擎
      edgeVoices.applyVoiceSelection(voiceValue);
    } else {
      // 选中系统音色：切到系统引擎
      edgeVoices.ttsEngineMode.value = 'system';
      systemVoiceName.value = voiceValue;
      voiceSelectionMode.value = voiceValue ? 'explicit' : 'system';
    }
    voicePanelOpen.value = false;
    if (shouldReplay) {
      void play();
    }
  }

  function stopReading(closePanel = true) {
    runToken += 1;
    clientTTS.stop();
    edgeOnline.stop();
    activeParagraphIndex.value = -1;
    visible.value = false;
    if (closePanel) {
      closeVoicePanel();
      closePlaybackRatePanel();
    }
  }

  function cyclePlaybackRate() {
    const currentIndex = RATE_OPTIONS.findIndex((item) => item === playbackRate.value);
    if (currentIndex < 0) {
      playbackRate.value = 1;
      return;
    }
    const nextIndex = (currentIndex + 1) % RATE_OPTIONS.length;
    playbackRate.value = RATE_OPTIONS[nextIndex];
  }

  function setPlaybackRate(rate: number) {
    playbackRate.value = RATE_OPTIONS.includes(rate as (typeof RATE_OPTIONS)[number]) ? rate : 1;
    closePlaybackRatePanel();
  }

  function startVoiceDiscovery() {
    if (!systemSupported.value || typeof window === 'undefined') return;
    if (voiceDiscoveryActive) return;
    voiceDiscoveryActive = true;
    clearVoiceRetryTimer();
    voiceDiscoveryActive = true;
    refreshAndroidNativeStatus();
    let attempts = 0;
    const maxAttempts = 10;
    const tick = async () => {
      attempts += 1;
      await clientTTS.loadVoices();
      refreshVoiceOptions();
      if (voiceOptions.value.length > 0 || attempts >= maxAttempts) {
        clearVoiceRetryTimer();
        return;
      }
      voiceRetryTimer = window.setTimeout(() => {
        void tick();
      }, 300);
    };
    void tick();
  }

  async function play() {
    refreshAndroidNativeStatus();
    // 引擎能力校验：在线模式校验在线引擎，系统模式校验本地语音
    if (isEdgeMode.value) {
      if (!edgeOnline.isSupported()) {
        ElMessage.error('当前环境不支持在线听书');
        return;
      }
    } else {
      if (!systemSupported.value) {
        // 系统TTS不可用但在线引擎可用 → 自动切换到在线模式
        if (edgeOnline.isSupported()) {
          edgeVoices.ttsEngineMode.value = 'edge-online';
          ElMessage.info('当前浏览器不支持本地语音，已自动切换为在线听书');
        } else {
          ElMessage.error('当前浏览器不支持听书功能，请改用 Safari、Chrome 或 Edge');
          return;
        }
      }
      if (hasAndroidNativeTTSBridge() && !androidNativeStatus.value.available && !usingBrowserFallback.value) {
        // 系统语音引擎不可用（如鸿蒙模拟器/缺语音包）：登录用户可回退到在线听书；
        // 在线 TTS 不对游客开放，游客只能提示去完成系统语音设置
        if (auth.isAuthenticated && edgeOnline.isSupported()) {
          edgeVoices.ttsEngineMode.value = 'edge-online';
          ElMessage.info('未检测到系统语音，已自动切换为在线听书');
        } else {
          ElMessage.warning(androidNativeStatus.value.message || '请先完成系统文字转语音设置');
          return;
        }
      }
    }

    if (speakQueue.value.length === 0) {
      ElMessage.warning('当前章节没有可朗读的正文');
      return;
    }

    const nextRunToken = runToken + 1;
    runToken = nextRunToken;
    previewToken += 1;
    voicePreviewing.value = false;
    previewingVoiceName.value = '';

    // 切换/重启时停掉另一个引擎，避免串音；系统引擎在用户手势里 prime 一次解锁播放
    if (isEdgeMode.value) {
      clientTTS.stop();
    } else {
      clientTTS.prime();
      clientTTS.stop();
      edgeOnline.stop();
    }
    closeVoicePanel();
    closePlaybackRatePanel();
    visible.value = true;

    const handleSegmentStart = (segment: ClientTTSSegment) => {
      if (nextRunToken !== runToken) return;
      activeParagraphIndex.value = segment.paragraphIndex ?? -1;
    };

    try {
      if (isEdgeMode.value) {
        if (!edgeVoices.edgeVoiceName.value) {
          ElMessage.warning('请先选择一个在线音色');
          return;
        }
        await edgeVoices.loadOnlineVoices();
        await edgeOnline.speakQueue(
          speakQueue.value.map((segment) => ({
            ...segment,
            options: {
              rate: playbackRate.value,
              voiceName: edgeVoices.edgeVoiceName.value,
            },
          })),
          { onSegmentStart: handleSegmentStart },
          novelContext
            ? { novelId: novelContext.novelId.value, novelTitle: novelContext.novelTitle.value }
            : undefined,
        );
      } else {
        await clientTTS.loadVoices();
        refreshVoiceOptions();
        await clientTTS.speakQueue(
          speakQueue.value.map((segment) => ({
            ...segment,
            options: {
              rate: playbackRate.value,
              voiceName: systemVoiceName.value || undefined,
            },
          })),
          { onSegmentStart: handleSegmentStart },
        );
      }
    } catch (err) {
      if (nextRunToken !== runToken) return;
      const fallback = isEdgeMode.value ? '在线听书失败' : '本地听书失败';
      const message = err instanceof Error ? err.message : fallback;
      if (message !== CLIENT_TTS_STOPPED) {
        ElMessage.error(message);
      }
    } finally {
      if (nextRunToken !== runToken) return;
      activeParagraphIndex.value = -1;
      visible.value = false;
    }
  }

  function pause() {
    if (isEdgeMode.value) edgeOnline.pause();
    else clientTTS.pause();
  }

  function resume() {
    if (isEdgeMode.value) edgeOnline.resume();
    else clientTTS.resume();
  }

  function stop() {
    previewToken += 1;
    voicePreviewing.value = false;
    previewingVoiceName.value = '';
    stopReading(true);
  }

  async function previewVoice(voiceValue: string) {
    refreshAndroidNativeStatus();
    const isEdge = isEdgeVoiceValue(voiceValue);
    // 系统音色试听需要本地语音支持；在线音色试听走云端
    if (!isEdge) {
      if (!systemSupported.value) {
        ElMessage.error('当前浏览器不支持本地听书，请改用 Safari、Chrome 或 Edge，并确认系统已安装中文语音');
        return;
      }
      if (hasAndroidNativeTTSBridge() && !androidNativeStatus.value.available && !usingBrowserFallback.value) {
        ElMessage.warning(androidNativeStatus.value.message || '请先完成系统文字转语音设置');
        return;
      }
    }

    const nextPreviewToken = previewToken + 1;
    previewToken = nextPreviewToken;
    voicePreviewing.value = true;
    previewingVoiceName.value = voiceValue;

    // 停掉两个引擎的朗读，但保留音色面板展开状态
    runToken += 1;
    clientTTS.stop();
    edgeOnline.stop();
    activeParagraphIndex.value = -1;
    visible.value = false;

    try {
      if (isEdge) {
        const realVoice = voiceValue.slice('edge:'.length);
        await edgeVoices.loadOnlineVoices();
        await edgeOnline.speak(VOICE_PREVIEW_TEXT, {
          voiceName: realVoice,
          rate: playbackRate.value,
        });
      } else {
        clientTTS.prime();
        await clientTTS.loadVoices();
        refreshVoiceOptions();
        await clientTTS.speak(VOICE_PREVIEW_TEXT, {
          voiceName: voiceValue || undefined,
        });
      }
    } catch (err) {
      if (nextPreviewToken !== previewToken) return;
      const message = err instanceof Error ? err.message : '音色试听失败';
      if (message !== CLIENT_TTS_STOPPED) {
        ElMessage.error(message);
      }
    } finally {
      if (nextPreviewToken !== previewToken) return;
      voicePreviewing.value = false;
      previewingVoiceName.value = '';
    }
  }

  function togglePause() {
    if (speaking.value) {
      pause();
      return;
    }
    if (paused.value) {
      resume();
      return;
    }
    void play();
  }

  function openNativeTtsSetup() {
    refreshAndroidNativeStatus();
    const opened = androidNativeStatus.value.preferredSetupAction === 'install'
      ? installAndroidNativeTtsData() || openAndroidNativeTtsSettings()
      : openAndroidNativeTtsSettings() || installAndroidNativeTtsData();

    if (!opened) {
      ElMessage.error('无法打开安卓文字转语音设置');
    }
  }

  // 听书跟随滚动：当前朗读段落自动滚到屏幕中部
  let lastScrolledParagraph = -1;
  watch(activeParagraphIndex, async (index) => {
    if (index < 0) {
      lastScrolledParagraph = -1;
      return;
    }
    // 暂停时不滚动，避免用户查看时页面自己跳
    if (paused.value) return;
    // 同段内多个切片不重复触发
    if (index === lastScrolledParagraph) return;
    lastScrolledParagraph = index;
    await nextTick();
    const target = document.querySelector<HTMLElement>(
      `[data-paragraph-index="${index}"]`,
    );
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  watch(paragraphs, () => {
    stop();
  });

  // 系统音色选择变化时持久化
  watch(systemVoiceName, () => {
    persistSelectedVoice();
  });

  // 在线引擎模式 / 在线音色变化时持久化
  watch(edgeVoices.ttsEngineMode, () => {
    edgeVoices.persistEngineMode();
  });
  watch(edgeVoices.edgeVoiceName, () => {
    edgeVoices.persistEdgeVoice();
  });

  // 系统语音支持状态驱动系统音色的发现与清理（在线引擎不受此影响）
  watch(
    systemSupported,
    (isSupported) => {
      refreshAndroidNativeStatus();
      if (!isSupported) {
        voiceOptions.value = [];
        systemVoiceName.value = '';
        voiceSelectionMode.value = 'auto';
        if (!isEdgeMode.value) {
          closeVoicePanel();
          closePlaybackRatePanel();
        }
        clearVoiceRetryTimer();
        unbindVoiceChangedEvent();
        return;
      }
      restoreSelectedVoice();
      bindVoiceChangedEvent();
      startVoiceDiscovery();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    clearVoiceRetryTimer();
    unbindVoiceChangedEvent();
    stop();
  });

  if (typeof window !== 'undefined' && hasAndroidNativeTTSBridge()) {
    const unlistenAndroidNativeEvents = onAndroidNativeTTSEvent((detail) => {
      refreshAndroidNativeStatus();
      if (
        (detail.type === 'ready' || detail.type === 'voices') &&
        voiceOptions.value.length === 0
      ) {
        startVoiceDiscovery();
      }
    });
    onBeforeUnmount(() => {
      unlistenAndroidNativeEvents();
    });
  }

  return {
    supported,
    canUseAnyTTS,
    isEdgeMode,
    hasContent,
    paragraphCount,
    ready,
    showListenButton,
    visible,
    progressLabel,
    activeParagraphIndex,
    playbackRate,
    playbackRateLabel,
    cyclePlaybackRate,
    setPlaybackRate,
    playbackRatePanelOpen,
    togglePlaybackRatePanel,
    closePlaybackRatePanel,
    selectedVoiceName,
    selectedVoiceLabel,
    selectedVoiceTitle,
    chooseVoice,
    previewVoice,
    voicePreviewing,
    previewingVoiceName,
    voicePanelOpen,
    toggleVoicePanel,
    closeVoicePanel,
    voiceOptions,
    voiceOptionItems,
    onlineVoiceOptionItems,
    systemVoiceOptionItems,
    hasOnlineVoices,
    speaking,
    paused,
    progress,
    total,
    buffering,
    bufferProgress,
    currentSegmentIndex,
    currentParagraphIndex,
    currentText,
    currentVoiceName,
    effectiveVoiceLabel,
    effectiveVoiceSummary,
    compatibilityHint,
    showNativeTtsSetupAction,
    nativeTtsSetupLabel,
    openNativeTtsSetup,
    play,
    pause,
    resume,
    stop,
    togglePause,
  };
}
