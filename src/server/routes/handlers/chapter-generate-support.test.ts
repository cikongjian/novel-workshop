import { describe, expect, it } from 'vitest';
import {
  buildSeedOutlineSummary,
  buildChapterGenerationResponse,
  ensureChapterOutlineSeed,
  resolveChapterGenerateInputs,
  runChapterGenerationWithFallback,
} from './chapter-generate-support.js';

describe('chapter generate support', () => {
  it('builds an opening outline seed for blank chapter one generation', () => {
    const summary = buildSeedOutlineSummary({
      chapterNumber: 1,
      novelTitle: '星火夜行',
      novelSynopsis: '废土拾荒者在黑夜里找到会说话的列车残骸',
      userDirection: '第一章先写主角在雨夜捡到核心装置',
    });

    expect(summary).toContain('开篇');
    expect(summary).toContain('题材承诺');
    expect(summary).toContain('本章重点');
  });

  it('bootstraps a missing chapter outline shell before generation', async () => {
    const outline: any = {
      chapters: [],
      plotThreads: [],
      foreshadowing: [],
    };
    const saveCalls: unknown[] = [];

    const created = await ensureChapterOutlineSeed({
      novelManager: {
        getOutline: async () => outline as any,
        saveOutline: async (_novelId: string, nextOutline: unknown) => {
          saveCalls.push(nextOutline);
        },
      } as any,
      novel: {
        id: 'novel-1',
        title: '星火夜行',
        synopsis: '废土拾荒者在黑夜里找到会说话的列车残骸',
      },
      chapterNumber: 1,
      userDirection: '第一章先写主角在雨夜捡到核心装置',
    });

    expect(created).toBe(true);
    expect(outline.chapters).toHaveLength(1);
    expect(outline.chapters[0]?.chapterNumber).toBe(1);
    expect(outline.chapters[0]?.notes).toContain('自动补建');
    expect(saveCalls).toHaveLength(1);
  });

  it('resolves opening inputs and keeps save-first mode', () => {
    const result = resolveChapterGenerateInputs({
      chapterNumber: 1,
      rawUserDirection: '让主角在雨夜登场',
      rawStyleNotes: '节奏快',
      rawMaxWordCount: 3200,
    });

    expect(result.saveFirstMode).toBe(true);
    expect(result.userDirection).toContain('让主角在雨夜登场');
    expect(result.maxWordCount).toBeTruthy();
  });

  it('uses the platform target when chapter one has a blueprint and no explicit limit', () => {
    const result = resolveChapterGenerateInputs({
      chapterNumber: 1,
      blueprint: {
        audience: 'female',
        genre: 'modern',
        identifiedSellingPoint: '事业逆袭',
        titleCandidates: ['她把项目抢回来'],
        logline: '项目负责人夺回成果署名。',
        synopsis: '被架空的项目负责人重新掌握核心项目。',
        tags: ['事业线'],
        hook: {
          openingScene: '成果汇报现场署名被替换',
          incitingIncident: '客户要求负责人当场解释',
          firstPayoff: '她拿出原始记录夺回发言权',
          chapterEndHookRule: '老板临时召集权限会议',
        },
        protagonist: {
          name: '林念',
          archetype: '项目负责人',
          goal: '夺回项目控制权',
          flaw: '习惯独自扛事',
        },
        antagonist: {
          name: '周启',
          archetype: '抢功下属',
          threat: '掌握老板信任',
        },
        engine: {
          cycleFormula: '抢功-取证-反击-升级',
          escalationRule: '每轮争夺抬高决策权限',
          constraints: ['证据必须可验证'],
        },
        styleGuide: '职业、克制、节奏清晰。',
        forbidden: ['空泛口号'],
      },
      rawUserDirection: '',
    });

    expect(result.maxWordCount).toBe(3000);
  });

  it('builds generation response with gate profile metadata', () => {
    const response = buildChapterGenerationResponse({
      result: {
        title: '第一章',
        chapterContent: '正文',
        summary: '摘要',
        agentOutputs: {},
      } as any,
      constitutionBootstrapped: true,
      outlineBootstrapped: true,
      strictGateFallbackUsed: true,
      strictGateFallbackReason: 'manual-save-first',
      saveFirstMode: true,
      modelAccessSource: 'platform-global',
      billingBypassed: false,
    });

    expect(response.constitutionBootstrapped).toBe(true);
    expect(response.outlineBootstrapped).toBe(true);
    expect(response.gateProfile).toBe('save-first');
    expect(response.modelAccessSource).toBe('platform-global');
  });

  it('keeps strict gates enabled while using save-first draft persistence', async () => {
    const generateCalls: any[] = [];
    const resultPayload = {
      title: '第一章',
      chapterContent: '正文内容',
      outline: '大纲',
      worldNotes: '',
      characterNotes: '',
      draft: '草稿',
      editedContent: '正文内容',
      readerFeedback: '',
      agentOutputs: [],
    };

    const result = await runChapterGenerationWithFallback({
      deps: {
        chapterPipeline: {
          fork: () => ({
            generateChapter: async (options: any) => {
              generateCalls.push(options);
              return resultPayload;
            },
          }),
        },
        novelManager: {},
        broadcast: () => undefined,
      } as any,
      novelId: 'novel-1',
      chapterNumber: 1,
      userDirection: '第一章先兑现题材承诺',
      signal: new AbortController().signal,
    });

    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0].skipStrictGate).toBe(false);
    expect(result.saveFirstMode).toBe(true);
    expect(result.strictGateFallbackUsed).toBe(false);
  });
});
