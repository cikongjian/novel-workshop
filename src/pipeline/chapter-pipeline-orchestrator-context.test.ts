/**
 * loadOrchestratorMemoryContext 集成测试
 *
 * 验证编排器输出正确映射到 EnhancedMemoryContext 结构。
 */

import { describe, it, expect, vi } from 'vitest';
import { loadOrchestratorMemoryContext } from './chapter-pipeline-orchestrator-context.js';
import type { RawVectorSearch } from '../memory/orchestrator/index.js';
import type { PipelineNovelManager } from './types.js';
import type { TruthFileBundle } from '../memory/truth-files/index.js';

// ────────────────────────────── Mock 数据 ──────────────────────────────

function createMockRawSearch(): RawVectorSearch {
  return {
    search: vi.fn().mockImplementation(async (_novelId, _query, options) => {
      const category = options?.category ?? 'chapter';
      const results: Record<string, Array<{ text: string; score: number; category: string; entity_id: string; chapter_number: number }>> = {
        chapter: [
          { text: '上一章主角在山洞中发现了秘密通道。', score: 0.03, category: 'chapter', entity_id: 'ch-5', chapter_number: 5 },
        ],
        digest: [
          { text: '第四章摘要：主角进入禁区。', score: 0.025, category: 'digest', entity_id: 'digest-4', chapter_number: 4 },
        ],
        arc: [
          { text: '第1-5章弧线：探索禁地阶段。', score: 0.02, category: 'arc', entity_id: 'arc-1', chapter_number: 5 },
        ],
        fact: [
          { text: '主角获得了破界之眼（第3章确认）。', score: 0.028, category: 'fact', entity_id: 'fact-3', chapter_number: 3 },
        ],
        thread: [
          { text: '禁区真相线：尚未解开。', score: 0.022, category: 'thread', entity_id: 'thread-1', chapter_number: 5 },
        ],
        character_state: [
          { text: '林枫：当前实力筑基后期，情绪谨慎。', score: 0.026, category: 'character_state', entity_id: 'linf', chapter_number: 5 },
        ],
        world: [
          { text: '禁区是远古战场遗迹，内部灵气紊乱。', score: 0.02, category: 'world', entity_id: 'world-forbidden', chapter_number: 0 },
        ],
        character: [
          { text: '林枫，男，16岁，筑基后期。', score: 0.019, category: 'character', entity_id: 'linf', chapter_number: 0 },
        ],
      };
      return results[category] ?? [];
    }),
    getEntityTexts: vi.fn().mockResolvedValue([]),
  };
}

function createMockNovelManager(): PipelineNovelManager {
  return {
    getNovel: vi.fn().mockResolvedValue({ title: '测试小说', genre: 'fantasy', chapterCount: 10 }),
    getOutline: vi.fn().mockResolvedValue({ chapters: [] }),
    saveOutline: vi.fn(),
    getChapter: vi.fn().mockResolvedValue(null),
    saveChapter: vi.fn(),
    getCharacters: vi.fn().mockResolvedValue([]),
    getCharacterStateSnapshots: vi.fn().mockResolvedValue([]),
    getWorldEntries: vi.fn().mockResolvedValue([
      {
        id: 'we-1',
        name: '禁区',
        category: 'geography',
        content: '远古战场遗迹，灵气紊乱，内有大量宝物和危险。',
        tags: [],
        summary: '远古战场遗迹',
      },
    ]),
    getChapterFacts: vi.fn().mockResolvedValue({}),
    getChapterFact: vi.fn().mockResolvedValue(null),
    saveChapterFact: vi.fn(),
    getCharacterEvents: vi.fn().mockResolvedValue([]),
    appendCharacterEvents: vi.fn(),
    getPacing: vi.fn().mockResolvedValue([]),
    savePacing: vi.fn(),
    listChapters: vi.fn().mockResolvedValue([]),
  };
}

function createTruthFileBundle(): TruthFileBundle {
  return {
    currentState: {
      chapterNumber: 5,
      characters: [
        {
          name: 'Lina',
          location: 'old archive',
          goal: 'recover the ledger',
          goalProgress: 60,
          emotionalState: 'alert',
          physicalCondition: 'tired',
          alive: true,
          present: true,
          keyItems: ['brass key'],
          powerChange: '',
        },
      ],
      world: {
        timelineMarker: 'night before audit',
        environment: 'rain blocks the west gate',
        recentChanges: [],
      },
      factions: [],
      tensionLevel: 7,
      readerQuestions: ['who erased the ledger'],
      nextChapterConstraints: ['Lina must keep the brass key secret'],
      generatedAt: '2026-07-03T00:00:00.000Z',
    },
    pendingHooks: {
      currentChapter: 6,
      hooks: [
        {
          hint: 'the brass key opens the sealed ledger room',
          plantedInChapter: 3,
          scope: 'arc',
          priority: 'high',
          chaptersElapsed: 3,
          chaptersUntilOverdue: -1,
          urgency: 'critical',
          isOverdue: true,
        },
      ],
      stats: {
        total: 1,
        critical: 1,
        warning: 0,
        normal: 0,
      },
      generatedAt: '2026-07-03T00:00:00.000Z',
    },
    characterMatrix: {
      revealedSecrets: [
        {
          characterName: 'Lina',
          secrets: ['the key came from her father'],
        },
      ],
      hiddenSecrets: [],
      infoEdges: [],
      generatedAt: '2026-07-03T00:00:00.000Z',
    },
  };
}

