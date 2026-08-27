import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Chapter } from '../novel/types.js';
import type { ChapterGenerationResult } from '../pipeline/types.js';
import { listChapterGenerationFailures } from './chapter-generation-failure-store.js';
import { markChapterGenerationFailed, saveGenerationResults } from './generation-result-service.js';

const temporaryDataDirs: string[] = [];

function buildMockNovelManager(dataDir = path.join(os.tmpdir(), `generation-result-${crypto.randomUUID()}`)) {
  temporaryDataDirs.push(dataDir);
  return {
    getDataDir: vi.fn(() => dataDir),
    getChapter: vi.fn().mockResolvedValue(null),
    archiveChapterVersion: vi.fn().mockResolvedValue(undefined),
    getNovel: vi.fn().mockResolvedValue({
      id: 'novel-1',
      title: '死对头协议同居后先动心',
      synopsis: '恋爱同居，死对头在直播合同和马场障碍区里被迫牵手。',
      genre: 'romance',
      tags: [],
      constitutionTags: [],
    }),
    saveChapter: vi.fn().mockResolvedValue(undefined),
    getOutline: vi.fn().mockResolvedValue({ chapters: [] }),
    saveOutline: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(async () => {
  await Promise.all(temporaryDataDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

function buildGenerationResult(patch: Partial<ChapterGenerationResult> = {}): ChapterGenerationResult {
  return {
    chapterContent: [
      '“明天，”他说，“我来接你。”',
      '不是合同说的。(#林栀)(#顾砚舟)',
    ].join('\n\n'),
    outline: '第5章 马场直播障碍区事件\n林栀和顾砚舟在马场完成牵手直播。',
    worldNotes: '',
    characterNotes: '',
    draft: '',
    editedContent: '',
    readerFeedback: '读者评分：7.8/10',
    agentOutputs: [],
    collaborationLog: [],
    ...patch,
  } as ChapterGenerationResult;
}

describe('saveGenerationResults', () => {
  it('cleans internal speaker markers before saving public chapter content', async () => {
    const novelManager = buildMockNovelManager();

    await saveGenerationResults(
      novelManager as any,
      'novel-1',
      5,
      buildGenerationResult(),
    );

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.content).toBe('“明天，”他说，“我来接你。”\n\n不是合同说的。');
    expect(saved.wordCount).toBe(saved.content.length);
    expect(saved.diagnostics?.readabilityAudit?.speakerMarkerCount).toBe(0);
    expect(saved.diagnostics?.readerDeliveryAudit?.issues.join('\n')).not.toContain('说话人标记');
  });

  it('cleans outline word-count hints from an existing generated title before final save', async () => {
    const novelManager = buildMockNovelManager();
    novelManager.getChapter
      .mockResolvedValueOnce({
        novelId: 'novel-1',
        chapterNumber: 6,
        title: '返回公寓的车内约900字',
        summary: '',
        content: '旧正文',
        wordCount: 3,
        status: 'edited',
        agentComments: [],
        revisionCount: 0,
        createdAt: '2026-06-30T00:00:00.000Z',
        updatedAt: '2026-06-30T00:00:00.000Z',
      } as Chapter)
      .mockResolvedValueOnce(null);

    await saveGenerationResults(
      novelManager as any,
      'novel-1',
      6,
      buildGenerationResult({
        chapterContent: '车开回公寓时，樱花糖还在她掌心。',
        readerFeedback: '读者评分：7.8/10',
      }),
    );

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.title).toBe('返回公寓的车内');
    expect(saved.title).not.toContain('900字');
  });

  it('persists auto-revision diagnostics from the generation pipeline', async () => {
    const novelManager = buildMockNovelManager();

    await saveGenerationResults(
      novelManager as any,
      'novel-1',
      7,
      buildGenerationResult({
        chapterContent: [
          '凌晨的客厅只开了一盏灯，林栀把红糖水放到茶几上，顾砚舟的右肩还僵着，直播合同就在两人中间。',
          '“你明天还要骑？”她盯着他的肩膀。',
          '顾砚舟低笑，把安全带扣从她手边推回来：“你不是说只管合同？”',
          '林栀顿了一下，还是把药膏递过去。两人的手指碰在一起，她先收回手，耳根却热了。',
          '手机震了一声，品牌方发来新流程：明早直播前需要两人同框牵手确认。林栀看着那行字，顾砚舟已经站到她身侧。',
        ].join('\n\n'),
        autoRevision: {
          triggered: true,
          rounds: 3,
          initialScore: 7.1,
          finalScore: 7.6,
          accepted: true,
          reason: 'reader-delivery-passed',
          selectedRound: 2,
          readerDeliveryInitialScore: 70.5,
          readerDeliveryFinalScore: 84.2,
          readerDeliveryPassed: true,
        },
      }),
    );

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.diagnostics?.autoRevision).toEqual(expect.objectContaining({
      triggered: true,
      rounds: 3,
      selectedRound: 2,
    }));
    expect(saved.diagnostics?.autoRevision?.accepted)
      .toBe(saved.diagnostics?.readerDeliveryAudit?.passed);
    expect(saved.diagnostics?.autoRevision?.readerDeliveryFinalScore)
      .toBe(saved.diagnostics?.readerDeliveryAudit?.score);
    expect(saved.diagnostics?.autoRevision?.readerDeliveryPassed)
      .toBe(saved.diagnostics?.readerDeliveryAudit?.passed);
  });

  it('persists unresolved world gate findings and repair outcome', async () => {
    const novelManager = buildMockNovelManager();

    await saveGenerationResults(
      novelManager as any,
      'novel-1',
      7,
      buildGenerationResult({
        worldFulfillment: {
          gateMode: 'warn',
          requiredTotal: 1,
          requiredHit: 1,
          missingRequired: [],
          unsourcedTerms: [],
          findings: [{
            code: 'contradicted-rule',
            level: 'warn',
            message: '正文反向描述了已确认世界正史“宵禁规则”',
            entryName: '宵禁规则',
          }],
          passed: true,
          summary: '必引要素命中 1/1，规则冲突 1',
        },
        worldGateRewrite: {
          attempted: true,
          applied: false,
          reason: '恢复宵禁规则',
          before: {} as any,
          after: {} as any,
        },
      }),
    );

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.diagnostics?.worldGate).toEqual(expect.objectContaining({
      hasViolations: true,
      repairAttempted: true,
      repairApplied: false,
      findings: [expect.objectContaining({ code: 'contradicted-rule', entryName: '宵禁规则' })],
    }));
    expect(saved.diagnostics?.generationLifecycle?.warnings).toEqual(expect.arrayContaining([
      'world-gate-findings:1',
      'world-gate-repair-not-applied',
    ]));
  });

  it('does not keep auto-revision accepted when final reader delivery still fails', async () => {
    const novelManager = buildMockNovelManager();

    await saveGenerationResults(
      novelManager as any,
      'novel-1',
      8,
      buildGenerationResult({
        chapterContent: [
          '她看着合同。',
          '他也看着合同。',
          '他们都没有说话。',
        ].join('\n\n'),
        readerFeedback: '读者评分：6.8/10',
        autoRevision: {
          triggered: true,
          rounds: 3,
          initialScore: 6.8,
          finalScore: 7.1,
          accepted: true,
          reason: 'best-reader-delivery-candidate:reader-score-improved',
          selectedRound: 1,
          readerDeliveryInitialScore: 70.5,
          readerDeliveryFinalScore: 80.2,
          readerDeliveryPassed: false,
        },
      }),
    );

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.diagnostics?.readerDeliveryAudit?.passed).toBe(false);
    expect(saved.diagnostics?.autoRevision).toEqual(expect.objectContaining({
      accepted: false,
      readerDeliveryPassed: false,
    }));
    expect(saved.diagnostics?.autoRevision?.readerDeliveryFinalScore)
      .toBe(saved.diagnostics?.readerDeliveryAudit?.score);
    expect(saved.diagnostics?.generationLifecycle?.warnings.join('\n'))
      .toContain('reader-delivery-failed');
  });

  it('does not keep auto-revision accepted when final direction anchors are still missing', async () => {
    const novelManager = buildMockNovelManager();

    await saveGenerationResults(
      novelManager as any,
      'novel-1',
      8,
      buildGenerationResult({
        chapterContent: [
          '凌晨的客厅只开了一盏灯，林栀把红糖水放到茶几上，顾砚舟的右肩还僵着，直播合同就在两人中间。',
          '“你明天还要骑？”她盯着他的肩膀。',
          '顾砚舟低笑，把安全带扣从她手边推回来：“你不是说只管合同？”',
          '林栀顿了一下，还是把药膏递过去。两人的手指碰在一起，她先收回手，耳根却热了。',
          '手机震了一声，品牌方发来新流程：明早直播前需要两人同框牵手确认。林栀看着那行字，顾砚舟已经站到她身侧。',
        ].join('\n\n'),
        autoRevision: {
          triggered: true,
          rounds: 3,
          initialScore: 7.1,
          finalScore: 7.6,
          accepted: true,
          reason: 'reader-delivery-passed',
          selectedRound: 0,
          readerDeliveryInitialScore: 70.5,
          readerDeliveryFinalScore: 84.2,
          readerDeliveryPassed: true,
        },
        userDirectionAnchorAudit: {
          anchors: ['班赛', '传球失误', '右翼传切'],
          presentAnchors: ['班赛'],
          missingAnchors: ['传球失误', '右翼传切'],
          coverage: 1 / 3,
          shouldRepair: true,
          feedback: '用户方向锚点缺失。',
          directionChars: 80,
          contentChars: 240,
          sourceHash: '1234abcd:5678ef90',
          directionPreview: '继续体育班赛，必须出现传球失误和右翼传切。',
          stage: 'final',
        },
      }),
    );

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.diagnostics?.userDirectionAnchorAudit?.shouldRepair).toBe(true);
    expect(saved.diagnostics?.autoRevision).toEqual(expect.objectContaining({
      accepted: false,
      reason: expect.stringContaining('final-save-direction-anchors-missing'),
    }));
  });

  it('persists memory context audit from the generation pipeline', async () => {
    const novelManager = buildMockNovelManager();

    await saveGenerationResults(
      novelManager as any,
      'novel-1',
      9,
      buildGenerationResult({
        memoryContextAudit: {
          mode: 'observe',
          retriever: 'legacy',
          totalChars: 120,
          promptChars: 90,
          unusedPersistedSources: [],
          emptyPromptSources: ['factVector'],
          warnings: ['fact memory context is empty'],
          sources: [
            {
              source: 'truthFiles',
              chars: 80,
              present: true,
              usedInPrompt: true,
              sections: ['currentState', 'pendingHooks', 'characterMatrix'],
            },
          ],
        },
      }),
    );

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.diagnostics?.memoryContextAudit).toEqual(expect.objectContaining({
      promptChars: 90,
      warnings: ['fact memory context is empty'],
    }));
    expect(saved.diagnostics?.memoryContextAudit?.sources[0]).toEqual(expect.objectContaining({
      source: 'truthFiles',
      usedInPrompt: true,
    }));
    expect(saved.diagnostics?.generationLifecycle).toEqual(expect.objectContaining({
      phase: 'final',
      chapterStatus: 'reviewed',
    }));
    expect(saved.diagnostics?.generationLifecycle?.warnings)
      .toEqual(expect.arrayContaining(['reader-delivery-failed:73.7']));
  });

  it('records an explicit memory audit warning when generation result lacks the audit', async () => {
    const novelManager = buildMockNovelManager();

    await saveGenerationResults(
      novelManager as any,
      'novel-1',
      10,
      buildGenerationResult(),
    );

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.diagnostics?.memoryContextAudit).toEqual(expect.objectContaining({
      totalChars: 0,
      promptChars: 0,
      warnings: ['memory audit missing from generation result'],
      sources: [],
    }));
  });

  it('persists sanitized public-facing author notes on final save', async () => {
    const novelManager = buildMockNovelManager();

    await saveGenerationResults(
      novelManager as any,
      'novel-1',
      10,
      buildGenerationResult({
        authorNote: '马场的雨停得很快，下一章两个人会把临时默契带进更难看的镜头里。',
      }),
    );

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.authorNotes).toEqual([
      '马场的雨停得很快，下一章两个人会把临时默契带进更难看的镜头里。',
    ]);
  });

  it('does not persist unsafe writing-process author notes on final save', async () => {
    const novelManager = buildMockNovelManager();

    await saveGenerationResults(
      novelManager as any,
      'novel-1',
      10,
      buildGenerationResult({
        authorNote: '今天写这章的时候，我想起高中时的一个朋友。我跟他学过怎么把旧模型摆进柜子里，谢谢那本灰色的笔记本。',
      }),
    );

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.authorNotes).toEqual([]);
  });

  it('marks memory audit as pending for save-first draft persistence', async () => {
    const novelManager = buildMockNovelManager();

    await saveGenerationResults(
      novelManager as any,
      'novel-1',
      11,
      buildGenerationResult(),
      { chapterStatus: 'edited' },
    );

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.status).toBe('edited');
    expect(saved.diagnostics?.memoryContextAudit).toEqual(expect.objectContaining({
      warnings: ['memory audit pending until final generation result'],
      sources: [],
    }));
    expect(saved.diagnostics?.generationLifecycle).toEqual(expect.objectContaining({
      phase: 'draft',
      saveFirstMode: true,
      chapterStatus: 'edited',
    }));
    expect(saved.diagnostics?.generationLifecycle?.warnings)
      .toEqual(expect.arrayContaining(['save-first draft persisted; final generation result is not saved yet']));
  });

  it('marks an existing draft as failed when background generation does not save final result', async () => {
    const existingChapter = {
      novelId: 'novel-1',
      chapterNumber: 12,
      title: '草稿',
      summary: '',
      content: '已有草稿',
      wordCount: 4,
      status: 'edited',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {
        generationLifecycle: {
          mode: 'observe',
          phase: 'draft',
          saveFirstMode: true,
          chapterStatus: 'edited',
          warnings: ['save-first draft persisted; final generation result is not saved yet'],
          updatedAt: '2026-06-30T00:00:00.000Z',
        },
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
    } as Chapter;
    const novelManager = buildMockNovelManager();
    novelManager.getChapter.mockResolvedValueOnce(existingChapter);

    await markChapterGenerationFailed({
      novelManager: novelManager as any,
      novelId: 'novel-1',
      chapterNumber: 12,
      errorCode: 'CHAPTER_GENERATION_TIMEOUT',
      errorMessage: '章节生成超时',
      retryable: true,
    });

    const saved = novelManager.saveChapter.mock.calls[0]?.[1] as Chapter;
    expect(saved.status).toBe('edited');
    expect(saved.diagnostics?.generationLifecycle).toEqual(expect.objectContaining({
      phase: 'failed',
      saveFirstMode: true,
      chapterStatus: 'edited',
      errorCode: 'CHAPTER_GENERATION_TIMEOUT',
      errorMessage: '章节生成超时',
      retryable: true,
      warnings: ['chapter generation failed before final result was saved'],
    }));
  });

  it('records a failure without creating an empty chapter when no draft was saved', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'generation-result-failure-'));
    const novelManager = buildMockNovelManager(dataDir);

    try {
      await markChapterGenerationFailed({
        novelManager: novelManager as any,
        novelId: 'novel-1',
        chapterNumber: 13,
        errorCode: 'CHAPTER_GENERATION_TIMEOUT',
        errorMessage: '章节生成空闲超时',
        retryable: true,
      });

      expect(novelManager.saveChapter).not.toHaveBeenCalled();
      await expect(listChapterGenerationFailures(novelManager as any, 'novel-1'))
        .resolves.toEqual([
          expect.objectContaining({
            chapterNumber: 13,
            errorCode: 'CHAPTER_GENERATION_TIMEOUT',
            errorMessage: '章节生成空闲超时',
            retryable: true,
          }),
        ]);
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('rejects content that becomes empty after public-output cleanup', async () => {
    const novelManager = buildMockNovelManager();
    await expect(saveGenerationResults(
      novelManager as any,
      'novel-1',
      14,
      buildGenerationResult({ chapterContent: '(#林栀)(#顾砚舟)' }),
    )).rejects.toThrow('清洗后正文为空');
    expect(novelManager.saveChapter).not.toHaveBeenCalled();
  });
});
