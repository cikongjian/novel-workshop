import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChatMessage, ModelClient } from '../models/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { NovelGenre } from '../novel/types.js';
import type { CharacterRef } from '../tts/tts-service.js';
import { parseChapterText } from '../tts/text-parser.js';
import { synthesizeChapterStream } from '../tts/tts-service.js';
import { getNovelsDir } from '../config/index.js';
import { parseJsonPayload } from '../utils/json-payload.js';
import {
  buildDefaultComplianceMetadata,
  type AdaptationComplianceMetadata,
} from './compliance-metadata.js';
import {
  buildAudioDramaPromptPack,
  type AudioDramaPromptProfile,
} from './audio-drama-prompt.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { now } from '../utils/text.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';
import { resolvePathWithin } from '../utils/path-safety.js';

export type AudioAdapterParams = {
  novelId: string;
  chapterNumberStart: number;
  chapterNumberEnd: number;
  outputDirRelative: string;
  modelClient?: ModelClient;
  rate?: string;
  dialogueIntensity?: AudioDramaDialogueIntensity;
  rewriteLevel?: AudioDramaRewriteLevel;
  narrationMaxRatio?: number;
  genreOverride?: NovelGenre;
  synthesizeAudio?: boolean;
};

export type AudioDramaDialogueIntensity = 'low' | 'medium' | 'high';
export type AudioDramaRewriteLevel = 'conservative' | 'balanced' | 'dramatic';
export type AudioDramaRewriteSource = 'llm' | 'rule' | 'llm-fallback';

type AudioDramaConfig = {
  dialogueIntensity: AudioDramaDialogueIntensity;
  rewriteLevel: AudioDramaRewriteLevel;
  narrationMaxRatio: number;
};

type AudioDramaLine = {
  speaker: string;
  text: string;
  source: 'original' | 'adapted';
};

type AudioDramaChapter = {
  chapterNumber: number;
  chapterTitle: string;
  dialogueRatio: number;
  narrationRatio: number;
  rewriteSource: AudioDramaRewriteSource;
  rewriteError?: string;
  lines: AudioDramaLine[];
  summary: string;
  warnings: string[];
};

type AudioScriptSegment = {
  index: number;
  type: 'narration' | 'dialogue';
  speaker?: string;
  voice: string;
  paragraphIndex: number;
  text: string;
  durationMs: number;
  startMs: number;
  endMs: number;
};

type AudioScriptChapter = {
  chapterNumber: number;
  chapterTitle: string;
  wordCount: number;
  audioPath: string;
  totalDurationMs: number;
  segments: AudioScriptSegment[];
  warnings: string[];
};

type AudioScriptPayload = {
  novelId: string;
  mode: 'audio';
  chapterNumberStart: number;
  chapterNumberEnd: number;
  generatedAt: string;
  mixGuidePath: string;
  dramaScriptPath: string;
  dramaConfig: AudioDramaConfig;
  synthesisMode: 'script-only' | 'tts';
  dramaPromptProfile: AudioDramaPromptProfile;
  dramaSourceSummary: {
    llm: number;
    rule: number;
    llmFallback: number;
  };
  compliance: AdaptationComplianceMetadata;
  totalDurationMs: number;
  chapters: AudioScriptChapter[];
  dramaChapters: AudioDramaChapter[];
  warnings: string[];
};

type AudioDramaBuildContext = {
  novelTitle: string;
  promptProfile: AudioDramaPromptProfile;
  promptLines: string[];
};

export type AudioAdapterResult = {
  payloadPath: string;
  mixGuidePath: string;
  dramaScriptPath: string;
  chapterAudioPaths: string[];
  totalDurationMs: number;
  chapterCount: number;
  synthesisMode: 'script-only' | 'tts';
  warnings: string[];
};

const NARRATOR = '旁白';
const SILENCE_FRAME = Buffer.from(
  'fffb7000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '00000000000000000000000000000000000000000000000000000000',
  'hex',
);
const SILENCE_FRAME_DURATION_MS = 26;

export class AudioAdapter {
  private readonly novelManager: NovelManager;
  private readonly novelsDir: string;
  private readonly modelClient?: ModelClient;
  private readonly logger: Logger;