// ────────────────────────────── 测试 ──────────────────────────────

describe('loadOrchestratorMemoryContext', () => {
  it('maps orchestrator output to EnhancedMemoryContext fields', async () => {
    const rawSearch = createMockRawSearch();
    const novelManager = createMockNovelManager();

    const result = await loadOrchestratorMemoryContext({
      rawSearch,
      novelManager,
      novelId: 'novel-test',
      userDirection: '继续探索禁区',
      outlineContent: '主角深入禁区核心',
      chapterNumber: 6,
      chapterCount: 10,
      previousChapterContext: '上一章主角到达了禁区入口。',
      genre: 'fantasy',
    });

    // 验证返回结构完整
    expect(result).toHaveProperty('memoryWorldCtx');
    expect(result).toHaveProperty('memoryCharCtx');
    expect(result).toHaveProperty('arcCtx');
    expect(result).toHaveProperty('digestCtx');
    expect(result).toHaveProperty('enhancedChapterCtx');
    expect(result).toHaveProperty('factCtx');
    expect(result).toHaveProperty('threadCtx');
    expect(result).toHaveProperty('characterStateCtx');

    // 世界相关内容应出现在 memoryWorldCtx
    expect(result.memoryWorldCtx).toContain('禁区');

    // 角色相关内容应出现在 memoryCharCtx
    expect(result.memoryCharCtx).toContain('林枫');

    // mergedPreviousSummary 应包含非世界/角色的内容
    expect(result.mergedPreviousSummary).toBeDefined();
    if (result.mergedPreviousSummary) {
      // 前一章上下文应在 mergedPreviousSummary 中
      expect(result.mergedPreviousSummary).toContain('上一章');
    }
  });

  it('returns empty fields when no data available', async () => {
    const rawSearch: RawVectorSearch = {
      search: vi.fn().mockResolvedValue([]),
      getEntityTexts: vi.fn().mockResolvedValue([]),
    };
    const novelManager = createMockNovelManager();
    (novelManager.getWorldEntries as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await loadOrchestratorMemoryContext({
      rawSearch,
      novelManager,
      novelId: 'novel-empty',
      userDirection: '开始创作',
      outlineContent: '第一章大纲',
      chapterNumber: 1,
      chapterCount: 1,
      previousChapterContext: '',
    });

    expect(result.memoryWorldCtx).toBe('');
    expect(result.memoryCharCtx).toBe('');
  });

  it('invokes rawSearch.search for all categories', async () => {
    const rawSearch = createMockRawSearch();
    const novelManager = createMockNovelManager();

    await loadOrchestratorMemoryContext({
      rawSearch,
      novelManager,
      novelId: 'novel-test',
      userDirection: '测试',
      outlineContent: '测试大纲',
      chapterNumber: 5,
      chapterCount: 10,
      previousChapterContext: '',
    });

    // 应该调用多次 search（chapter 多查询 + 其他单查询）
    expect(rawSearch.search).toHaveBeenCalled();
    const calls = (rawSearch.search as ReturnType<typeof vi.fn>).mock.calls;
    const categories = calls.map(c => c[2]?.category).filter(Boolean);
    // 至少应有 digest, arc, fact, thread, character_state, world, character
    expect(categories.length).toBeGreaterThanOrEqual(7);
  });

  it('maps truth-file adapter output into previous-summary context', async () => {
    const rawSearch: RawVectorSearch = {
      search: vi.fn().mockResolvedValue([]),
      getEntityTexts: vi.fn().mockResolvedValue([]),
    };
    const novelManager = createMockNovelManager();
    (novelManager.getWorldEntries as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await loadOrchestratorMemoryContext({
      rawSearch,
      novelManager,
      novelId: 'novel-truth',
      userDirection: 'continue the archive audit',
      outlineContent: 'Lina must decide whether to reveal the key',
      chapterNumber: 6,
      chapterCount: 12,
      previousChapterContext: '',
      truthFiles: {
        loadBundle: vi.fn().mockResolvedValue(createTruthFileBundle()),
      },
    });

    expect(result.mergedPreviousSummary).toContain('Lina');
    expect(result.mergedPreviousSummary).toContain('brass key');
    expect(result.mergedPreviousSummary).toContain('sealed ledger room');
  });
});
