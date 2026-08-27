import { http } from './http';
import { getSessionAccessToken } from '../utils/auth-session';

// ==================== TTS 语音合成（SSE 流式）====================

export interface TTSSegmentData {
  text: string;
  type: 'narration' | 'dialogue';
  speaker?: string;
  voice: string;
  paragraphIndex: number;
}

export interface TTSStreamSegment {
  type: 'segment';
  index: number;
  total: number;
  segment: TTSSegmentData;
  audio: string; // base64
  duration: number;
}

export interface TTSStreamDone {
  type: 'done';
  totalSegments: number;
}

export interface TTSStreamError {
  type: 'error';
  message: string;
}

export type TTSStreamEvent = TTSStreamSegment | TTSStreamDone | TTSStreamError;

/**
 * 建立 SSE 连接，流式接收 TTS 合成结果
 *
 * @returns abort 函数，调用后可中断连接
 */
export function streamTTSSynthesize(
  novelId: string,
  chapterNumber: number,
  onEvent: (event: TTSStreamEvent) => void,
  rate?: string,
  options?: { onAbort?: () => void },
): () => void {
  const controller = new AbortController();
  let closed = false;

  const close = (triggerAbort = false) => {
    if (closed) return;
    closed = true;
    controller.abort();
    if (triggerAbort) {
      options?.onAbort?.();
    }
  };

  (async () => {
    try {
      const accessToken = getSessionAccessToken();
      const params = new URLSearchParams();
      if (rate) params.set('rate', rate);
      const qs = params.toString();
      const url = `/api/tts/${novelId}/${chapterNumber}${qs ? `?${qs}` : ''}`;

      const response = await fetch(url, {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '请求失败' }));
        onEvent({ type: 'error', message: errorData.error || `HTTP ${response.status}` });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onEvent({ type: 'error', message: '流式响应不可用' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (closed) break;
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(trimmed.slice(6)) as TTSStreamEvent;
            onEvent(data);
            if (data.type === 'done' || data.type === 'error') {
              close();
              return;
            }
          } catch {
            // 忽略解析失败的事件
          }
        }
      }
    } catch (err) {
      if (closed) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onEvent({ type: 'error', message: '连接中断' });
      close();
    }
  })();

  return () => close(true);
}

// ==================== 有声读物列表 ====================

export interface AudiobookEntry {
  chapterNumber: number;
  title: string;
  segmentCount: number;
  totalDuration: number;
  synthesizedAt: string;
  fileSize: number;
}

