import type { ModelClient, StreamCallback } from '../models/types.js';
import type { NovelAgent, AgentRole, AgentContext, AgentOutput, AgentEvent } from '../agents/types.js';
import type { EventEmitter, PipelineNovelManager, PipelineMemory } from './types.js';
import { ChapterPipeline } from './chapter-pipeline.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('batch-revision');

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PlotLineSkeleton = {
  mainPlotPoints: Array<{
    chapter: number;
    event: string;
    mustKeep: boolean;
    reason: string;
  }>;
  characterArcs: Array<{
    name: string;
    startState: string;
    endState: string;
    keyTransitions: string[];
  }>;
  unresolvedThreads: Array<{
    thread: string;
    plantedInChapter: number;
    status: string;
    dependentChapters: number[];
  }>;
  worldRules: Array<{
    rule: string;
    establishedInChapter: number;
    mustRespect: boolean;
  }>;
  qualityIssues: Array<{
    chapter: number;
    severity: string;
    issue: string;
    suggestedFix: string;
  }>;
};

export type BatchRevisionResult = {
  skeleton: PlotLineSkeleton;
  revisedChapters: Array<{
    chapterNumber: number;
    originalWordCount: number;
    revisedWordCount: number;
    revisedContent: string;
    editorNotes: string;
    readerFeedback: string;
    agentOutputs: AgentOutput[];
  }>;
};

/* ------------------------------------------------------------------ */
/*  Pipeline                                                           */
/* ------------------------------------------------------------------ */

const PREV_CHAPTER_TAIL_CHARS = 3000;

export class BatchRevisionPipeline {
  constructor(
    private agents: Map<AgentRole, NovelAgent>,
    _memory: PipelineMemory,
    private novelManager: PipelineNovelManager,
    private model: ModelClient,
  ) {}

  /* ---- public entry ---- */

  async batchRevise(params: {
    novelId: string;
    fromChapter: number;
    toChapter: number;
    userDirection?: string;
    onEvent?: EventEmitter;
  }): Promise<BatchRevisionResult> {
    const { novelId, fromChapter, toChapter, userDirection, onEvent } = params;

    // 1. Load novel metadata
    const novel = await this.novelManager.getNovel(novelId);
    const characters = await this.novelManager.getCharacters(novelId);
    const worldEntries = await this.novelManager.getWorldEntries(novelId);
    const outline = await this.novelManager.getOutline(novelId);

    // 2. Load all chapters in range (parallel batches of 20)
    const chapters: Array<{ num: number; content: string; summary: string }> = [];
    const chapterNums = Array.from({ length: toChapter - fromChapter + 1 }, (_, i) => fromChapter + i);
    const BATCH_SIZE = 20;
    for (let i = 0; i < chapterNums.length; i += BATCH_SIZE) {
      const batch = chapterNums.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(n => this.novelManager.getChapter(novelId, n)));
      for (let j = 0; j < results.length; j++) {
        const ch = results[j];
        if (ch) chapters.push({ num: batch[j], content: ch.content, summary: ch.summary || '' });
      }
    }

    if (chapters.length === 0) {
      throw new Error(`No chapters found in range ${fromChapter}-${toChapter}`);
    }

    // 3. Load chapter before range (for continuity)
    let preRangeContent = '';
    if (fromChapter > 1) {
      const preCh = await this.novelManager.getChapter(novelId, fromChapter - 1);
      if (preCh) {
        preRangeContent = preCh.content.slice(-PREV_CHAPTER_TAIL_CHARS);
      }
    }

    // Build shared context strings
    const characterContext = this.buildCharacterContext(characters);
    const worldContext = this.buildWorldContext(worldEntries);
    const outlineContext = this.buildOutlineContext(outline, fromChapter, toChapter);