  constructor(
    novelManager: NovelManager,
    novelsDir: string = getNovelsDir(),
    modelClient?: ModelClient,
    logger: Logger = createLogger('audio-adapter'),
  ) {
    this.novelManager = novelManager;
    this.novelsDir = novelsDir;
    this.modelClient = modelClient;
    this.logger = logger;
  }

  async generate(params: AudioAdapterParams): Promise<AudioAdapterResult> {
    const effectiveModelClient = params.modelClient ?? this.modelClient;
    const shouldSynthesizeAudio = params.synthesizeAudio ?? false;
    const synthesisMode: 'script-only' | 'tts' = shouldSynthesizeAudio ? 'tts' : 'script-only';
    const novelDir = resolveNovelStorageDir(this.novelsDir, params.novelId);
    const outputDirAbsolute = resolvePathWithin(novelDir, params.outputDirRelative);
    await fs.mkdir(outputDirAbsolute, { recursive: true });

    const chapters: AudioScriptChapter[] = [];
    const warnings: string[] = [];
    const chapterAudioPaths: string[] = [];
    let totalDurationMs = 0;

    const characters = await this.novelManager.getCharacters(params.novelId);
    const charRefs: CharacterRef[] = characters.map((c) => ({
      id: c.id,
      name: c.name,
      aliases: c.aliases,
      gender: c.gender,
      age: c.age,
      speechStyle: c.speechStyle,
      appearance: c.appearance,
      personality: c.personality,
      backstory: c.backstory,
      ttsVoice: c.ttsVoice,
      voiceClonePromptData: c.voiceClonePromptData,
      voiceInstruct: c.voiceInstruct,
    }));
    const fallbackSpeakers = inferDefaultSpeakersForScript(charRefs);

    let novelTitle = params.novelId;
    let novelGenre: string | undefined;
    try {
      const novel = await this.novelManager.getNovel(params.novelId);
      novelTitle = novel.title;
      novelGenre = novel.genre;
    } catch (error) {
      const warning = `读取小说元数据失败，已使用默认编剧模板：${error instanceof Error ? error.message : String(error)}`;
      warnings.push(warning);
      this.logger.warn('audio adapter load novel metadata failed', {
        novelId: params.novelId,
        error: warning,
      });
    }

    for (let chapterNumber = params.chapterNumberStart; chapterNumber <= params.chapterNumberEnd; chapterNumber++) {
      const chapterWarnings: string[] = [];
      const chapter = await this.novelManager.getChapter(params.novelId, chapterNumber);
      if (!chapter || !chapter.content.trim()) {
        const warning = `第${chapterNumber}章不存在或内容为空，已跳过。`;
        chapterWarnings.push(warning);
        warnings.push(warning);
        continue;
      }

      const segments: AudioScriptSegment[] = [];
      const audioBuffers: Buffer[] = [];
      let cursorMs = 0;
      let chapterAudioPathRelative = '';

      if (shouldSynthesizeAudio) {
        try {
          for await (const event of synthesizeChapterStream(chapter.content, charRefs, params.rate)) {
            if (event.type !== 'segment') continue;
            const durationMs = Math.max(0, Math.round(event.duration));
            const startMs = cursorMs;
            const endMs = startMs + durationMs;
            cursorMs = endMs;

            segments.push({
              index: event.index,
              type: event.segment.type,
              speaker: event.segment.speaker,
              voice: event.segment.voice,
              paragraphIndex: event.segment.paragraphIndex,
              text: event.segment.text,
              durationMs,
              startMs,
              endMs,
            });
            if (event.audio) {
              audioBuffers.push(Buffer.from(event.audio, 'base64'));
            }
          }
        } catch (error) {
          const warning = `第${chapterNumber}章TTS合成异常：${error instanceof Error ? error.message : String(error)}`;
          chapterWarnings.push(warning);
          warnings.push(warning);
        }

        if (segments.length === 0) {
          const fallbackDurationMs = 2000;
          segments.push({
            index: 0,
            type: 'narration',
            voice: 'fallback-silence',
            paragraphIndex: 0,
            text: buildFallbackText(chapter.content),
            durationMs: fallbackDurationMs,
            startMs: 0,
            endMs: fallbackDurationMs,
          });
          audioBuffers.push(buildSilenceMp3(fallbackDurationMs));
          cursorMs = fallbackDurationMs;

          const warning = `第${chapterNumber}章无可用TTS输出，已降级为静音占位音频。`;
          chapterWarnings.push(warning);
          warnings.push(warning);
        }

        const chapterAudioFilename = `chapter-${String(chapterNumber).padStart(3, '0')}.mp3`;
        const chapterAudioPathAbsolute = path.join(outputDirAbsolute, chapterAudioFilename);
        chapterAudioPathRelative = toPosix(path.join(params.outputDirRelative, chapterAudioFilename));
        try {
          await fs.writeFile(chapterAudioPathAbsolute, Buffer.concat(audioBuffers));
        } catch (error) {
          const warning = `第${chapterNumber}章音频写入失败：${error instanceof Error ? error.message : String(error)}`;
          chapterWarnings.push(warning);
          warnings.push(warning);
        }
      } else {
        const textSegments = parseChapterText(chapter.content, charRefs);
        for (let index = 0; index < textSegments.length; index += 1) {
          const seg = textSegments[index];
          const durationMs = estimateScriptDurationMs(seg.text, seg.type);
          const startMs = cursorMs;
          const endMs = startMs + durationMs;
          cursorMs = endMs;
          segments.push({
            index,
            type: seg.type,
            speaker: seg.type === 'dialogue' ? (seg.speaker || fallbackSpeakers[0]) : NARRATOR,
            voice: seg.type === 'dialogue' ? 'script-only-dialogue' : 'script-only-narration',
            paragraphIndex: seg.paragraphIndex,
            text: seg.text,
            durationMs,
            startMs,
            endMs,
          });
        }
        if (segments.length === 0) {
          const fallbackDurationMs = 2000;
          segments.push({
            index: 0,
            type: 'narration',
            voice: 'script-only-narration',
            paragraphIndex: 0,
            text: buildFallbackText(chapter.content),
            durationMs: fallbackDurationMs,
            startMs: 0,
            endMs: fallbackDurationMs,
          });
          cursorMs = fallbackDurationMs;
        }
      }

      totalDurationMs += cursorMs;
      if (chapterAudioPathRelative) chapterAudioPaths.push(chapterAudioPathRelative);
      chapters.push({
        chapterNumber,
        chapterTitle: chapter.title || `第${chapterNumber}章`,
        wordCount: chapter.wordCount,
        audioPath: chapterAudioPathRelative || '(script-only)',
        totalDurationMs: cursorMs,
        segments,
        warnings: chapterWarnings,
      });
    }

    if (chapters.length === 0) {
      throw new Error('音频改编失败：没有可用章节输出。');
    }

    const generatedAt = now();
    const mixGuidePathRelative = toPosix(path.join(params.outputDirRelative, 'audio_mix_guide.md'));
    const dramaScriptPathRelative = toPosix(path.join(params.outputDirRelative, 'audio_drama_script.md'));
    const dramaConfig = normalizeAudioDramaConfig(params);

    const effectiveGenre = params.genreOverride ?? novelGenre;
    if (params.genreOverride && params.genreOverride !== novelGenre) {
      warnings.push(`已启用题材覆盖：${novelGenre ?? 'unknown'} -> ${params.genreOverride}`);
    }

    const promptPack = buildAudioDramaPromptPack({
      genre: effectiveGenre,
      rewriteLevel: dramaConfig.rewriteLevel,
      dialogueIntensity: dramaConfig.dialogueIntensity,
    });
    const dramaContext: AudioDramaBuildContext = {
      novelTitle,
      promptProfile: promptPack.profile,
      promptLines: promptPack.lines,
    };
    const dramaChapters = await buildAudioDramaChapters(
      chapters,
      charRefs,
      dramaConfig,
      dramaContext,
      effectiveModelClient,
      this.logger,
    );

    const scriptPayload: AudioScriptPayload = {
      novelId: params.novelId,
      mode: 'audio',
      chapterNumberStart: params.chapterNumberStart,
      chapterNumberEnd: params.chapterNumberEnd,
      generatedAt,
      mixGuidePath: mixGuidePathRelative,
      dramaScriptPath: dramaScriptPathRelative,
      dramaConfig,
      synthesisMode,
      dramaPromptProfile: promptPack.profile,
      dramaSourceSummary: summarizeDramaSources(dramaChapters),
      compliance: buildDefaultComplianceMetadata({
        novelId: params.novelId,
        mode: 'audio',
        generatedAt,
      }),
      totalDurationMs,
      chapters,
      dramaChapters,
      warnings,
    };

    const payloadPathRelative = toPosix(path.join(params.outputDirRelative, 'audio_script.json'));
    await fs.writeFile(path.join(outputDirAbsolute, 'audio_script.json'), JSON.stringify(scriptPayload, null, 2), 'utf-8');
    await fs.writeFile(path.join(outputDirAbsolute, 'audio_mix_guide.md'), buildMixGuide(scriptPayload), 'utf-8');
    await fs.writeFile(path.join(outputDirAbsolute, 'audio_drama_script.md'), buildDramaGuide(scriptPayload), 'utf-8');

    this.logger.info('audio adaptation generated', {
      novelId: params.novelId,
      chapterCount: chapters.length,
      synthesisMode,
      payloadPath: payloadPathRelative,
      mixGuidePath: mixGuidePathRelative,
      dramaScriptPath: dramaScriptPathRelative,
    });

    return {
      payloadPath: payloadPathRelative,
      mixGuidePath: mixGuidePathRelative,
      dramaScriptPath: dramaScriptPathRelative,
      chapterAudioPaths,
      totalDurationMs,
      chapterCount: chapters.length,
      synthesisMode,
      warnings,
    };
  }
}

