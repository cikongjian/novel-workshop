import type { AgentOutput, AgentRole, AgentContext } from '../agents/types.js';
import type { ChapterGenerationResult } from './types.js';
import type { NovelMetadata, CharacterProfile, WorldEntry } from '../novel/types.js';
import type { AiTraceGateReport } from './ai-trace-gate.js';
import { collectChapterMetrics, saveChapterMetrics } from './quality-metrics.js';
import { extractChapterFacts } from '../novel/chapter-fact-extractor.js';
import { sanitizeAuthorNote } from '../utils/author-note-sanitizer.js';
import { cleanPublicFacingContent } from '../utils/public-facing-content.js';

export interface PostProcessorOptions {
  novelId: string;
  chapterNumber: number;
  novel: NovelMetadata;
  novelsDir: string;
  characters: CharacterProfile[];
  worldEntries: WorldEntry[];
  chapterContent: string;
  result: ChapterGenerationResult;
  aiTraceReport?: AiTraceGateReport;
  enableAuthorNote?: boolean;
  authorNoteStyle?: string;
  outline?: string;
  readerFeedback?: string;
  runAgent?: (role: AgentRole, ctx: AgentContext) => Promise<AgentOutput>;
  hasAuthorNoteAgent?: boolean;
}

export interface PostProcessingResult {
  authorNote?: string;
  finalContent: string;
  chapterFacts?: ReturnType<typeof extractChapterFacts>;
}

export class PostProcessor {
  private options: PostProcessorOptions;

  constructor(options: PostProcessorOptions) {
    this.options = options;
  }

  async run(): Promise<PostProcessingResult> {
    const {
      novelId,
      chapterNumber,
      novel,
      novelsDir,
      characters,
      worldEntries,
      chapterContent,
      result,
      aiTraceReport,
      enableAuthorNote,
      authorNoteStyle,
      outline,
      readerFeedback,
      runAgent,
      hasAuthorNoteAgent,
    } = this.options;

    let authorNoteContent: string | undefined;

    if (enableAuthorNote && runAgent && hasAuthorNoteAgent) {
      try {
        const authorNoteContext: AgentContext = {
          novelId,
          chapterNumber,
          genre: novel.genre,
          novelTitle: novel.title,
          novelSynopsis: novel.synopsis,
          inputText: chapterContent,
          outlineContext: outline,
          readerFeedback,
          stylePreset: authorNoteStyle,
        };
        const noteOutput = await runAgent('author-note-writer', authorNoteContext);
        authorNoteContent = sanitizeAuthorNote(noteOutput.content);
      } catch {
        // 作者有话说生成失败不阻塞
      }
    }

    const cleanedContent = cleanPublicFacingContent(chapterContent);

    try {
      const metrics = collectChapterMetrics(result, chapterNumber, aiTraceReport);
      saveChapterMetrics(novelId, metrics, novelsDir).catch(() => {});
    } catch {
      // 指标收集失败不阻塞
    }

    let chapterFacts: ReturnType<typeof extractChapterFacts> | undefined;
    try {
      chapterFacts = extractChapterFacts({
        chapterContent: cleanedContent,
        characters,
        worldEntries,
      });
    } catch {
      // 事实提取失败不阻塞
    }

    return {
      authorNote: authorNoteContent,
      finalContent: cleanedContent,
      chapterFacts,
    };
  }
}