export interface AudiobookPageResponse {
  novelId: string;
  entries: AudiobookEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function fetchAudiobookList(
  novelId: string,
): Promise<AudiobookEntry[]> {
  const { data } = await http.get<AudiobookPageResponse>(
    `/tts/audiobook/${novelId}`,
  );
  return data.entries;
}

export async function fetchAudiobookPage(
  novelId: string,
  params: { page: number; pageSize: number; order?: 'asc' | 'desc' },
): Promise<AudiobookPageResponse> {
  const { data } = await http.get<AudiobookPageResponse>(
    `/tts/audiobook/${novelId}`,
    { params },
  );
  return data;
}

/**
 * 清除指定章节的 TTS 合成缓存
 */
export async function clearTTSCache(
  novelId: string,
  chapterNumber: number,
): Promise<{ cleared: number; message: string }> {
  const { data } = await http.delete<{ cleared: number; message: string }>(
    `/tts/${novelId}/${chapterNumber}`,
  );
  return data;
}

/**
 * 清除指定小说的所有 TTS 合成缓存
 */
export async function clearAllTTSCache(
  novelId: string,
): Promise<{ cleared: number; message: string }> {
  const { data } = await http.delete<{ cleared: number; message: string }>(
    `/tts/audiobook/${novelId}`,
  );
  return data;
}

// ==================== TTS 声音管理 ====================

export interface VoiceInfo {
  name: string;
  gender: 'male' | 'female';
  label: string;
  locale: string;
  ageTags: string[];
  styleTags: string[];
  hasStyles: boolean;
  /** 引擎来源标识 */
  engine?: 'edge-tts' | 'qwen3-tts' | 'kokoro';
}

export interface NovelNarratorVoiceSettings {
  novelId: string;
  voice: string;
  defaultVoice: string;
  voices: VoiceInfo[];
  /** 当前旁白引擎类型 */
  engine?: 'edge-tts' | 'kokoro';
}

/**
 * 获取所有可用的 TTS 声音列表
 */
export async function fetchVoices(): Promise<VoiceInfo[]> {
  const { data } = await http.get<VoiceInfo[]>('/tts/voices');
  return data;
}

/**
 * 获取小说级 Edge 旁白音色配置
 */
export async function fetchNovelNarratorVoiceSettings(novelId: string): Promise<NovelNarratorVoiceSettings> {
  const { data } = await http.get<NovelNarratorVoiceSettings>(`/tts/narrator-voice/${novelId}`);
  return data;
}

/**
 * 更新小说级 Edge 旁白音色
 */
export async function updateNovelNarratorVoice(
  novelId: string,
  voice: string,
): Promise<{ novelId: string; voice: string; cleared: number; message: string }> {
  const { data } = await http.put<{ novelId: string; voice: string; cleared: number; message: string }>(
    `/tts/narrator-voice/${novelId}`,
    { voice },
  );
  return data;
}

/**
 * 试听小说级 Edge 旁白音色
 */
export async function previewNovelNarratorVoice(
  novelId: string,
  params: { voice: string; text?: string; rate?: string },
): Promise<{ voice: string; audio: string; duration: number }> {
  const { data } = await http.post<{ voice: string; audio: string; duration: number }>(
    `/tts/narrator-voice/${novelId}/preview`,
    params,
    { timeout: 30000 },
  );
  return data;
}

/**
 * 预览指定声音
 */
export async function previewVoice(params: {
  voice: string;
  text: string;
  rate?: string;
}): Promise<{ audio: string; duration: number }> {
  const { data } = await http.post<{ audio: string; duration: number }>('/tts/preview', params, { timeout: 30000 });
  return data;
}

// ==================== TTS 引擎状态 ====================

export interface TTSEngineStatus {
  engine: 'edge-tts' | 'qwen3-tts';
  available: boolean;
  qwen3Url?: string;
}

/**
 * 获取当前 TTS 引擎状态
 */
export async function fetchTTSEngineStatus(): Promise<TTSEngineStatus> {
  const { data } = await http.get<TTSEngineStatus>('/tts/engine-status');
  return data;
}

/**
 * 测试 Qwen3-TTS 服务连接
 */
export async function testQwen3TTS(url: string): Promise<{
  success: boolean;
  model06bLoaded?: boolean;
  model17bLoaded?: boolean;
  gpu?: { name: string; memory_total_mb: number; memory_allocated_mb: number };
  elapsed?: number;
  error?: string;
}> {
  const { data } = await http.post('/settings/test-qwen3-tts', { url }, { timeout: 15000 });
  return data;
}

export interface Qwen3TTSServiceStatus {
  url: string;
  healthy: boolean;
  running: boolean;
  managed: boolean;
  pid: number | null;
  pythonCommand: string;
  scriptPath: string;
  autoStart: boolean;
  startedAt?: string;
}

export interface Qwen3TTSServiceActionResult {
  success: boolean;
  changed: boolean;
  message: string;
  status: Qwen3TTSServiceStatus;
}

/**
 * 获取后端托管的 Qwen3-TTS 服务状态
 */
export async function fetchQwen3TTSServiceStatus(url?: string): Promise<Qwen3TTSServiceStatus> {
  const { data } = await http.get<Qwen3TTSServiceStatus>('/settings/qwen3-tts-service', {
    params: url ? { url } : undefined,
  });
  return data;
}

/**
 * 启动后端托管的 Qwen3-TTS 服务
 */
export async function startQwen3TTSService(url?: string): Promise<Qwen3TTSServiceActionResult> {
  const { data } = await http.post<Qwen3TTSServiceActionResult>(
    '/settings/qwen3-tts-service/start',
    { url },
    { timeout: 30000 },
  );
  return data;
}

/**
 * 重启后端托管的 Qwen3-TTS 服务
 */
export async function restartQwen3TTSService(url?: string): Promise<Qwen3TTSServiceActionResult> {
  const { data } = await http.post<Qwen3TTSServiceActionResult>(
    '/settings/qwen3-tts-service/restart',
    { url },
    { timeout: 40000 },
  );
  return data;
}

/**
 * 停止后端托管的 Qwen3-TTS 服务
 */
export async function stopQwen3TTSService(url?: string): Promise<Qwen3TTSServiceActionResult> {
  const { data } = await http.post<Qwen3TTSServiceActionResult>(
    '/settings/qwen3-tts-service/stop',
    { url },
    { timeout: 15000 },
  );
  return data;
}

// ==================== Kokoro TTS 服务管理 ====================

/**
 * 测试 Kokoro TTS 服务连接
 */
export async function testKokoro(url: string): Promise<{
  success: boolean;
  model?: string;
  device?: string;
  defaultVoice?: string;
  voicesLoaded?: string[];
  elapsed?: number;
  error?: string;
}> {
  const { data } = await http.post('/settings/test-kokoro', { url }, { timeout: 15000 });
  return data;
}

export interface KokoroServiceStatus {
  url: string;
  healthy: boolean;
  running: boolean;
  managed: boolean;
  pid: number | null;
  pythonCommand: string;
  scriptPath: string;
  autoStart: boolean;
  startedAt?: string;
}

export interface KokoroServiceActionResult {
  success: boolean;
  changed: boolean;
  message: string;
  status: KokoroServiceStatus;
}

/**
 * 获取后端托管的 Kokoro 服务状态
 */
export async function fetchKokoroServiceStatus(url?: string): Promise<KokoroServiceStatus> {
  const { data } = await http.get<KokoroServiceStatus>('/settings/kokoro-service', {
    params: url ? { url } : undefined,
  });
  return data;
}

/**
 * 启动后端托管的 Kokoro 服务
 */
export async function startKokoroService(url?: string): Promise<KokoroServiceActionResult> {
  const { data } = await http.post<KokoroServiceActionResult>(
    '/settings/kokoro-service/start',
    { url },
    { timeout: 30000 },
  );
  return data;
}

/**
 * 重启后端托管的 Kokoro 服务
 */
export async function restartKokoroService(url?: string): Promise<KokoroServiceActionResult> {
  const { data } = await http.post<KokoroServiceActionResult>(
    '/settings/kokoro-service/restart',
    { url },
    { timeout: 40000 },
  );
  return data;
}

/**
 * 停止后端托管的 Kokoro 服务
 */
export async function stopKokoroService(url?: string): Promise<KokoroServiceActionResult> {
  const { data } = await http.post<KokoroServiceActionResult>(
    '/settings/kokoro-service/stop',
    { url },
    { timeout: 15000 },
  );
  return data;
}

// ==================== Qwen3-TTS 声音设计 ====================

/**
 * 为单个角色执行完整声音设计流程
 * （生成描述 -> VoiceDesign -> VoiceClone）
 */
export async function designCharacterVoice(
  novelId: string,
  characterId: string,
): Promise<{
  characterId: string;
  characterName: string;
  voiceInstruct: string;
  voiceDesignStatus: string;
  previewAudio: string;
  previewDuration: number;
}> {
  const { data } = await http.post(
    `/tts/design-voice/${novelId}/${characterId}`,
    {},
    { timeout: 0 },
  );
  return data;
}

/**
 * 预览已设计的角色声音
 */
export async function previewDesignedVoice(
  novelId: string,
  characterId: string,
  text?: string,
): Promise<{ audio: string; duration: number }> {
  const { data } = await http.post<{ audio: string; duration: number }>(
    `/tts/preview-designed/${novelId}/${characterId}`,
    { text },
    { timeout: 30000 },
  );
  return data;
}

/**
 * 批量为所有角色生成声音描述
 * （仅生成 `voiceInstruct`，不执行完整声音设计）
 */
export async function designAllVoices(
  novelId: string,
  force = false,
): Promise<{
  updated: number;
  narratorInstruct?: string;
  message: string;
}> {
  const url = force
    ? `/tts/design-voices/${novelId}?force=true`
    : `/tts/design-voices/${novelId}`;
  const { data } = await http.post(url, {}, { timeout: 120000 });
  return data;
}
