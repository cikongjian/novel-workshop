import { describe, expect, it } from 'vitest';
import {
  buildFactionCuratedSummary,
  buildFactionFinalSummary,
  buildFactionStageInput,
} from './curate-faction-stage-support.js';
import { applyFactionFallbackProtection } from './curate-faction-apply-support.js';

describe('curate faction support', () => {
  it('builds faction stage input with outline and snippet context', () => {
    const text = buildFactionStageInput({
      stageTask: '梳理势力文化',
      chunkIndex: 0,
      chunkCount: 2,
      factionChunk: [{ name: '赤焰宗' }],
      indexChunk: [{ id: '1', name: '灵火诀', category: 'power' }],
      totalFactionEntries: 6,
      outlineWindow: ['- 第8章《火线》\n  摘要：围攻开始'],
      plotThreadHints: ['- 旧案（active）：查明灭门真相'],
      unresolvedForeshadowingHints: ['- 血色令牌（埋设章：3）'],
      recentChapterSnippets: ['### 第8章\n赤焰宗围城。'],
    });

    expect(text).toContain('当前阶段：梳理势力文化');
    expect(text).toContain('分片：1/2');
    expect(text).toContain('旧案（active）');
    expect(text).toContain('赤焰宗围城');
  });

  it('builds faction summaries and fallback protection', () => {
    const curatedSummary = buildFactionCuratedSummary([
      { role: 'faction-culture-architect', summary: '补齐文化', producedCount: 4 },
      { role: 'faction-motive-mission-planner', summary: '绑定主线', producedCount: 3 },
    ]);
    expect(curatedSummary).toBe('补齐文化；绑定主线');

    const fallback = applyFactionFallbackProtection({
      factionEntries: [
        { name: '赤焰宗', updatedAt: '2026-03-20', qualityScore: 90 },
        { name: '黑水盟', updatedAt: '2026-03-19', qualityScore: 80 },
        { name: '天机阁', updatedAt: '2026-03-18', qualityScore: 70 },
        { name: '北斗司', updatedAt: '2026-03-17', qualityScore: 60 },
        { name: '青岚谷', updatedAt: '2026-03-16', qualityScore: 50 },
        { name: '寒山寺', updatedAt: '2026-03-15', qualityScore: 40 },
        { name: '夜雨楼', updatedAt: '2026-03-14', qualityScore: 30 },
      ] as any,
      sanitizedEntries: [
        { name: '赤焰宗', updatedAt: '2026-03-20', qualityScore: 90 },
      ] as any,
      maxItems: 10,
    });
    expect(fallback.fallbackApplied).toBe(true);
    expect(fallback.sanitizedEntries.length).toBeGreaterThan(1);

    const finalSummary = buildFactionFinalSummary({
      factionEntries: [{ name: '赤焰宗' }, { name: '黑水盟' }] as any,
      sanitizedEntries: [{ name: '赤焰宗' }, { name: '黑水盟' }] as any,
      stageReports: [
        { role: 'faction-culture-architect', summary: '补齐文化', producedCount: 2 },
      ],
      curatedSummary,
      fallbackApplied: true,
    });
    expect(finalSummary).toContain('势力协同梳理完成：2 -> 2');
    expect(finalSummary).toContain('检测到结果过度收缩');
  });
});
