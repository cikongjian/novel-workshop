/**
 * TTS 合成服务
 *
 * 编排 文本解析 → 声音映射 → 引擎合成
 *
 * 特性：
 * - 多引擎支持：Edge TTS（免费在线）/ Qwen3-TTS（本地 GPU）
 * - 混合模式：Qwen3-TTS 引擎下旁白使用 Edge TTS 并行预生成，对话使用 Qwen3 角色音色
 * - 14+ 种中文声音，按角色性别/年龄/风格智能匹配
 * - 高码率输出（96kbps MP3）
 * - 流式逐段合成 + 内存缓存
 * - 段落间静音停顿（生成静音 MP3 帧）
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { parseChapterText } from './text-parser.js';
import type { TextSegment } from './text-parser.js';
import { mapVoices, getVoiceForSegment, getQwen3VoiceConfig, DEFAULT_VOICES } from './voice-mapper.js';
import { getTTSEngine, getTTSEngineType, getNarrationEngineType, getEdgeTTSEngine, getKokoroTTSEngine } from './engine-factory.js';
import { getNovelsDir } from '../config/index.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';
import { resolvePathWithin } from '../utils/path-safety.js';

// ==================== 类型 ====================

export interface CharacterRef {
  id: string;
  name: string;
  aliases: string[];
  gender?: string;
  age?: string;
  speechStyle?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  /** 用户手动指定的 Edge TTS 声音名称 */
  ttsVoice?: string;
  /** Qwen3-TTS voice clone prompt 数据（Base64） */
  voiceClonePromptData?: string;
  /** Qwen3-TTS 声音设计指令 */
  voiceInstruct?: string;
}

export interface SynthesizedSegment {
  text: string;
  type: 'narration' | 'dialogue';
  speaker?: string;
  voice: string;
  paragraphIndex: number;
}

export interface StreamSegmentEvent {
  type: 'segment';
  index: number;
  total: number;
  segment: SynthesizedSegment;
  audio: string; // base64
  duration: number; // 毫秒
}

export interface StreamDoneEvent {
  type: 'done';
  totalSegments: number;
}

export type StreamEvent = StreamSegmentEvent | StreamDoneEvent;

export interface SynthesizeChapterOptions {
  narratorVoice?: string;
  novelId?: string;
  chapterNumber?: number;
}

// ==================== 配置 ====================

/**
 * 停顿时长配置（毫秒）
 * 通过生成静音 MP3 帧实现段落间停顿
 */
const PAUSE_CONFIG = {
  /** 旁白 → 对话 切换时的停顿 */
  narrationToDialogue: 300,
  /** 对话 → 旁白 切换时的停顿 */
  dialogueToNarration: 200,
  /** 不同说话人之间切换时的停顿 */
  speakerChange: 350,
  /** 段落切换时的额外停顿 */
  paragraphChange: 400,
} as const;

// ==================== 静音 MP3 帧 ====================

/**
 * 24kHz 96kbps mono MP3 静音帧（约 26ms 一帧）
 *
 * 这是一个最小的合法 MPEG Layer III 帧，采样率 24kHz，比特率 96kbps，
 * 内容全零（静音）。用于在 segment 之间插入停顿。
 *
 * 帧头: FF FB 70 00
 *   - sync: 0xFFF (同步)
 *   - version: MPEG1
 *   - layer: Layer III
 *   - bitrate: 96kbps
 *   - samplerate: 24000Hz
 *   - channel: mono
 */
const SILENCE_FRAME = Buffer.from(
  'fffb7000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '00000000000000000000000000000000000000000000000000000000',
  'hex'
);

/** 每个静音帧的时长（毫秒） */
const SILENCE_FRAME_DURATION_MS = 26;

/**
 * 生成指定时长的静音 MP3 Buffer
 */
function generateSilence(durationMs: number): Buffer {
  if (durationMs <= 0) return Buffer.alloc(0);
  const frameCount = Math.max(1, Math.round(durationMs / SILENCE_FRAME_DURATION_MS));
  const frames: Buffer[] = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(SILENCE_FRAME);
  }
  return Buffer.concat(frames);
}

// ==================== 缓存 ====================

interface CachedSegment {
  segment: SynthesizedSegment;
  audio: string;
  duration: number;
  /** 该 segment 使用的角色 ID（用于检测声音变化） */
  characterId?: string;
  /** 该 segment 使用的声音配置哈希（用于检测声音变化） */
  voiceHash?: string;
}