function buildMixGuide(payload: AudioScriptPayload): string {
  const lines: string[] = [];
  lines.push('# Audio Mix Guide');
  lines.push('');
  lines.push(`- Novel: ${payload.novelId}`);
  lines.push(`- Chapter Range: ${payload.chapterNumberStart}-${payload.chapterNumberEnd}`);
  lines.push(`- Synthesis Mode: ${payload.synthesisMode}`);
  lines.push(`- Total Duration: ${formatDuration(payload.totalDurationMs)}`);
  lines.push(`- Generated At: ${payload.generatedAt}`);
  lines.push('');

  for (const chapter of payload.chapters) {
    lines.push(`## 第${chapter.chapterNumber}章 ${chapter.chapterTitle}`);
    lines.push(`- Audio: ${chapter.audioPath}`);
    lines.push(`- Word Count: ${chapter.wordCount}`);
    lines.push(`- Duration: ${formatDuration(chapter.totalDurationMs)}`);
    lines.push('');
    lines.push('| Start | End | Type | Speaker | Voice | Text |');
    lines.push('|---|---|---|---|---|---|');
    for (const seg of chapter.segments) {
      lines.push(
        `| ${formatDuration(seg.startMs)} | ${formatDuration(seg.endMs)} | ${seg.type} | ${seg.speaker ?? '-'} | ${seg.voice} | ${escapePipe(seg.text)} |`,
      );
    }
    lines.push('');
    if (chapter.warnings.length > 0) {
      lines.push('Warnings:');
      for (const warning of chapter.warnings) {
        lines.push(`- ${warning}`);
      }
      lines.push('');
    }
  }

  if (payload.warnings.length > 0) {
    lines.push('## Global Warnings');
    for (const warning of payload.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function buildDramaGuide(payload: AudioScriptPayload): string {
  const lines: string[] = [];
  lines.push('# Audio Drama Script');
  lines.push('');
  lines.push(`- Novel: ${payload.novelId}`);
  lines.push(`- Chapter Range: ${payload.chapterNumberStart}-${payload.chapterNumberEnd}`);
  lines.push(`- Synthesis Mode: ${payload.synthesisMode}`);
  lines.push(`- Dialogue Intensity: ${payload.dramaConfig.dialogueIntensity}`);
  lines.push(`- Rewrite Level: ${payload.dramaConfig.rewriteLevel}`);
  lines.push(`- Genre Profile: ${payload.dramaPromptProfile.genreLabel} (${payload.dramaPromptProfile.styleTag})`);
  lines.push(`- Prompt Version: ${payload.dramaPromptProfile.promptVersion}`);
  lines.push(`- Narration Max Ratio: ${payload.dramaConfig.narrationMaxRatio.toFixed(2)}`);
  lines.push(`- Rewrite Source Summary: LLM ${payload.dramaSourceSummary.llm}, Rule ${payload.dramaSourceSummary.rule}, LLM Fallback ${payload.dramaSourceSummary.llmFallback}`);
  lines.push(`- Generated At: ${payload.generatedAt}`);
  lines.push('');

  for (const chapter of payload.dramaChapters) {
    lines.push(`## Chapter ${chapter.chapterNumber} - ${chapter.chapterTitle}`);
    lines.push(`- Dialogue Ratio: ${(chapter.dialogueRatio * 100).toFixed(1)}%`);
    lines.push(`- Narration Ratio: ${(chapter.narrationRatio * 100).toFixed(1)}%`);
    lines.push(`- Rewrite Source: ${chapter.rewriteSource}`);
    if (chapter.rewriteError) {
      lines.push(`- Rewrite Fallback Reason: ${chapter.rewriteError}`);
    }
    lines.push(`- Summary: ${chapter.summary}`);
    if (chapter.warnings.length > 0) {
      lines.push(`- Warnings: ${chapter.warnings.join('; ')}`);
    }
    lines.push('');
    for (const line of chapter.lines) {
      lines.push(`${line.speaker}: ${line.text}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function normalizeAudioDramaConfig(params: AudioAdapterParams): AudioDramaConfig {
  return {
    dialogueIntensity: params.dialogueIntensity ?? 'medium',
    rewriteLevel: params.rewriteLevel ?? 'balanced',
    narrationMaxRatio: clamp(params.narrationMaxRatio ?? 0.55, 0.2, 0.85),
  };
}

async function buildAudioDramaChapters(
  chapters: AudioScriptChapter[],
  charRefs: CharacterRef[],
  config: AudioDramaConfig,
  dramaContext: AudioDramaBuildContext,
  modelClient?: ModelClient,
  logger?: Logger,
): Promise<AudioDramaChapter[]> {
  const result: AudioDramaChapter[] = [];

  for (const chapter of chapters) {
    const warnings: string[] = [];
    const defaultSpeakers = inferDefaultSpeakers(chapter, charRefs);
    const sourceLines: AudioDramaLine[] = chapter.segments
      .map((seg) => ({
        speaker: seg.type === 'dialogue' ? (seg.speaker || defaultSpeakers[0]) : NARRATOR,
        text: seg.text.trim(),
        source: 'original' as const,
      }))
      .filter((line) => line.text.length > 0);

    let lines = enhanceDramaLines(sourceLines, defaultSpeakers, config);
    let rewriteSource: AudioDramaRewriteSource = 'rule';
    let rewriteError: string | undefined;

    if (modelClient) {
      try {
        const llmLines = await rewriteDramaLinesWithLLM({
          modelClient,
          chapter,
          sourceLines,
          defaultSpeakers,
          charRefs,
          config,
          dramaContext,
        });
        if (llmLines.length > 0) {
          lines = llmLines;
          rewriteSource = 'llm';
        }
      } catch (error) {
        rewriteSource = 'llm-fallback';
        rewriteError = error instanceof Error ? error.message : String(error);
        warnings.push(`LLM改写失败，已回退规则改写：${rewriteError}`);
        logger?.warn('audio drama llm rewrite fallback', {
          chapterNumber: chapter.chapterNumber,
          error: rewriteError,
        });
      }
    }

    const ratio = computeDialogueNarrationRatio(lines);
    result.push({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.chapterTitle,
      dialogueRatio: ratio.dialogueRatio,
      narrationRatio: ratio.narrationRatio,
      rewriteSource,
      ...(rewriteError ? { rewriteError } : {}),
      lines,
      summary: `共${lines.length}句，旁白占比 ${(ratio.narrationRatio * 100).toFixed(1)}%`,
      warnings,
    });
  }

  return result;
}

function inferDefaultSpeakers(chapter: AudioScriptChapter, charRefs: CharacterRef[]): [string, string] {
  const dialogueSpeakers = chapter.segments
    .filter((seg) => seg.type === 'dialogue')
    .map((seg) => seg.speaker?.trim())
    .filter((name): name is string => Boolean(name))
    .filter((name, index, arr) => arr.indexOf(name) === index);
  if (dialogueSpeakers.length >= 2) return [dialogueSpeakers[0], dialogueSpeakers[1]];
  return inferDefaultSpeakersForScript(charRefs);
}

function inferDefaultSpeakersForScript(charRefs: CharacterRef[]): [string, string] {
  const names = charRefs
    .map((item) => item.name?.trim())
    .filter((name): name is string => Boolean(name))
    .filter((name, index, arr) => arr.indexOf(name) === index);
  if (names.length >= 2) return [names[0], names[1]];
  if (names.length === 1) return [names[0], '角色B'];
  return ['角色A', '角色B'];
}

function enhanceDramaLines(
  sourceLines: AudioDramaLine[],
  speakers: [string, string],
  config: AudioDramaConfig,
): AudioDramaLine[] {
  const targetDialogueRatioMap: Record<AudioDramaDialogueIntensity, number> = {
    low: 0.45,
    medium: 0.6,
    high: 0.72,
  };
  let targetDialogueRatio = targetDialogueRatioMap[config.dialogueIntensity];
  if (config.rewriteLevel === 'conservative') targetDialogueRatio -= 0.05;
  if (config.rewriteLevel === 'dramatic') targetDialogueRatio += 0.05;
  targetDialogueRatio = clamp(targetDialogueRatio, 0.35, 0.8);

  const lines = [...sourceLines];
  const narrationIndexes = () =>
    lines
      .map((line, index) => ({ line, index }))
      .filter((item) => isNarrator(item.line.speaker) && item.line.text.length >= 14)
      .map((item) => item.index);

  let guard = 0;
  while (guard < 24) {
    guard += 1;
    const ratio = computeDialogueNarrationRatio(lines);
    if (ratio.dialogueRatio >= targetDialogueRatio && ratio.narrationRatio <= config.narrationMaxRatio) {
      break;
    }
    const index = narrationIndexes()[0];
    if (index === undefined) break;
    const current = lines[index];
    const key = extractKeyPhrase(current.text);
    const replacement = buildDialoguePack(key, speakers, config.rewriteLevel);
    lines.splice(index, 1, ...replacement);
  }

  return lines;
}

function buildDialoguePack(
  keyPhrase: string,
  speakers: [string, string],
  level: AudioDramaRewriteLevel,
): AudioDramaLine[] {
  const [speakerA, speakerB] = speakers;
  if (level === 'conservative') {
    return [
      { speaker: NARRATOR, text: `气氛骤然收紧：${truncateSentence(keyPhrase, 20)}`, source: 'adapted' },
      { speaker: speakerA, text: `${truncateSentence(keyPhrase, 18)}，你先回应。`, source: 'adapted' },
      { speaker: speakerB, text: '我先稳住局面，按计划推进。', source: 'adapted' },
    ];
  }
  if (level === 'dramatic') {
    return [
      { speaker: speakerA, text: `${truncateSentence(keyPhrase, 18)}！情况已经失控了。`, source: 'adapted' },
      { speaker: speakerB, text: '别退，立刻执行目标，我掩护你。', source: 'adapted' },
      { speaker: speakerA, text: '明白，动作要快，不能再拖。', source: 'adapted' },
    ];
  }
  return [
    { speaker: NARRATOR, text: `局势进入关键节点：${truncateSentence(keyPhrase, 20)}`, source: 'adapted' },
    { speaker: speakerA, text: `${truncateSentence(keyPhrase, 18)}，我们先确认细节。`, source: 'adapted' },
    { speaker: speakerB, text: '同意，我处理风险点，你继续推进。', source: 'adapted' },
  ];
}

function extractKeyPhrase(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '局势出现变化';
  const hit = normalized.split(/[，。！？；]/).find((part) => part.trim().length >= 6);
  return truncateSentence((hit ?? normalized).trim(), 22);
}

function truncateSentence(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function computeDialogueNarrationRatio(lines: AudioDramaLine[]): {
  dialogueRatio: number;
  narrationRatio: number;
} {
  let dialogueChars = 0;
  let narrationChars = 0;
  for (const line of lines) {
    const len = Math.max(1, line.text.trim().length);
    if (isNarrator(line.speaker)) narrationChars += len;
    else dialogueChars += len;
  }
  const total = Math.max(1, dialogueChars + narrationChars);
  return {
    dialogueRatio: dialogueChars / total,
    narrationRatio: narrationChars / total,
  };
}

function summarizeDramaSources(chapters: AudioDramaChapter[]): {
  llm: number;
  rule: number;
  llmFallback: number;
} {
  let llm = 0;
  let rule = 0;
  let llmFallback = 0;
  for (const chapter of chapters) {
    if (chapter.rewriteSource === 'llm') llm += 1;
    else if (chapter.rewriteSource === 'llm-fallback') llmFallback += 1;
    else rule += 1;
  }
  return { llm, rule, llmFallback };
}

async function rewriteDramaLinesWithLLM(params: {
  modelClient: ModelClient;
  chapter: AudioScriptChapter;
  sourceLines: AudioDramaLine[];
  defaultSpeakers: [string, string];
  charRefs: CharacterRef[];
  config: AudioDramaConfig;
  dramaContext: AudioDramaBuildContext;
}): Promise<AudioDramaLine[]> {
  const targetDialogueRatioMap: Record<AudioDramaDialogueIntensity, number> = {
    low: 0.45,
    medium: 0.6,
    high: 0.72,
  };
  let targetDialogueRatio = targetDialogueRatioMap[params.config.dialogueIntensity];
  if (params.config.rewriteLevel === 'conservative') targetDialogueRatio -= 0.05;
  if (params.config.rewriteLevel === 'dramatic') targetDialogueRatio += 0.05;
  targetDialogueRatio = clamp(targetDialogueRatio, 0.35, 0.8);

  const sourceScript = params.sourceLines
    .slice(0, 96)
    .map((line, index) => `${index + 1}. ${line.speaker}: ${line.text}`)
    .join('\n');
  const allowedSpeakers = Array.from(new Set([...params.defaultSpeakers, NARRATOR]));
  const characterSpeechHints = buildCharacterSpeechHints(params.charRefs, allowedSpeakers);

  const systemPrompt =
    '你是有声剧编剧改写助手。只输出严格 JSON，不要输出 Markdown、解释、前后缀。';
  const userPrompt = [
    `小说：${params.dramaContext.novelTitle}`,
    `题材：${params.dramaContext.promptProfile.genreLabel} (${params.dramaContext.promptProfile.styleTag})`,
    `章节：第${params.chapter.chapterNumber}章 ${params.chapter.chapterTitle}`,
    `对白目标占比：${targetDialogueRatio.toFixed(2)}，旁白上限：${params.config.narrationMaxRatio.toFixed(2)}`,
    `改写等级：${params.config.rewriteLevel}`,
    `允许角色：${allowedSpeakers.join('、')}`,
    '硬性要求：',
    '- 保留关键事件和顺序，不新增关键剧情转折。',
    '- 增加角色对白，可以把部分旁白改成对白。',
    '- 角色口吻保持一致，禁止出现未授权角色名。',
    '- 输出 JSON 结构：{"lines":[{"speaker":"角色或旁白","text":"台词","source":"original|adapted"}]}。',
    '- lines 至少 6 条，每条 text 不能为空。',
    '- 只能输出 JSON。',
    '题材风格补充：',
    ...params.dramaContext.promptLines.map((line) => `- ${line}`),
    ...(characterSpeechHints.length > 0 ? ['角色口吻约束：', ...characterSpeechHints.map((line) => `- ${line}`)] : []),
    '原始脚本：',
    sourceScript,
  ].join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const response = await params.modelClient.chat(messages, {
    temperature: 0.25,
    maxTokens: 2200,
  });

  const payload = parseJsonPayload(response.content);
  const rewritten = sanitizeDramaLines(payload, params.defaultSpeakers, allowedSpeakers);
  if (rewritten.length < 6) {
    throw new Error('LLM output too short');
  }

  const ratio = computeDialogueNarrationRatio(rewritten);
  if (ratio.narrationRatio > params.config.narrationMaxRatio + 0.15) {
    throw new Error('LLM narration ratio too high');
  }
  if (ratio.dialogueRatio < targetDialogueRatio - 0.25) {
    throw new Error('LLM dialogue ratio too low');
  }
  return rewritten;
}

function buildCharacterSpeechHints(charRefs: CharacterRef[], allowedSpeakers: string[]): string[] {
  const hints: string[] = [];
  for (const speaker of allowedSpeakers) {
    if (!speaker || isNarrator(speaker)) continue;
    const char = charRefs.find((item) => item.name === speaker || item.aliases.includes(speaker));
    if (!char) continue;

    const speechStyle = char.speechStyle?.trim();
    const personality = char.personality?.trim();
    if (speechStyle) {
      hints.push(`${speaker}语气：${truncateSentence(speechStyle.replace(/\s+/g, ' '), 50)}`);
    }
    if (personality) {
      hints.push(`${speaker}性格：${truncateSentence(personality.replace(/\s+/g, ' '), 50)}`);
    }
    if (hints.length >= 8) break;
  }
  return hints;
}

function sanitizeDramaLines(
  payload: unknown,
  defaultSpeakers: [string, string],
  allowedSpeakers: string[],
): AudioDramaLine[] {
  const list = Array.isArray(payload)
    ? payload
    : (payload as { lines?: unknown })?.lines;
  if (!Array.isArray(list)) {
    throw new Error('json.lines missing');
  }

  const allowedSpeakerSet = new Set(allowedSpeakers.filter(Boolean));
  const lines: AudioDramaLine[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const data = item as { speaker?: unknown; text?: unknown; source?: unknown };
    const text = typeof data.text === 'string'
      ? data.text.replace(/\s+/g, ' ').trim()
      : '';
    if (!text) continue;

    const rawSpeaker = typeof data.speaker === 'string' ? data.speaker.trim() : '';
    const speaker = normalizeSpeaker(rawSpeaker, allowedSpeakerSet, defaultSpeakers);
    const source = data.source === 'original' ? 'original' : 'adapted';

    lines.push({
      speaker,
      text: text.slice(0, 140),
      source,
    });
    if (lines.length >= 240) break;
  }
  return lines;
}

function normalizeSpeaker(
  rawSpeaker: string,
  allowedSpeakerSet: Set<string>,
  defaultSpeakers: [string, string],
): string {
  if (!rawSpeaker) return defaultSpeakers[0];
  if (isNarrator(rawSpeaker)) return NARRATOR;
  if (allowedSpeakerSet.has(rawSpeaker)) return rawSpeaker;

  const fuzzy = Array.from(allowedSpeakerSet).find((name) => name.includes(rawSpeaker) || rawSpeaker.includes(name));
  if (fuzzy) return fuzzy;
  return defaultSpeakers[0];
}

function isNarrator(name: string): boolean {
  const value = name.trim().toLowerCase();
  return value === NARRATOR || value === 'narrator';
}

function estimateScriptDurationMs(text: string, type: 'narration' | 'dialogue'): number {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 800;
  const base = type === 'dialogue' ? 210 : 180;
  const punctuationBonus = Math.min(1200, (normalized.match(/[，。！？；,.!?]/g)?.length ?? 0) * 90);
  return clamp(Math.round(normalized.length * base + punctuationBonus), 900, 12000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function escapePipe(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ');
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function buildSilenceMp3(durationMs: number): Buffer {
  const frames = Math.max(1, Math.round(durationMs / SILENCE_FRAME_DURATION_MS));
  return Buffer.concat(Array.from({ length: frames }, () => SILENCE_FRAME));
}

function buildFallbackText(content: string): string {
  const condensed = content.replace(/\s+/g, ' ').trim();
  if (!condensed) {
    return '本章原文为空，已生成占位脚本。';
  }
  if (condensed.length <= 120) return condensed;
  return `${condensed.slice(0, 117)}...`;
}
