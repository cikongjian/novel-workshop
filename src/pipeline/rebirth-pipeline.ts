import { randomUUID } from 'node:crypto';
import type { ModelClient, StreamCallback } from '../models/types.js';
import type { NovelAgent, AgentRole, AgentContext, AgentEvent } from '../agents/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { CharacterProfile, WorldEntry, OutlineData } from '../novel/types.js';
import { createLogger } from '../utils/logger.js';
import { parseJsonWithRepair } from '../utils/json-repair.js';

const log = createLogger('rebirth-pipeline');

/* ------------------------------------------------------------------ */
/*  Blueprint types (output of the extractor agent)                    */
/* ------------------------------------------------------------------ */

export type NovelBlueprint = {
  title: string;
  synopsis: string;
  worldEntries: Array<{
    category: string;
    name: string;
    description: string;
    storyRole?: string;
    tags?: string[];
  }>;
  characters: Array<{
    name: string;
    role: string;
    personality: string;
    personalityTraits?: string[];
    appearance?: string;
    backstory?: string;
    speechStyle?: string;
    motivation?: string;
    abilities?: string[];
    arc?: string;
    relationships?: Array<{ targetName: string; type: string; description: string }>;
  }>;
  outlineChapters: Array<{
    chapterNumber: number;
    title: string;
    summary: string;
    keyEvents?: string[];
    emotionalTone?: string;
    tensionLevel?: number;
  }>;
  plotThreads?: Array<{
    name: string;
    description: string;
    startChapter?: number;
    peakChapter?: number;
    resolveChapter?: number;
    status?: string;
  }>;
  qualityNotes?: string;
  rewriteDirection?: string;
};

export type RebirthResult = {
  blueprint: NovelBlueprint;
  newNovelId: string;
  totalChapters: number;
};

type EventEmitter = (event: AgentEvent) => void;

/* ------------------------------------------------------------------ */
/*  Pipeline                                                           */
/* ------------------------------------------------------------------ */

/** 章节摘要最大字数（避免上下文爆炸） */
const CHAPTER_SUMMARY_MAX_CHARS = 600;

export class RebirthPipeline {
  constructor(
    private agents: Map<AgentRole, NovelAgent>,
    private novelManager: NovelManager,
    private model: ModelClient,
  ) {}

  /**
   * Phase 1: 从旧小说提取蓝本
   * 不直接喂全文，而是用摘要 + 世界观 + 角色 + 大纲来提炼
   */
  async extractBlueprint(params: {
    novelId: string;
    userDirection?: string;
    onEvent?: EventEmitter;
  }): Promise<NovelBlueprint> {
    const { novelId, userDirection, onEvent } = params;

    const novel = await this.novelManager.getNovel(novelId);
    const characters = await this.novelManager.getCharacters(novelId);
    const worldEntries = await this.novelManager.getWorldEntries(novelId);
    const outline = await this.novelManager.getOutline(novelId);
    const chapterList = await this.novelManager.listChapters(novelId);

    // 构建章节摘要（避免全文塞入上下文）
    const chapterSummaryParts: string[] = [];
    for (const chMeta of chapterList.sort((a, b) => a.chapterNumber - b.chapterNumber)) {
      const ch = await this.novelManager.getChapter(novelId, chMeta.chapterNumber);
      if (!ch) continue;
      const digest = (ch as any).digest || '';
      const preview = ch.content.slice(0, CHAPTER_SUMMARY_MAX_CHARS);
      const summary = digest || preview;
      chapterSummaryParts.push(`### 第${ch.chapterNumber}章 ${ch.title || ''}\n${summary}`);
    }
    const chapterSummaries = chapterSummaryParts.join('\n\n');

    const characterContext = characters
      .map(c => `【${c.name}】（${c.role}）性格：${c.personality}；动机：${c.motivation}；弧线：${c.arc}`)
      .join('\n');

    const worldContext = worldEntries
      .map(e => `[${e.category}] ${e.name}：${e.description}`)
      .join('\n');

    const outlineContext = outline?.chapters
      ?.map((c: { chapterNumber: number; title: string; summary: string }) =>
        `第${c.chapterNumber}章「${c.title}」：${c.summary}`)
      .join('\n') ?? '';

    const agent = this.agents.get('novel-blueprint-extractor' as AgentRole);
    if (!agent) throw new Error('Agent "novel-blueprint-extractor" not registered');

    const context: AgentContext = {
      novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      characterContext,
      worldContext,
      outlineContext,
      inputText: chapterSummaries,
      userDirection,
    };

    onEvent?.({
      type: 'agent:start',
      agentRole: 'novel-blueprint-extractor' as AgentRole,
      novelId,
      data: '',
      timestamp: new Date().toISOString(),
    });

    const streamCb: StreamCallback | undefined = onEvent
      ? (chunk) => onEvent({
          type: 'agent:chunk',
          agentRole: 'novel-blueprint-extractor' as AgentRole,
          novelId,
          data: chunk,
          timestamp: new Date().toISOString(),
        })
      : undefined;

    const output = await agent.execute(context, this.model, streamCb);

    onEvent?.({
      type: 'agent:complete',
      agentRole: 'novel-blueprint-extractor' as AgentRole,
      novelId,
      data: output.content,
      timestamp: new Date().toISOString(),
    });

    return this.parseBlueprint(output.content);
  }