/** 内存缓存：key = contentHash, value = 已合成的 segments */
const memoryCache = new Map<string, CachedSegment[]>();

/** 缓存上限（条目数），防止内存无限增长 */
const MAX_CACHE_ENTRIES = 50;

function contentHash(content: string, rate?: string): string {
  return createHash('sha256').update(`${content}|${rate ?? ''}`).digest('hex');
}

function evictIfNeeded() {
  if (memoryCache.size > MAX_CACHE_ENTRIES) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
}

function getNovelTtsDir(novelId: string): string {
  return resolvePathWithin(resolveNovelStorageDir(getNovelsDir(), novelId), 'tts');
}

/**
 * 获取章节 TTS 缓存文件路径
 */
function getCachePath(novelId: string, chapterNumber: number, rate?: string): string {
  const rateStr = rate ? `-${rate.replace(/[^a-zA-Z0-9]/g, '')}` : '';
  return resolvePathWithin(getNovelTtsDir(novelId), `chapter-${chapterNumber}${rateStr}.json`);
}

/**
 * 从文件系统加载缓存
 */
async function loadCacheFromFile(novelId: string, chapterNumber: number, rate?: string): Promise<CachedSegment[] | null> {
  try {
    const cachePath = getCachePath(novelId, chapterNumber, rate);
    const data = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(data) as CachedSegment[];
  } catch {
    return null;
  }
}

/**
 * 保存缓存到文件系统
 */
