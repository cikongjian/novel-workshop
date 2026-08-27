import { describe, expect, it, vi } from 'vitest';
import type { WorldEntry } from '../novel/types.js';
import { auditChapterNarrativeUsage } from './narrative-audit.js';
import { buildWorldUsageUpdates, persistWorldUsageUpdates } from './world-usage-tracker.js';

function makeEntry(index: number, overrides: Partial<WorldEntry> = {}): WorldEntry {
  return {
    id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
    category: 'geography',
    name: `地点${index}`,
    description: `第${index}个长期地点设定，用于测试世界知识积累。`,
    details: {},
    dependencies: [],
    conflicts: [],
    relatedEntries: [],
    tags: [],
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('world usage tracking', () => {
  it('audits and records effective usage beyond the first 24 world entries', () => {
    const entries = Array.from({ length: 25 }, (_, index) => makeEntry(index + 1));
    entries[24] = makeEntry(25, {
      name: '北境封锁线',
      storyRole: 'constraint',
      constraints: ['没有军令不得越过封锁线'],
      consequences: ['擅自越界会被边军扣押'],
    });
    const audit = auditChapterNarrativeUsage({
      chapterContent: '北境封锁线前，没有军令不得越过。他若擅自越界，就会被边军扣押。',
      worldEntries: entries,
      characters: [],
    });

    const updates = buildWorldUsageUpdates({
      entries,
      audit,
      chapterNumber: 8,
      timestamp: '2026-07-12T01:00:00.000Z',
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.entry).toEqual(expect.objectContaining({
      name: '北境封锁线',
      introducedIn: 8,
      lastUsedIn: 8,
      useCount: 1,
      tags: ['chapter-8'],
    }));
  });

  it('does not record name-only mentions or contradicted rules', () => {
    const entry = makeEntry(1, {
      category: 'rule',
      name: '宵禁规则',
      storyRole: 'constraint',
      constraints: ['日落后城门必须关闭'],
      consequences: ['违规者会被巡夜司扣押'],
      baseline: true,
      tags: ['approved'],
    });

    for (const chapterContent of [
      '墙上只写着宵禁规则四个字。',
      '宵禁规则形同虚设，城门彻夜敞开，守卫任人通行。',
      '宵禁规则虽然造成阻碍，却已被废除，城门仍然彻夜敞开，任何人都能通过。',
    ]) {
      const audit = auditChapterNarrativeUsage({ chapterContent, worldEntries: [entry], characters: [] });
      expect(buildWorldUsageUpdates({ entries: [entry], audit, chapterNumber: 3 })).toEqual([]);
    }
  });

  it('is idempotent when the same chapter is persisted again', async () => {
    const entry = makeEntry(1, {
      category: 'rule',
      name: '宵禁规则',
      storyRole: 'constraint',
      constraints: ['日落后城门必须关闭'],
      tags: ['chapter-3'],
      introducedIn: 3,
      lastUsedIn: 3,
      useCount: 1,
    });
    const audit = auditChapterNarrativeUsage({
      chapterContent: '宵禁规则生效，日落后城门必须关闭。',
      worldEntries: [entry],
      characters: [],
    });
    const saveEntry = vi.fn().mockResolvedValue(undefined);

    const updates = await persistWorldUsageUpdates({
      entries: [entry],
      audit,
      chapterNumber: 3,
      saveEntry,
    });

    expect(updates[0]?.entry.useCount).toBe(1);
    expect(updates[0]?.entry.tags.filter(tag => tag === 'chapter-3')).toHaveLength(1);
    expect(saveEntry).toHaveBeenCalledOnce();
  });
});