  /**
   * Phase 2: 根据蓝本创建新小说，写入世界观、角色、大纲
   * 返回新小说 ID，后续由 BatchQueue 驱动 ChapterPipeline 逐章生成
   */
  async createNovelFromBlueprint(params: {
    blueprint: NovelBlueprint;
    sourceNovelId: string;
    genre: string;
    onEvent?: EventEmitter;
  }): Promise<RebirthResult> {
    const { blueprint, sourceNovelId, genre, onEvent } = params;
    const now = new Date().toISOString();

    // 1. 创建新小说
    const newNovel = await this.novelManager.createNovel({
      title: blueprint.title,
      genre: genre as any,
      synopsis: blueprint.synopsis,
      description: `由「${sourceNovelId}」重生而来。\n${blueprint.rewriteDirection ?? ''}`,
    });
    const newId = newNovel.id;
    log.info(`Created rebirth novel: ${newId} (${blueprint.title})`);

    // 2. 写入世界观
    for (const entry of blueprint.worldEntries) {
      await this.novelManager.saveWorldEntry(newId, {
        id: randomUUID(),
        category: entry.category as any,
        name: entry.name,
        description: entry.description,
        storyRole: (entry.storyRole as any) ?? 'anchor',
        tags: entry.tags ?? [],
        dependencies: [],
        conflicts: [],
        relatedEntries: [],
        details: {},
        createdAt: now,
        updatedAt: now,
      } as WorldEntry);
    }
    log.info(`Wrote ${blueprint.worldEntries.length} world entries`);

    // 3. 写入角色（先全部创建，再回填 relationship targetId）
    const charIdByName = new Map<string, string>();
    const charDataList: Array<{ id: string; char: typeof blueprint.characters[number] }> = [];
    for (const char of blueprint.characters) {
      const id = randomUUID();
      charIdByName.set(char.name, id);
      charDataList.push({ id, char });
    }

    for (const { id, char } of charDataList) {
      const relationships = (char.relationships ?? []).map(r => ({
        targetId: charIdByName.get(r.targetName) ?? randomUUID(),
        type: r.type,
        description: r.description,
      }));

      await this.novelManager.saveCharacter(newId, {
        id,
        name: char.name,
        role: char.role as any,
        personality: char.personality,
        personalityTraits: char.personalityTraits ?? [],
        appearance: char.appearance ?? '',
        backstory: char.backstory ?? '',
        speechStyle: char.speechStyle ?? '',
        motivation: char.motivation ?? '',
        abilities: char.abilities ?? [],
        relationships,
        arc: char.arc ?? '',
        currentState: '初始状态',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      } as unknown as CharacterProfile);
    }
    log.info(`Wrote ${blueprint.characters.length} characters`);

    // 4. 写入大纲
    const statusMap: Record<string, string> = {
      active: 'developing',
      resolved: 'resolved',
      abandoned: 'abandoned',
    };
    const outlineData = {
      chapters: blueprint.outlineChapters.map(ch => ({
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        summary: ch.summary,
        keyEvents: ch.keyEvents ?? [],
        tensionTarget: ch.tensionLevel ?? 5,
      })),
      plotThreads: (blueprint.plotThreads ?? []).map(pt => ({
        id: randomUUID(),
        name: pt.name,
        description: pt.description,
        plantedInChapter: pt.startChapter ?? 1,
        resolvedInChapter: pt.resolveChapter,
        status: statusMap[pt.status ?? ''] ?? 'developing',
      })),
      foreshadowing: [],
    } as unknown as OutlineData;

    await this.novelManager.saveOutline(newId, outlineData);
    log.info(`Wrote outline with ${outlineData.chapters.length} chapters`);

    const totalChapters = blueprint.outlineChapters.length;

    onEvent?.({
      type: 'pipeline:complete' as AgentEvent['type'],
      agentRole: 'novel-blueprint-extractor' as AgentRole,
      novelId: newId,
      data: JSON.stringify({ newNovelId: newId, totalChapters }),
      timestamp: new Date().toISOString(),
    });

    return { blueprint, newNovelId: newId, totalChapters };
  }

  /* ---- blueprint parser ---- */

  private parseBlueprint(raw: string): NovelBlueprint {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      throw new Error('Failed to parse blueprint JSON from agent output');
    }
    try {
      return parseJsonWithRepair(jsonMatch[1]) as NovelBlueprint;
    } catch {
      throw new Error('Invalid blueprint JSON from agent output');
    }
  }
}