async function saveCacheToFile(novelId: string, chapterNumber: number, segments: CachedSegment[], rate?: string): Promise<void> {
  try {
    const cachePath = getCachePath(novelId, chapterNumber, rate);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(segments, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[TTS] 保存缓存文件失败:', err instanceof Error ? err.message : err);
  }
}

/**
 * 删除章节 TTS 缓存文件
 */
async function deleteCacheFile(novelId: string, chapterNumber: number, rate?: string): Promise<boolean> {
  try {
    const cachePath = getCachePath(novelId, chapterNumber, rate);
    await fs.unlink(cachePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 计算角色声音配置的哈希值
 * 用于检测声音配置是否变化
 */
function getVoiceConfigHash(char: CharacterRef): string {
  const config = {
    ttsVoice: char.ttsVoice,
    voiceInstruct: char.voiceInstruct,
    voiceClonePromptData: char.voiceClonePromptData,
    gender: char.gender,
    age: char.age,
    speechStyle: char.speechStyle,
  };
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

/**
 * 检查缓存的 segment 是否需要重新合成
 * 如果角色声音配置变化，返回 true
 */
function shouldRegenerateSegment(
  cached: CachedSegment,
  characters: CharacterRef[],
): boolean {
  if (!cached.characterId) {
    // 旁白段落没有角色，无需重新合成
    return false;
  }

  if (!cached.voiceHash) {
    // 旧版缓存缺少 voiceHash，保守起见重新合成
    return true;
  }

  const char = characters.find(c => c.id === cached.characterId);
  if (!char) {
    // 角色已删除，使用缓存
    return false;
  }

  const currentHash = getVoiceConfigHash(char);
  return currentHash !== cached.voiceHash;
}
export function clearChapterCache(content?: string, rate?: string): number {
  if (content) {
    const hash = contentHash(content, rate);
    const deleted = memoryCache.delete(hash);
    return deleted ? 1 : 0;
  }
  const count = memoryCache.size;
  memoryCache.clear();
  return count;
}

/**
 * 清除指定章节的 TTS 缓存文件
 */
export async function clearChapterCacheFile(novelId: string, chapterNumber: number, rate?: string): Promise<number> {
  const deleted = await deleteCacheFile(novelId, chapterNumber, rate);
  return deleted ? 1 : 0;
}

/**
 * 清除指定小说的所有 TTS 缓存文件
 */
export async function clearAllChapterCacheFiles(novelId: string): Promise<number> {
  const ttsDir = getNovelTtsDir(novelId);

  try {
    const files = await fs.readdir(ttsDir);
    const chapterFiles = files.filter(f => /^chapter-\d+\.json$/.test(f));
    let count = 0;
    for (const file of chapterFiles) {
      try {
        await fs.unlink(resolvePathWithin(ttsDir, file));
        count++;
      } catch {
        // ignore
      }
    }
    return count;
  } catch {
    return 0;
  }
}

// ==================== 同角色对话合并 ====================

/**
 * 合并同一说话人的相邻对话段
 *
 * 在 Qwen3-TTS 模式下，每个 segment 对应一次 HTTP 调用 + 一次 GPU 推理。
 * 当同一角色连续说多句话（如"我不知道。""不过我会去查的。"），
 * 合并为单次调用可以：
 * 1. 减少 HTTP 和 GPU 初始化开销
 * 2. 让模型生成更自然的跨句韵律
 *
 * 合并条件：
 * - 两个 segment 都是 dialogue 类型
 * - 同一个 characterId 或 speaker
 * - 在同一个段落内（paragraphIndex 相同）
 * - 合并后总长度不超过 200 字（避免单次推理过长）
 */
function mergeSameSpeakerDialogues(segments: TextSegment[]): TextSegment[] {
  const MAX_MERGED_LENGTH = 200;
  const merged: TextSegment[] = [];

  for (const seg of segments) {
    const last = merged.length > 0 ? merged[merged.length - 1] : undefined;

    if (
      last
      && last.type === 'dialogue'
      && seg.type === 'dialogue'
      && last.paragraphIndex === seg.paragraphIndex
      && last.text.length + seg.text.length <= MAX_MERGED_LENGTH
      && (
        (last.characterId && last.characterId === seg.characterId)
        || (!last.characterId && !seg.characterId && last.speaker && last.speaker === seg.speaker)
      )
    ) {
      // 合并：用逗号/空格拼接
      last.text = `${last.text}${seg.text}`;
      continue;
    }

    merged.push({ ...seg });
  }

  return merged;
}

// ==================== 停顿计算 ====================

/**
 * 计算 segment 之间应插入的停顿时长
 *
 * 规则：
 * - 段落切换（paragraphIndex 不同）：+400ms
 * - 旁白→对话 / 对话→旁白 类型切换：+300ms / +200ms
 * - 同为对话但不同说话人：+350ms
 * - 其他情况：0ms
 */
function calculatePauseBefore(
  current: TextSegment,
  previous: TextSegment | undefined,
): number {
  if (!previous) return 0;

  let pause = 0;

  // 段落切换额外停顿
  if (current.paragraphIndex !== previous.paragraphIndex) {
    pause += PAUSE_CONFIG.paragraphChange;
  }

  // 类型切换停顿
  if (previous.type === 'narration' && current.type === 'dialogue') {
    pause += PAUSE_CONFIG.narrationToDialogue;
  } else if (previous.type === 'dialogue' && current.type === 'narration') {
    pause += PAUSE_CONFIG.dialogueToNarration;
  } else if (previous.type === 'dialogue' && current.type === 'dialogue') {
    // 同类型对话，但说话人不同
    const prevSpeaker = previous.characterId ?? previous.speaker;
    const currSpeaker = current.characterId ?? current.speaker;
    if (prevSpeaker && currSpeaker && prevSpeaker !== currSpeaker) {
      pause += PAUSE_CONFIG.speakerChange;
    }
  }

  return pause;
}

// ==================== 合成 ====================

/** 合成结果，包含实际使用的声音标识 */
interface SegmentSynthResult {
  buffer: Buffer;
  duration: number;
  /** 实际使用的声音标识（Edge TTS voice name 或 Qwen3 speaker name） */
  usedVoice: string;
}

/**
 * 合成单个 segment 的音频
 *
 * 通过 TTS 引擎抽象层调用当前配置的引擎。
 * Edge TTS 使用 voice + rate 参数；
 * Qwen3-TTS 优先使用 voiceClonePromptData，降级使用预设 speaker。
 */
async function synthesizeSegment(
  text: string,
  voice: string,
  rate?: string,
  charRef?: CharacterRef,
  segment?: TextSegment,
  characters?: CharacterRef[],
): Promise<SegmentSynthResult> {
  const engine = getTTSEngine();

  // Qwen3-TTS 模式：使用专门的声音配置（预设 speaker + instruct）
  if (getTTSEngineType() === 'qwen3-tts' && segment && characters) {
    const qwen3Config = getQwen3VoiceConfig(segment, characters);
    if (qwen3Config) {
      const result = await engine.synthesize({
        text,
        voiceClonePromptData: qwen3Config.voiceClonePromptData,
        speaker: qwen3Config.speaker,
        instruct: qwen3Config.instruct,
      });
      return {
        buffer: result.buffer,
        duration: result.duration,
        usedVoice: qwen3Config.speaker ?? 'qwen3-clone',
      };
    }
  }

  // Edge TTS 模式 / Qwen3 降级
  const result = await engine.synthesize({
    text,
    voice,
    rate,
    voiceClonePromptData: charRef?.voiceClonePromptData,
    instruct: charRef?.voiceInstruct,
  });

  return { buffer: result.buffer, duration: result.duration, usedVoice: voice };
}

/**
 * 使用旁白引擎合成单个旁白 segment（混合模式专用）
 *
 * 根据 TTS_NARRATION_ENGINE 配置选择 Edge TTS 或 Kokoro。
 */
async function synthesizeNarration(
  text: string,
  voice: string,
  rate?: string,
): Promise<{ buffer: Buffer; duration: number }> {
  // 策略：Edge TTS 为主（音质最好），限速时自动降级到 Kokoro
  const edgeEngine = getEdgeTTSEngine();
  const maxRetries = 3;
  const baseDelay = 1500;

  // 第一阶段：尝试 Edge TTS（带指数退避重试）
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        const delay = baseDelay * attempt + Math.random() * 1000;
        console.log(`[TTS 旁白] Edge TTS 重试 ${attempt}/${maxRetries}，等待 ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      const result = await edgeEngine.synthesize({ text, voice, rate });
      return { buffer: result.buffer, duration: result.duration };
    } catch (err) {
      console.warn(
        `[TTS 旁白] Edge TTS 尝试 ${attempt} 失败:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 第二阶段：Edge TTS 多次失败（大概率被限速），降级到 Kokoro
  console.log('[TTS 旁白] Edge TTS 被限速，降级到 Kokoro...');
  try {
    const kokoroEngine = getKokoroTTSEngine();
    const available = await kokoroEngine.isAvailable();
    if (available) {
      const result = await kokoroEngine.synthesize({ text, rate });
      return { buffer: result.buffer, duration: result.duration };
    }
    console.warn('[TTS 旁白] Kokoro 服务不可用，无法降级');
  } catch (err) {
    console.warn(
      '[TTS 旁白] Kokoro 降级也失败:',
      err instanceof Error ? err.message : err,
    );
  }

  throw new Error('旁白合成失败：Edge TTS 被限速且 Kokoro 不可用');
}

// ==================== 混合模式并行预生成 ====================

/** 预生成的旁白音频缓存 */
interface PreGeneratedAudio {
  buffer: Buffer;
  duration: number;
  voice: string;
}

/**
 * 并行预生成所有旁白音频（Edge TTS）
 *
 * 混合模式核心：当主引擎为 Qwen3-TTS 时，旁白段落使用 Edge TTS 并行预生成。
 * Edge TTS 每段仅需 1-3 秒，所有旁白几乎同时完成。
 *
 * @returns index → PreGeneratedAudio 映射，仅包含旁白段落
 */
/**
 * 启动所有旁白段落的并行预生成（非阻塞）
 *
 * 返回 index → Promise 映射，主循环遇到旁白时只需 await 对应的 Promise，
 * 不必等待全部旁白完成，实现"边合成边播放"。
 */
function startNarrationPreGen(
  segments: TextSegment[],
  voiceMap: Map<string, string>,
  rate?: string,
  cachedKeys?: Set<string>,
): Map<number, Promise<PreGeneratedAudio | null>> {
  const promises = new Map<number, Promise<PreGeneratedAudio | null>>();

  const narrationTasks: Array<{ index: number; text: string; voice: string }> = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].type === 'narration') {
      // 跳过已有缓存的旁白段落
      const key = `narration|${segments[i].speaker ?? ''}|${segments[i].text}`;
      if (cachedKeys?.has(key)) continue;

      const voice = getVoiceForSegment(segments[i], voiceMap);
      narrationTasks.push({ index: i, text: segments[i].text, voice });
    }
  }

  if (narrationTasks.length === 0) return promises;

  const narrationEngineName = getNarrationEngineType();
  console.log(`[TTS 混合] 并行预生成 ${narrationTasks.length} 个旁白段落 (${narrationEngineName})...`);

  // 并发限制：用信号量控制最多同时 3 个请求
  const MAX_CONCURRENCY = 3;
  let running = 0;
  const waiting: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (running < MAX_CONCURRENCY) {
      running++;
      return Promise.resolve();
    }
    return new Promise<void>(resolve => waiting.push(resolve));
  }

  function release(): void {
    if (waiting.length > 0) {
      const next = waiting.shift()!;
      next();
    } else {
      running--;
    }
  }

  let completed = 0;

  for (const task of narrationTasks) {
    const p = (async (): Promise<PreGeneratedAudio | null> => {
      await acquire();
      try {
        const audio = await synthesizeNarration(task.text, task.voice, rate);
        completed++;
        console.log(`[TTS 混合] 旁白 ${task.index} 完成 (${completed}/${narrationTasks.length})`);
        return { ...audio, voice: task.voice };
      } catch (err) {
        completed++;
        console.warn(
          `[TTS 混合] 旁白 ${task.index} ${narrationEngineName} 失败 (${completed}/${narrationTasks.length}):`,
          err instanceof Error ? err.message : err,
        );
        return null;
      } finally {
        release();
      }
    })();

    promises.set(task.index, p);
  }

  return promises;
}

// ==================== 流式合成 ====================

/**
 * 流式合成章节音频
 *
 * - 命中缓存：所有 segments 立即 yield（秒回）
 * - 未命中：逐段合成，每完成一段就 yield，同时写入缓存
 *
 * 缓存策略：
 * 1. 优先从文件系统加载（持久化缓存）
 * 2. 降级到内存缓存（服务器重启后失效）
 * 3. 未命中则合成，并同时写入文件和内存
 *
 * 混合模式（Qwen3-TTS 引擎下）：
 * 1. 预生成：所有旁白段落通过 Edge TTS 并行合成（~2-5 秒全部完成）
 * 2. 按序输出：遍历段落列表
 *    - 旁白 → 从预生成缓存直接取出（瞬间）
 *    - 对话 → 调用 Qwen3-TTS 实时合成（~30-100 秒/段）
 * 3. 总耗时 ≈ 仅对话段落的 Qwen3 合成时间
 *
 * Edge TTS 引擎下：逐段顺序合成（原有逻辑）。
 */
export async function* synthesizeChapterStream(
  content: string,
  characters: CharacterRef[],
  rate?: string,
  options?: SynthesizeChapterOptions,
): AsyncGenerator<StreamEvent> {
  const hash = contentHash(content, rate);
  const { novelId, chapterNumber } = options ?? {};

  // 始终尝试加载文件缓存
  let oldCache: CachedSegment[] | null = null;
  if (novelId && chapterNumber !== undefined) {
    const fileCache = await loadCacheFromFile(novelId, chapterNumber, rate);
    if (fileCache && fileCache.length > 0) {
      const needsRegeneration = fileCache.some(c => shouldRegenerateSegment(c, characters));

      if (!needsRegeneration) {
        // 快速路径：重新解析当前内容，逐段比对文本是否完全一致
        const testSegments = parseChapterText(content, characters);
        const testMerged = getTTSEngineType() === 'qwen3-tts'
          ? mergeSameSpeakerDialogues(testSegments)
          : testSegments;
        const allMatch = testMerged.length === fileCache.length
          && testMerged.every((seg, idx) => seg.text === fileCache[idx].segment.text);

        if (allMatch) {
          console.log(`[TTS] 文件缓存完全命中 (novel=${novelId}, chapter=${chapterNumber}, segments=${fileCache.length})`);
          for (let i = 0; i < fileCache.length; i++) {
            const c = fileCache[i];
            yield {
              type: 'segment',
              index: i,
              total: fileCache.length,
              segment: c.segment,
              audio: c.audio,
              duration: c.duration,
            };
          }
          yield { type: 'done', totalSegments: fileCache.length };
          return;
        }
      }

      // 保留旧缓存用于段落级差异复用
      oldCache = fileCache;
      console.log(`[TTS] 加载旧缓存用于差异复用 (${fileCache.length} segments)`);
    }
  }

  // 降级到内存缓存
  const cached = memoryCache.get(hash);
  if (cached && cached.length > 0) {
    console.log(`[TTS] 内存缓存命中 (hash=${hash.slice(0, 8)}..., segments=${cached.length})`);
    for (let i = 0; i < cached.length; i++) {
      const c = cached[i];
      yield {
        type: 'segment',
        index: i,
        total: cached.length,
        segment: c.segment,
        audio: c.audio,
        duration: c.duration,
      };
    }
    yield { type: 'done', totalSegments: cached.length };
    return;
  }

  // 未命中 → 解析 + 合成
  const rawSegments = parseChapterText(content, characters);

  // Qwen3-TTS 模式下，合并同一说话人的相邻对话段
  // 减少模型调用次数，同时让模型生成更自然的跨句韵律
  const textSegments = getTTSEngineType() === 'qwen3-tts'
    ? mergeSameSpeakerDialogues(rawSegments)
    : rawSegments;

  const dialogueSegments = textSegments.filter(seg => seg.type === 'dialogue');
  const unresolvedDialogues = dialogueSegments.filter(seg => !seg.characterId && !seg.speaker);
  if (dialogueSegments.length > 0) {
    const mergedCount = rawSegments.length - textSegments.length;
    console.log(
      `[TTS] 解析完成: 总段落=${textSegments.length}${mergedCount > 0 ? ` (合并${mergedCount}段)` : ''}, 对话=${dialogueSegments.length}, 未识别说话人=${unresolvedDialogues.length}`,
    );
    if (unresolvedDialogues.length > 0) {
      const sample = unresolvedDialogues
        .slice(0, 3)
        .map(seg => seg.text.slice(0, 24).replace(/\s+/g, ' '))
        .join(' | ');
      console.warn(`[TTS] 未识别说话人示例: ${sample}`);
    }
  }

  if (textSegments.length === 0) {
    yield { type: 'done', totalSegments: 0 };
    return;
  }

  const voiceMap = mapVoices(textSegments, characters, {
    narratorVoice: options?.narratorVoice,
  });
  const cacheEntries: CachedSegment[] = [];
  let reusedCount = 0;

  // 判断是否启用混合模式
  const isHybrid = getTTSEngineType() === 'qwen3-tts';

  // 构建旧缓存的文本索引（用于段落级差异复用）
  // key = "type|speaker|text" → CachedSegment（同文本同角色可直接复用音频）
  const oldCacheIndex = new Map<string, CachedSegment>();
  if (oldCache) {
    for (const c of oldCache) {
      const key = `${c.segment.type}|${c.segment.speaker ?? ''}|${c.segment.text}`;
      if (!oldCacheIndex.has(key)) {
        oldCacheIndex.set(key, c);
      }
    }
  }

  // 混合模式：启动旁白并行预生成（非阻塞，跳过已缓存的段落）
  let narrationPromises: Map<number, Promise<PreGeneratedAudio | null>> | null = null;

  if (isHybrid) {
    const narrationCount = textSegments.filter(s => s.type === 'narration').length;
    const dialogueCount = textSegments.filter(s => s.type === 'dialogue').length;
    console.log(`[TTS 混合] 章节分析: ${textSegments.length} 段 (${narrationCount} 旁白 + ${dialogueCount} 对话)`);
    const cachedKeys = new Set(oldCacheIndex.keys());
    narrationPromises = startNarrationPreGen(textSegments, voiceMap, rate, cachedKeys);
  }

  for (let i = 0; i < textSegments.length; i++) {
    const seg = textSegments[i];
    const prevSeg = i > 0 ? textSegments[i - 1] : undefined;
    const voice = getVoiceForSegment(seg, voiceMap);

    // 查找该 segment 对应的角色引用（用于 Qwen3-TTS 传递 clone prompt）
    const charRef = seg.characterId
      ? characters.find(c => c.id === seg.characterId)
      : undefined;

    // 计算段间停顿
    const pauseMs = calculatePauseBefore(seg, prevSeg);

    let audioBuffer: Buffer | null = null;
    let duration = 0;
    let usedVoice = voice;

    // 尝试从旧缓存复用（按文本+类型+说话人匹配，不依赖索引位置）
    if (oldCacheIndex.size > 0) {
      const key = `${seg.type}|${seg.speaker ?? ''}|${seg.text}`;
      const oldSeg = oldCacheIndex.get(key);
      if (oldSeg && !shouldRegenerateSegment(oldSeg, characters)) {
        audioBuffer = Buffer.from(oldSeg.audio, 'base64');
        duration = oldSeg.duration;
        usedVoice = oldSeg.segment.voice;
        console.log(`[TTS] 复用缓存 segment ${i}: "${seg.text.slice(0, 20)}..."`);
        reusedCount++;
      }
    }

    // 如果没有复用缓存，则需要合成
    if (!audioBuffer) {
      // 混合模式：旁白使用预生成的音频（只等当前 segment 的 Promise）
      if (isHybrid && seg.type === 'narration') {
        if (narrationPromises?.has(i)) {
          const preGen = await narrationPromises.get(i)!;
          if (preGen) {
            audioBuffer = preGen.buffer;
            duration = preGen.duration;
            usedVoice = preGen.voice;
            console.log(`[TTS 混合] 使用预生成旁白 segment ${i}: "${seg.text.slice(0, 20)}"...`);
          } else {
            console.warn(`[TTS 混合] 旁白 segment ${i} 预生成失败，降级到实时合成`);
          }
        }
      }
      
      // 如果未从预生成获取到（或不是混合模式），实时合成
      if (!audioBuffer) {
        // 首次尝试：使用分配的引擎合成
        try {
          const result = await synthesizeSegment(seg.text, voice, rate, charRef, seg, characters);
          audioBuffer = result.buffer;
          duration = result.duration;
          usedVoice = result.usedVoice;
        } catch (err) {
          console.warn(
            `[TTS] segment ${i} 首次合成失败 (voice=${voice}):`,
            err instanceof Error ? err.message : err,
          );
        }

        // Fallback：如果首次失败，用旁白引擎默认声音重试
        if (!audioBuffer) {
          usedVoice = DEFAULT_VOICES.narrator;
          try {
            console.log(`[TTS] segment ${i} 降级到旁白引擎重试 (voice=${usedVoice})`);
            const result = await synthesizeNarration(seg.text, usedVoice, rate);
            audioBuffer = result.buffer;
            duration = result.duration;
          } catch (retryErr) {
            console.error(
              `[TTS] segment ${i} 旁白引擎重试也失败:`,
              retryErr instanceof Error ? retryErr.message : retryErr,
            );
          }
        }
      }
    }

    // 如果仍然失败，跳过该 segment
    if (!audioBuffer) {
      console.error(`[TTS] segment ${i} 彻底跳过: "${seg.text.slice(0, 30)}..."`);
      continue;
    }

    // 如果有停顿，在音频前拼接静音帧
    let finalBuffer: Buffer;
    let finalDuration: number;
    if (pauseMs > 0) {
      const silenceBuffer = generateSilence(pauseMs);
      finalBuffer = Buffer.concat([silenceBuffer, audioBuffer]);
      finalDuration = duration + pauseMs;
    } else {
      finalBuffer = audioBuffer;
      finalDuration = duration;
    }

    const audio = finalBuffer.toString('base64');

    const segmentData: SynthesizedSegment = {
      text: seg.text,
      type: seg.type,
      speaker: seg.speaker,
      voice: usedVoice,
      paragraphIndex: seg.paragraphIndex,
    };

    // 计算角色声音配置哈希（用于后续检测声音变化）
    const voiceHash = charRef ? getVoiceConfigHash(charRef) : undefined;

    cacheEntries.push({
      segment: segmentData,
      audio,
      duration: finalDuration,
      characterId: seg.characterId,
      voiceHash,
    });

    yield {
      type: 'segment',
      index: i,
      total: textSegments.length,
      segment: segmentData,
      audio,
      duration: finalDuration,
    };
  }

  // 写入缓存（内存 + 文件）
  if (cacheEntries.length > 0) {
    evictIfNeeded();
    memoryCache.set(hash, cacheEntries);
    console.log(`[TTS] 已缓存到内存 (hash=${hash.slice(0, 8)}..., segments=${cacheEntries.length})`);

    // 持久化到文件系统
    if (novelId && chapterNumber !== undefined) {
      await saveCacheToFile(novelId, chapterNumber, cacheEntries, rate);
      console.log(`[TTS] 已缓存到文件 (novel=${novelId}, chapter=${chapterNumber})`);
    }
  }

  if (reusedCount > 0) {
    const synthesized = textSegments.length - reusedCount;
    console.log(`[TTS] 差异复用: ${reusedCount}/${textSegments.length} 段复用缓存, ${synthesized} 段重新合成`);
  }

  yield { type: 'done', totalSegments: textSegments.length };
}