    // 4. Extract plot line skeleton
    log.info(`Extracting plot line for Ch${fromChapter}-${toChapter}...`);
    const skeleton = await this.extractPlotLine({
      novel, chapters, characterContext, worldContext, outlineContext, userDirection, onEvent,
    });
    log.info(`Plot line extracted: ${skeleton.mainPlotPoints.length} plot points, ${skeleton.qualityIssues.length} issues`);

    // 5. Sequentially revise each chapter
    const revisedChapters: BatchRevisionResult['revisedChapters'] = [];
    let previousRevisedContent = preRangeContent;
    const skeletonJson = JSON.stringify(skeleton, null, 2);

    for (const chapter of chapters) {
      log.info(`Revising Ch${chapter.num}...`);

      // Find quality issues for this chapter
      const chapterIssues = skeleton.qualityIssues
        .filter(q => q.chapter === chapter.num)
        .map(q => `- [${q.severity}] ${q.issue}\n  建议：${q.suggestedFix}`)
        .join('\n');

      // Build revision direction for this chapter
      const revisionDirection = this.buildRevisionDirection(
        chapter.num, skeleton, chapterIssues, userDirection,
      );

      // Find this chapter's outline
      const chapterOutline = outline?.chapters?.find(
        (o: { chapterNumber: number }) => o.chapterNumber === chapter.num,
      );
      const chapterOutlineText = chapterOutline
        ? `标题：${chapterOutline.title}\n摘要：${chapterOutline.summary}\n关键事件：${chapterOutline.keyEvents?.join('、') ?? '无'}`
        : '';

      // Revise with batch-reviser → editor → reader
      const revised = await this.reviseOneChapter({
        novelId,
        novel,
        chapterNumber: chapter.num,
        originalContent: chapter.content,
        previousRevisedContent,
        skeletonJson,
        characterContext,
        chapterOutlineText,
        revisionDirection,
        onEvent,
      });

      revisedChapters.push({
        chapterNumber: chapter.num,
        originalWordCount: chapter.content.length,
        revisedWordCount: revised.content.length,
        revisedContent: revised.content,
        editorNotes: revised.editorNotes,
        readerFeedback: revised.readerFeedback,
        agentOutputs: revised.agentOutputs,
      });

      // Use revised content as context for next chapter
      previousRevisedContent = revised.content.slice(-PREV_CHAPTER_TAIL_CHARS);

      onEvent?.({
        type: 'pipeline:complete' as AgentEvent['type'],
        agentRole: 'batch-reviser' as AgentRole,
        novelId,
        chapterNumber: chapter.num,
        data: JSON.stringify({
          chapterNumber: chapter.num,
          originalWordCount: chapter.content.length,
          revisedWordCount: revised.content.length,
        }),
        timestamp: new Date().toISOString(),
      });
    }

