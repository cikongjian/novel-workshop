import { describe, expect, it } from 'vitest';
import type { Chapter } from '../novel/types.js';
import { buildMemoryContextAudit, buildMemoryContextForwardHints } from './memory-context-audit.js';

function makeChapterWithMemoryAudit(
  memoryContextAudit: NonNullable<Chapter['diagnostics']>['memoryContextAudit'],
): Chapter {
  return {
    novelId: '00000000-0000-4000-8000-000000000001',
    chapterNumber: 12,
    title: '上一章',
    content: '正文',
    wordCount: 2,
    status: 'reviewed',
    agentComments: [],
    readerScore: 7.8,
    revisionCount: 0,
    summary: '',
    diagnostics: {
      memoryContextAudit,
      updatedAt: '2026-07-03T00:00:00.000Z',
    },
    createdAt: '2026-07-03T00:00:00.000Z',
    updatedAt: '2026-07-03T00:00:00.000Z',
  };
}

describe('memory context audit', () => {
  it('reports empty and unused persisted sources without changing behavior', () => {
    const audit = buildMemoryContextAudit({
      retriever: 'legacy',
      previousChapterContext: 'previous scene',
      chapterVectorContext: '',
      enhancedPreviousSummary: 'merged memory',
      worldVectorContext: 'world rules',
      characterVectorContext: '',
      factVectorContext: '',
      characterStateVectorContext: '',
      storyStateContext: 'state',
      truthFilesPresent: true,
      truthFilesUsedInPrompt: false,
    });

    expect(audit.mode).toBe('observe');
    expect(audit.retriever).toBe('legacy');
    expect(audit.totalChars).toBeGreaterThan(0);
    expect(audit.unusedPersistedSources).toContain('truthFiles');
    expect(audit.emptyPromptSources).toContain('factVector');
    expect(audit.emptyPromptSources).toContain('characterStateVector');
    expect(audit.warnings).toContain('truth files exist but are not used in prompt');
  });

  it('does not warn about truth files when they are absent', () => {
    const audit = buildMemoryContextAudit({
      retriever: 'orchestrator',
      previousChapterContext: 'previous scene',
      chapterVectorContext: 'chapter memory',
      truthFilesPresent: false,
      truthFilesUsedInPrompt: false,
    });

    expect(audit.retriever).toBe('orchestrator');
    expect(audit.unusedPersistedSources).not.toContain('truthFiles');
    expect(audit.warnings).not.toContain('truth files exist but are not used in prompt');
  });

  it('warns when story state exists but truth files are not yet available before prompt', () => {
    const audit = buildMemoryContextAudit({
      retriever: 'orchestrator',
      previousChapterContext: 'previous scene',
      chapterVectorContext: 'chapter memory',
      storyStateContext: 'current structured state',
      truthFilesPresent: false,
      truthFilesUsedInPrompt: false,
    });

    expect(audit.warnings).toContain('story state context exists but truth files are absent before prompt');
    expect(audit.unusedPersistedSources).not.toContain('truthFiles');
  });

  it('records truth files as prompt context when preview injection is enabled', () => {
    const audit = buildMemoryContextAudit({
      retriever: 'orchestrator',
      previousChapterContext: 'previous scene',
      chapterVectorContext: 'chapter memory',
      truthFilesContext: 'truth context',
      truthFilesPresent: true,
      truthFilesUsedInPrompt: true,
      truthFilesSections: ['currentState', 'pendingHooks', 'characterMatrix'],
    });

    const truthReport = audit.sources.find(item => item.source === 'truthFiles');
    expect(truthReport).toEqual(expect.objectContaining({
      chars: 'truth context'.length,
      present: true,
      usedInPrompt: true,
      sections: ['currentState', 'pendingHooks', 'characterMatrix'],
    }));
    expect(audit.unusedPersistedSources).not.toContain('truthFiles');
    expect(audit.warnings).not.toContain('truth files exist but are not used in prompt');
    expect(audit.warnings).not.toContain('truth files injected without currentState section');
    expect(audit.warnings).not.toContain('truth files injected without pendingHooks section');
    expect(audit.warnings).not.toContain('truth files injected without characterMatrix section');
  });

  it('counts reusable story anchors by prompt source', () => {
    const audit = buildMemoryContextAudit({
      retriever: 'orchestrator',
      previousChapterContext: '主角沈砚和队友在球场完成防守，下一步必须守住首发位置。',
      factVectorContext: '伏笔：首发名单还没公布。压力：对手会继续针对右翼传切。',
      characterStateVectorContext: '关系状态：队友信任提升，但膝伤风险仍在。',
      truthFilesContext: 'currentState：目标是公开训练赛；pendingHooks：首发名单。',
      truthFilesPresent: true,
      truthFilesUsedInPrompt: true,
      truthFilesSections: ['currentState', 'pendingHooks', 'characterMatrix'],
    });

    const previous = audit.sources.find(item => item.source === 'previousChapter');

    expect(audit.reusableAnchorCount).toBeGreaterThanOrEqual(6);
    expect(audit.reusableAnchorDensity).toBeGreaterThan(0);
    expect(previous?.reusableAnchorKinds).toEqual(expect.arrayContaining(['character', 'place', 'goal']));
    expect(audit.warnings).not.toContain('memory context has low reusable story anchors');
  });

  it('warns when a large injected memory context has too few reusable anchors', () => {
    const audit = buildMemoryContextAudit({
      retriever: 'legacy',
      previousChapterContext: '这段内容只是泛泛说明气氛很好。'.repeat(120),
      chapterVectorContext: '大家继续前进，故事继续发展。'.repeat(120),
      factVectorContext: '还有一些普通说明。'.repeat(40),
      characterStateVectorContext: '普通说明。'.repeat(40),
    });

    expect(audit.promptChars).toBeGreaterThanOrEqual(2000);
    expect(audit.reusableAnchorCount).toBeLessThan(6);
    expect(audit.warnings).toContain('memory context has low reusable story anchors');
  });

  it('warns when injected truth files are missing core sections', () => {
    const audit = buildMemoryContextAudit({
      retriever: 'legacy',
      previousChapterContext: 'previous scene',
      chapterVectorContext: 'chapter memory',
      truthFilesContext: 'truth context',
      truthFilesPresent: true,
      truthFilesUsedInPrompt: true,
      truthFilesSections: ['pendingHooks'],
    });

    expect(audit.warnings).toContain('truth files injected without currentState section');
    expect(audit.warnings).not.toContain('truth files injected without pendingHooks section');
    expect(audit.warnings).toContain('truth files injected without characterMatrix section');
    expect(audit.unusedPersistedSources).not.toContain('truthFiles');
  });

  it('builds forward hints when previous memory context lacks reusable anchors', () => {
    const audit = buildMemoryContextAudit({
      retriever: 'orchestrator',
      previousChapterContext: '这段内容只是泛泛说明气氛很好。'.repeat(120),
      chapterVectorContext: '大家继续前进，故事继续发展。'.repeat(120),
      factVectorContext: '',
      threadVectorContext: '',
      characterStateVectorContext: '',
    });

    const hints = buildMemoryContextForwardHints(makeChapterWithMemoryAudit(audit));

    expect(hints).toContain('上一章记忆上下文审计提示');
    expect(hints).toContain('可复用故事锚点偏少');
    expect(hints).toContain('factVector');
    expect(hints).toContain('threadVector');
    expect(hints).toContain('人物状态、事实因果和未回收压力');
    expect(hints).toContain('不要写成设定清单');
  });

  it('does not add forward hints for healthy reusable memory context', () => {
    const audit = buildMemoryContextAudit({
      retriever: 'orchestrator',
      previousChapterContext: '主角沈砚和队友在球场完成防守，下一步必须守住首发位置。',
      factVectorContext: '伏笔：首发名单还没公布。压力：对手会继续针对右翼传切。',
      threadVectorContext: '待办：首发名单需要回收。',
      characterStateVectorContext: '关系状态：队友信任提升，但膝伤风险仍在。',
      truthFilesContext: 'currentState：目标是公开训练赛；pendingHooks：首发名单；characterMatrix：沈砚和队友信任提升。',
      truthFilesPresent: true,
      truthFilesUsedInPrompt: true,
      truthFilesSections: ['currentState', 'pendingHooks', 'characterMatrix'],
    });

    expect(buildMemoryContextForwardHints(makeChapterWithMemoryAudit(audit))).toBe('');
  });
});
