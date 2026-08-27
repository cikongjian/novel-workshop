import { describe, expect, it, vi } from 'vitest';
import {
  buildResizeOperationContext,
  buildResizeResponse,
  finalizeResizeSuccess,
  runAgentResizeWorkflow,
  runFallbackResizeWorkflow,
  validateResizeTarget,
} from './chapter-resize-support.js';

describe('chapter resize support', () => {
  it('builds resize context and validates target word count', () => {
    const result = buildResizeOperationContext({
      novel: {
        id: 'novel-1',
        genre: '玄幻',
        title: '赤焰长歌',
        synopsis: '宗门旧案重启',
      },
      chapter: {
        content: '旧文内容',
      },
      chapterNumber: 3,
      targetWordCount: 1200,
      mode: 'expand',
      preserveNotes: '保留对决张力',
      outlineData: {
        chapters: [{ chapterNumber: 3, title: '夜雨', summary: '山门遇袭', keyEvents: ['遇袭'] }],
        foreshadowing: [],
      } as any,
      characters: [{
        name: '陆焰',
        role: '主角',
        personality: '冷静',
        personalityTraits: ['克制', '敏锐'],
        motivation: '追查旧案',
        abilities: [],
      }] as any,
      worldEntries: [{ name: '赤焰宗', category: 'faction', description: '火系宗门', tags: ['宗门'] }] as any,
    });

    expect(result.modeLabel).toBe('扩写');
    expect(result.originalContext.scenePlan).toContain('遇袭');
    expect(result.originalContext.characterContext).toContain('陆焰');
    expect(result.resizeFeedback).toContain('1200');
    expect(validateResizeTarget({ mode: 'expand', currentWordCount: 2000, targetWordCount: 1500 })).toContain('应大于当前字数');
  });

  it('runs resizer plus editor workflow and parses editor output', async () => {
    const broadcast = vi.fn();
    const resizerAgent = {
      execute: vi.fn().mockImplementation(async (_context, _client, onChunk) => {
        onChunk('chunk-1');
        return {
          agentRole: 'resizer',
          content: '第一版扩写正文',
          timestamp: '2026-03-23T00:00:00.000Z',
        };
      }),
    };
    const editorAgent = {
      execute: vi.fn().mockResolvedValue({
        agentRole: 'editor',
        content: '润色后的正文\n最终版本\n---EDITOR_NOTES---\n说明',
        timestamp: '2026-03-23T00:00:01.000Z',
      }),
    };

    const result = await runAgentResizeWorkflow({
      broadcast,
      novelId: 'novel-1',
      chapterNumber: 3,
      originalContext: { novelId: 'novel-1', chapterNumber: 3 } as any,
      chapterContent: '原文',
      resizeFeedback: '扩写到 1200 字',
      modeLabel: '扩写',
      preserveNotes: '保留压迫感',
      client: {} as any,
      resizerAgent: resizerAgent as any,
      editorAgent: editorAgent as any,
    });

    expect(result.finalContent).toContain('最终版本');
    expect(result.agentOutputs).toHaveLength(2);
    expect(broadcast).toHaveBeenCalled();
  });

  it('falls back to revision pipeline when dedicated agents are unavailable', async () => {
    const reviseChapter = vi.fn().mockResolvedValue({
      revisedContent: '回退后的扩写正文',
      agentOutputs: [{
        agentRole: 'writer',
        content: 'fallback',
        timestamp: '2026-03-23T00:00:02.000Z',
      }],
    });

    const result = await runFallbackResizeWorkflow({
      deps: {
        broadcast: vi.fn(),
        revisionPipeline: { reviseChapter } as any,
      },
      novelId: 'novel-1',
      chapterNumber: 4,
      originalContext: { novelId: 'novel-1', chapterNumber: 4 } as any,
      chapterContent: '原文',
      resizeFeedback: '压缩到 800 字',
      modeLabel: '缩写',
      targetWordCount: 800,
      modelOverride: undefined,
    });

    expect(reviseChapter).toHaveBeenCalledOnce();
    expect(result.finalContent).toBe('回退后的扩写正文');
    expect(result.agentOutputs[0]?.agentRole).toBe('writer');
  });

  it('finalizes resize success and returns stable response payload', async () => {
    const archiveChapterVersion = vi.fn();
    const saveChapter = vi.fn();
    const syncNovelMetadataByChapters = vi.fn();
    const appendChapterCost = vi.fn();
    const getOperationRuleCode = vi.fn().mockResolvedValue('resize.rule');
    const estimate = vi.fn().mockResolvedValue({ estimatedPoints: 66 });
    const settleFreeze = vi.fn();
    const broadcast = vi.fn();

    const response = await finalizeResizeSuccess({
      deps: {
        novelManager: {
          archiveChapterVersion,
          saveChapter,
          syncNovelMetadataByChapters,
          appendChapterCost,
        },
        billingService: {
          getOperationRuleCode,
          estimate,
          settleFreeze,
        },
        broadcast,
      } as any,
      novelId: 'novel-1',
      chapterNumber: 5,
      chapter: {
        id: 'chapter-5',
        chapterNumber: 5,
        title: '旧章',
        content: '旧文',
        wordCount: 2,
        revisionCount: 1,
        status: 'draft',
        agentComments: [],
        updatedAt: '2026-03-22T00:00:00.000Z',
      } as any,
      finalContent: '新的章节正文',
      agentOutputs: [{
        agentRole: 'editor',
        content: '新的章节正文',
        timestamp: '2026-03-23T00:00:03.000Z',
        metadata: {
          inputTokens: 10,
          outputTokens: 20,
          provider: 'openai',
          model: 'test-model',
        },
      } as any],
      mode: 'expand',
      currentWordCount: 2000,
      modelAccessSource: 'platform-global',
      billingBypassed: false,
      freezeId: 'freeze-1',
      billingUserId: 'user-1',
    });

    expect(archiveChapterVersion).toHaveBeenCalledWith('novel-1', 5, 'resize');
    expect(saveChapter).toHaveBeenCalledOnce();
    expect(appendChapterCost).toHaveBeenCalledOnce();
    expect(settleFreeze).toHaveBeenCalledWith('user-1', 'freeze-1', 66);
    expect(response).toEqual(buildResizeResponse({
      finalContent: '新的章节正文',
      currentWordCount: 2000,
      mode: 'expand',
      modelAccessSource: 'platform-global',
      billingBypassed: false,
    }));
  });
});