    return { skeleton, revisedChapters };
  }

  /* ---- single chapter revision ---- */

  private async reviseOneChapter(params: {
    novelId: string;
    novel: { title: string; genre: string; synopsis: string };
    chapterNumber: number;
    originalContent: string;
    previousRevisedContent: string;
    skeletonJson: string;
    characterContext: string;
    chapterOutlineText: string;
    revisionDirection: string;
    onEvent?: EventEmitter;
  }): Promise<{ content: string; editorNotes: string; readerFeedback: string; agentOutputs: AgentOutput[] }> {
    const {
      novelId, novel, chapterNumber, originalContent,
      previousRevisedContent, skeletonJson, characterContext,
      chapterOutlineText, revisionDirection, onEvent,
    } = params;

    const emitAgent = (type: AgentEvent['type'], role: AgentRole, data: string) => {
      onEvent?.({ type, agentRole: role, novelId, chapterNumber, data, timestamp: new Date().toISOString() });
    };
    const agentOutputs: AgentOutput[] = [];

    // --- batch-reviser ---
    const reviser = this.agents.get('batch-reviser' as AgentRole);
    if (!reviser) throw new Error('Agent "batch-reviser" not registered');

    emitAgent('agent:start', 'batch-reviser' as AgentRole, '');

    const reviserCtx: AgentContext = {
      novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      chapterNumber,
      characterContext,
      worldContext: skeletonJson,
      outlineContext: chapterOutlineText,
      inputText: originalContent,
      previousChapterSummary: previousRevisedContent,
      userDirection: revisionDirection,
    };

    const reviserCb: StreamCallback | undefined = onEvent
      ? (chunk) => emitAgent('agent:chunk', 'batch-reviser' as AgentRole, chunk)
      : undefined;

    const reviserOutput = await reviser.execute(reviserCtx, this.model, reviserCb);
    emitAgent('agent:complete', 'batch-reviser' as AgentRole, reviserOutput.content);
    agentOutputs.push(reviserOutput);

    // --- editor ---
    const editor = this.agents.get('editor');
    if (!editor) throw new Error('Agent "editor" not registered');

    emitAgent('agent:start', 'editor', '');

    const editorCtx: AgentContext = {
      novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      chapterNumber,
      inputText: reviserOutput.content,
      characterContext,
    };

    const editorCb: StreamCallback | undefined = onEvent
      ? (chunk) => emitAgent('agent:chunk', 'editor', chunk)
      : undefined;

    const editorOutput = await editor.execute(editorCtx, this.model, editorCb);
    emitAgent('agent:complete', 'editor', editorOutput.content);
    agentOutputs.push(editorOutput);

    const { polishedText } = ChapterPipeline.parseEditorOutput(editorOutput.content);

    // --- reader ---
    const reader = this.agents.get('reader');
    if (!reader) throw new Error('Agent "reader" not registered');

    emitAgent('agent:start', 'reader', '');

    const readerCtx: AgentContext = {
      novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      chapterNumber,
      inputText: polishedText,
    };

    const readerCb: StreamCallback | undefined = onEvent
      ? (chunk) => emitAgent('agent:chunk', 'reader', chunk)
      : undefined;

    const readerOutput = await reader.execute(readerCtx, this.model, readerCb);
    emitAgent('agent:complete', 'reader', readerOutput.content);
    agentOutputs.push(readerOutput);

    return {
      content: polishedText,
      editorNotes: editorOutput.content,
      readerFeedback: readerOutput.content,
      agentOutputs,
    };
  }

  /* ---- plot line extraction ---- */

  private async extractPlotLine(params: {
    novel: { title: string; genre: string; synopsis: string };
    chapters: Array<{ num: number; content: string; summary: string }>;
    characterContext: string;
    worldContext: string;
    outlineContext: string;
    userDirection?: string;
    onEvent?: EventEmitter;
  }): Promise<PlotLineSkeleton> {
    const { novel, chapters, characterContext, worldContext, outlineContext, userDirection, onEvent } = params;

    const agent = this.agents.get('plot-line-extractor' as AgentRole);
    if (!agent) throw new Error('Agent "plot-line-extractor" not registered');

    // Use summaries for plot extraction to stay within LLM context limits;
    // fall back to truncated content when summary is missing
    const CONTENT_TRUNCATE = 800;
    const chaptersText = chapters
      .map(c => {
        const body = c.summary || c.content.slice(0, CONTENT_TRUNCATE) + (c.content.length > CONTENT_TRUNCATE ? '…' : '');
        return `### 第${c.num}章\n\n${body}`;
      })
      .join('\n\n---\n\n');

    const context: AgentContext = {
      novelId: '',
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      characterContext,
      worldContext,
      outlineContext,
      inputText: chaptersText,
      userDirection,
    };

    const streamCb: StreamCallback | undefined = onEvent
      ? (chunk) => onEvent({
          type: 'agent:chunk',
          agentRole: 'plot-line-extractor' as AgentRole,
          novelId: '',
          data: chunk,
          timestamp: new Date().toISOString(),
        })
      : undefined;

    onEvent?.({
      type: 'agent:start',
      agentRole: 'plot-line-extractor' as AgentRole,
      novelId: '',
      data: '',
      timestamp: new Date().toISOString(),
    });

    const output = await agent.execute(context, this.model, streamCb);

    onEvent?.({
      type: 'agent:complete',
      agentRole: 'plot-line-extractor' as AgentRole,
      novelId: '',
      data: output.content,
      timestamp: new Date().toISOString(),
    });

    return this.parseSkeleton(output.content);
  }

  private parseSkeleton(raw: string): PlotLineSkeleton {
    // Extract JSON from possible markdown code block
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      log.warn('Failed to parse skeleton JSON, using empty skeleton');
      return { mainPlotPoints: [], characterArcs: [], unresolvedThreads: [], worldRules: [], qualityIssues: [] };
    }
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      log.warn('Invalid skeleton JSON, using empty skeleton');
      return { mainPlotPoints: [], characterArcs: [], unresolvedThreads: [], worldRules: [], qualityIssues: [] };
    }
  }

  // __CONTINUE_HERE_2__

  /* ---- revision direction builder ---- */

  private buildRevisionDirection(
    chapterNumber: number,
    skeleton: PlotLineSkeleton,
    chapterIssues: string,
    userDirection?: string,
  ): string {
    const parts: string[] = [];

    // Must-keep events for this chapter
    const mustKeep = skeleton.mainPlotPoints
      .filter(p => p.chapter === chapterNumber && p.mustKeep)
      .map(p => `- ${p.event}（原因：${p.reason}）`);
    if (mustKeep.length > 0) {
      parts.push(`## 本章必须保留的事件`);
      parts.push(mustKeep.join('\n'));
      parts.push('');
    }

    // Foreshadowing that must be planted in this chapter
    const foreshadowing = skeleton.unresolvedThreads
      .filter(t => t.plantedInChapter === chapterNumber);
    if (foreshadowing.length > 0) {
      parts.push(`## 本章必须埋设的伏笔`);
      parts.push(foreshadowing.map(t => `- ${t.thread}`).join('\n'));
      parts.push('');
    }

    // Quality issues to fix
    if (chapterIssues) {
      parts.push(`## 本章需要修复的问题`);
      parts.push(chapterIssues);
      parts.push('');
    }

    // User direction
    if (userDirection) {
      parts.push(`## 用户额外要求`);
      parts.push(userDirection);
      parts.push('');
    }

    return parts.join('\n') || '请在保持主线不变的前提下，提升本章的叙事质量。';
  }

  /* ---- context builders ---- */

  private buildCharacterContext(characters: Array<{ name: string; role: string; personality: string; speechStyle: string; currentState: string; status?: string }>): string {
    return characters
      .filter(c => c.status !== 'dead' && c.status !== 'exited')
      .map(c => `【${c.name}】（${c.role}）性格：${c.personality}；说话风格：${c.speechStyle}；当前状态：${c.currentState}`)
      .join('\n');
  }

  private buildWorldContext(entries: Array<{ category: string; name: string; description: string }>): string {
    const grouped = new Map<string, string[]>();
    for (const e of entries) {
      const list = grouped.get(e.category) ?? [];
      list.push(`- ${e.name}：${e.description}`);
      grouped.set(e.category, list);
    }
    return [...grouped.entries()]
      .map(([cat, items]) => `### ${cat}\n${items.join('\n')}`)
      .join('\n\n');
  }

  private buildOutlineContext(
    outline: { chapters?: Array<{ chapterNumber: number; title: string; summary: string; keyEvents?: string[] }> } | null,
    from: number,
    to: number,
  ): string {
    if (!outline?.chapters) return '';
    return outline.chapters
      .filter(c => c.chapterNumber >= from && c.chapterNumber <= to)
      .map(c => `第${c.chapterNumber}章「${c.title}」：${c.summary}`)
      .join('\n');
  }
}
