import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { TobPipelineRunner, TobPipelineRunContext } from './types.js';
import type { TobJobRunResult, TobGeneratePayload } from '../types.js';
import { VoiceDesignService } from '../services/voice-design-service.js';
import { AudioConcatenator } from '../services/audio-concatenator.js';
import { synthesizeChapterStream } from '../../tts/tts-service.js';
import type { StreamEvent } from '../../tts/tts-service.js';

const AUDIO_DRAMA_OUTPUT_DIR = 'audio-dramas';

interface AudioDramaPayload extends TobGeneratePayload {
  sourceNovelId: string;
  sourceChapterStart: number;
  sourceChapterEnd: number;
  outputFormat?: 'mp3' | 'm4a';
  includeChapterMarkers?: boolean;
  autoDesignVoices?: boolean;
}

function isAudioDramaPayload(payload: unknown): payload is AudioDramaPayload {
  const p = payload as Partial<AudioDramaPayload>;
  return Boolean(
    p.sourceNovelId &&
    typeof p.sourceChapterStart === 'number' &&
    typeof p.sourceChapterEnd === 'number'
  );
}

export const audioDramaRunner: TobPipelineRunner = {
  summary: {
    key: 'audio-drama',
    name: '有声剧生成',
    description: '将小说章节改编为多角色配音的有声剧，自动设计角色声音',
    supportsIntervention: false,
  },

  async runGenerate(context: TobPipelineRunContext): Promise<TobJobRunResult> {
    const { job, project, runtime, repository, logger, allowMockGeneration } = context;

    if (!isAudioDramaPayload(job.payload)) {
      throw new Error('Invalid audio drama payload');
    }

    const payload = job.payload;
    const outputFormat = payload.outputFormat ?? 'mp3';
    const includeChapterMarkers = payload.includeChapterMarkers ?? true;
    const autoDesignVoices = payload.autoDesignVoices ?? true;

    logger.info('Audio drama generation started', {
      jobId: job.id,
      projectId: project.id,
      sourceNovelId: payload.sourceNovelId,
      chapterRange: `${payload.sourceChapterStart}-${payload.sourceChapterEnd}`,
      outputFormat,
    });

    await repository.updateJobProgress(job.id, '正在初始化...');

    if (!runtime.modelClient) {
      if (allowMockGeneration) {
        return createMockResult(context, 'Model client unavailable');
      }
      throw new Error('Model client is required for audio drama generation');
    }

    await repository.updateJobProgress(job.id, '正在读取源小说信息...');

    const sourceNovel = await runtime.sourceNovelManager.getNovel(payload.sourceNovelId);
    if (!sourceNovel) {
      throw new Error(`Source novel not found: ${payload.sourceNovelId}`);
    }

    const chapterStart = payload.sourceChapterStart;
    const chapterEnd = payload.sourceChapterEnd;

    if (chapterStart < 1 || chapterEnd < chapterStart) {
      throw new Error(`Invalid chapter range: ${chapterStart}-${chapterEnd}`);
    }

    const characters = await runtime.sourceNovelManager.getCharacters(payload.sourceNovelId);

    if (autoDesignVoices && characters.length > 0) {
      logger.info('Checking character voice design status', { characterCount: characters.length });
      await repository.updateJobProgress(job.id, `正在检查角色声音设计状态（共${characters.length}个角色）...`);

      if (!runtime.modelClient || !runtime.voiceDesignerAgent) {
        logger.warn('Voice design skipped: model client or voice designer agent not available');
        await repository.updateJobProgress(job.id, '跳过声音设计（模型客户端或音效师 Agent 未配置）...');
      } else {
        const voiceDesignService = new VoiceDesignService();
        const qwen3TtsUrl = process.env.QWEN3_TTS_URL || 'http://127.0.0.1:8765';

        try {
          const result = await voiceDesignService.ensureCharacterVoicesDesigned({
            novelId: payload.sourceNovelId,
            novelTitle: sourceNovel.title,
            novelGenre: sourceNovel.genre,
            novelSynopsis: sourceNovel.synopsis,
            characters,
            modelClient: runtime.modelClient,
            voiceDesignerAgent: runtime.voiceDesignerAgent,
            novelManager: runtime.sourceNovelManager,
            qwen3TtsUrl,
            logger: logger.child('voice-design'),
            onProgress: async (current, total, characterName) => {
              logger.info('Voice design progress', { current, total, characterName });
              await repository.updateJobProgress(job.id, `正在为角色"${characterName}"设计声音（${current}/${total}）...`);
            },
          });

          logger.info('Voice design completed', {
            designed: result.designed.length,
            skipped: result.skipped.length,
            failed: result.failed.length,
          });

          if (result.failed.length > 0) {
            logger.warn('Some characters failed voice design', {
              failed: result.failed.map(f => ({ name: f.characterName, error: f.error })),
            });
          }
        } catch (error) {
          logger.error('Voice design failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          throw new Error(`Voice design failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    await repository.updateJobProgress(job.id, '正在准备音频输出目录...');

    const outputDir = path.join(runtime.novelsDir, '..', AUDIO_DRAMA_OUTPUT_DIR, project.id, job.id);
    await mkdir(outputDir, { recursive: true });

    const segmentsDir = path.join(outputDir, 'segments');
    await mkdir(segmentsDir, { recursive: true });

    const chapterAudioFiles: string[] = [];
    const chapterMetadata: Array<{ chapterNumber: number; title: string; duration: number; startTime: number }> = [];
    let totalDuration = 0;

    for (let chapterNumber = chapterStart; chapterNumber <= chapterEnd; chapterNumber++) {
      await repository.updateJobProgress(job.id, `正在合成第${chapterNumber}章音频（${chapterNumber - chapterStart + 1}/${chapterEnd - chapterStart + 1}）...`);
      logger.info('Synthesizing chapter', { chapterNumber });

      const chapter = await runtime.sourceNovelManager.getChapter(payload.sourceNovelId, chapterNumber);
      if (!chapter) {
        logger.warn('Chapter not found, skipping', { chapterNumber });
        continue;
      }

      const chapterAudioPath = path.join(segmentsDir, `chapter-${chapterNumber}.mp3`);
      const audioSegments: Buffer[] = [];
      let chapterDuration = 0;

      const streamEvents: StreamEvent[] = [];
      for await (const event of synthesizeChapterStream(
        chapter.content,
        characters.map(c => ({
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
        })),
        undefined,
        {
          narratorVoice: sourceNovel.edgeNarratorVoice,
          novelId: payload.sourceNovelId,
          chapterNumber,
        }
      )) {
        streamEvents.push(event);

        if (event.type === 'segment') {
          const audioBuffer = Buffer.from(event.audio, 'base64');
          audioSegments.push(audioBuffer);
          chapterDuration += event.duration;
        }
      }

      const chapterAudioBuffer = Buffer.concat(audioSegments);
      await writeFile(chapterAudioPath, chapterAudioBuffer);

      chapterAudioFiles.push(chapterAudioPath);
      chapterMetadata.push({
        chapterNumber,
        title: chapter.title || `第${chapterNumber}章`,
        duration: chapterDuration / 1000,
        startTime: totalDuration,
      });

      totalDuration += chapterDuration / 1000;

      logger.info('Chapter synthesis completed', {
        chapterNumber,
        duration: chapterDuration,
        segments: streamEvents.filter(e => e.type === 'segment').length,
      });
    }

    if (chapterAudioFiles.length === 0) {
      throw new Error('No chapters were synthesized');
    }

    await repository.updateJobProgress(job.id, `正在拼接音频文件（共${chapterAudioFiles.length}个章节）...`);
    logger.info('Concatenating audio files', { fileCount: chapterAudioFiles.length });

    const finalAudioPath = path.join(outputDir, `audio-drama.${outputFormat}`);
    const concatenator = new AudioConcatenator();

    const chapterMarkers = includeChapterMarkers
      ? chapterMetadata.map(m => ({ title: m.title, startTime: m.startTime }))
      : undefined;

    const concatResult = await concatenator.concatenateAudioFiles({
      inputFiles: chapterAudioFiles,
      outputFile: finalAudioPath,
      format: outputFormat,
      chapterMarkers,
      silenceBetweenChapters: 1000,
      onProgress: async (percent) => {
        logger.info('Concatenation progress', { percent });
        await repository.updateJobProgress(job.id, `正在拼接音频文件... ${Math.round(percent)}%`);
      },
      logger: logger.child('concatenator'),
    });

    await repository.updateJobProgress(job.id, '正在保存元数据...');
    const metadataPath = path.join(outputDir, 'metadata.json');
    await writeFile(metadataPath, JSON.stringify({
      projectId: project.id,
      jobId: job.id,
      sourceNovelId: payload.sourceNovelId,
      sourceNovelTitle: sourceNovel.title,
      chapterRange: { start: chapterStart, end: chapterEnd },
      chapters: chapterMetadata,
      totalDuration: concatResult.duration,
      fileSize: concatResult.fileSize,
      outputFormat,
      includeChapterMarkers,
      generatedAt: new Date().toISOString(),
    }, null, 2));

    logger.info('Audio drama generation completed', {
      totalDuration: concatResult.duration,
      fileSize: concatResult.fileSize,
      chapters: chapterMetadata.length,
    });

    const markdown = buildResultMarkdown({
      projectName: project.name,
      sourceNovelTitle: sourceNovel.title,
      chapterRange: { start: chapterStart, end: chapterEnd },
      chapters: chapterMetadata,
      totalDuration: concatResult.duration,
      fileSize: concatResult.fileSize,
      outputFormat,
      outputPath: finalAudioPath,
    });

    return {
      markdown,
      model: 'audio-drama-pipeline',
      usage: { inputTokens: 0, outputTokens: 0 },
      pipeline: {
        pipelineKey: 'audio-drama',
        novelId: payload.sourceNovelId,
        chapterNumber: chapterStart,
        mode: 'chapter-pipeline',
      },
    };
  },
};

function createMockResult(context: TobPipelineRunContext, reason: string): TobJobRunResult {
  const { job, project } = context;
  const markdown = [
    `# ${project.name} - Audio Drama (MOCK)`,
    '',
    `- Job ID: ${job.id}`,
    '- Mode: MOCK',
    `- Reason: ${reason}`,
    '',
    '## Brief',
    project.brief || 'N/A',
    '',
    '## Generated Content',
    'This is a local mock output to validate audio drama workflow.',
  ].join('\n');

  context.logger.warn('Audio drama runner fallback to mock', { jobId: job.id, projectId: project.id, reason });
  return {
    markdown,
    model: 'mock-local',
    usage: { inputTokens: 0, outputTokens: 0 },
    pipeline: {
      pipelineKey: 'audio-drama',
      novelId: 'mock',
      chapterNumber: 0,
      mode: 'mock',
    },
  };
}

function buildResultMarkdown(params: {
  projectName: string;
  sourceNovelTitle: string;
  chapterRange: { start: number; end: number };
  chapters: Array<{ chapterNumber: number; title: string; duration: number }>;
  totalDuration: number;
  fileSize: number;
  outputFormat: string;
  outputPath: string;
}): string {
  const { projectName, sourceNovelTitle, chapterRange, chapters, totalDuration, fileSize, outputFormat, outputPath } = params;

  const lines = [
    `# ${projectName} - 有声剧生成完成`,
    '',
    `## 基本信息`,
    `- 源小说: ${sourceNovelTitle}`,
    `- 章节范围: 第${chapterRange.start}-${chapterRange.end}章`,
    `- 章节数: ${chapters.length}`,
    `- 总时长: ${formatDuration(totalDuration)}`,
    `- 文件大小: ${formatFileSize(fileSize)}`,
    `- 输出格式: ${outputFormat.toUpperCase()}`,
    '',
    `## 章节列表`,
    '',
  ];

  for (const chapter of chapters) {
    lines.push(`- 第${chapter.chapterNumber}章: ${chapter.title} (${formatDuration(chapter.duration)})`);
  }

  lines.push('');
  lines.push(`## 输出文件`);
  lines.push('');
  lines.push(`\`${outputPath}\``);
  lines.push('');
  lines.push(`使用"下载有声剧"按钮下载完整音频文件。`);

  return lines.join('\n');
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}小时${minutes}分${secs}秒`;
  }
  if (minutes > 0) {
    return `${minutes}分${secs}秒`;
  }
  return `${secs}秒`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
