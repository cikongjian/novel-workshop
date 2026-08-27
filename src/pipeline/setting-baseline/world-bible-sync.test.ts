import { describe, expect, it } from 'vitest';
import type { CharacterProfile, WorldEntry } from '../../novel/types.js';
import { buildBaselineContext } from './baseline-context.js';
import { buildWorldBibleSettingBaseline } from './world-bible-sync.js';

const entry: WorldEntry = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'rule',
  name: '宵禁规则',
  description: '城门日落后关闭。',
  constraints: ['日落后城门必须关闭'],
  consequences: ['违规者会被巡夜司扣押'],
  details: {},
  dependencies: [],
  conflicts: [],
  relatedEntries: [],
  tags: ['world-bible', 'approved'],
  baseline: true,
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
};

describe('world bible setting baseline sync', () => {
  it('confirms approved canon while preserving existing story promises', () => {
    const baseline = buildWorldBibleSettingBaseline({
      existing: {
        version: 1,
        novelId: 'novel-1',
        status: 'pending',
        createdAt: '2026-07-10T00:00:00.000Z',
        genre: 'fantasy',
        powerSystems: [],
        worldFrame: { summary: '旧框架', factions: [] },
        characterCores: [],
        promises: ['主角必须守住王城'],
        antiDriftClause: '不得改变核心题材',
        forbiddenDirections: ['不得进入上界'],
        sourceSummary: '旧快照',
      },
      novel: { id: 'novel-1', title: '测试小说', genre: 'fantasy', synopsis: '王城危机', tags: [] },
      worldEntries: [entry],
      characters: [] as CharacterProfile[],
      summary: '王城秩序以宵禁为核心约束',
      timestamp: '2026-07-12T01:00:00.000Z',
    });

    expect(baseline.status).toBe('confirmed');
    expect(baseline.confirmedAt).toBe('2026-07-12T01:00:00.000Z');
    expect(baseline.promises).toEqual(['主角必须守住王城']);
    expect(baseline.canonicalWorldEntries).toEqual([
      expect.objectContaining({ name: '宵禁规则', constraints: ['日落后城门必须关闭'] }),
    ]);
    expect(buildBaselineContext(baseline)).toContain('提及时必须遵守，不要求本章全部出现');
    expect(buildBaselineContext(baseline)).toContain('违规者会被巡夜司扣押');
  });
});
