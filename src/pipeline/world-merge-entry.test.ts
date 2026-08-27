import { describe, expect, it } from 'vitest';
import type { WorldEntry } from '../novel/types.js';
import {
  buildCreatedWorldEntryFromMerge,
  buildUpdatedWorldEntryFromMerge,
  isFactionActionForKnownCharacter,
} from './world-merge-entry.js';

const timestamp = '2026-07-12T00:00:00.000Z';

function makeEntry(overrides: Partial<WorldEntry> = {}): WorldEntry {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    category: 'rule',
    name: '旧规则',
    description: '旧描述',
    details: { narrativeFunction: '旧功能' },
    dependencies: [],
    conflicts: [],
    relatedEntries: [],
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('world merge entry persistence', () => {
  it('persists structured fields when creating an entry', () => {
    const entry = buildCreatedWorldEntryFromMerge({
      name: '禁火令',
      category: 'rule',
      description: '城内不得公开使用火系术法。',
      storyRole: 'constraint',
      constraints: ['日落后生效'],
      consequences: ['违者会被巡夜司追捕'],
      details: {
        narrativeFunction: '迫使主角放弃最强技能',
        hardness: 0.9,
      },
    }, 3, timestamp, '22222222-2222-4222-8222-222222222222');

    expect(entry.storyRole).toBe('constraint');
    expect(entry.constraints).toEqual(['日落后生效']);
    expect(entry.consequences).toEqual(['违者会被巡夜司追捕']);
    expect(entry.details).toEqual({
      narrativeFunction: '迫使主角放弃最强技能',
      hardness: '0.9',
    });
  });

  it('merges structured fields without dropping existing metadata', () => {
    const entry = buildUpdatedWorldEntryFromMerge(makeEntry({
      constraints: ['不能在雨中生效'],
      consequences: ['施术者会虚弱'],
    }), {
      name: '新规则名',
      storyRole: 'conflict',
      constraints: ['每次只能持续十息', '不能在雨中生效'],
      consequences: ['会暴露位置'],
      details: { resourceCost: '一枚火晶' },
    }, timestamp);

    expect(entry.name).toBe('新规则名');
    expect(entry.storyRole).toBe('conflict');
    expect(entry.constraints).toEqual(['不能在雨中生效', '每次只能持续十息']);
    expect(entry.consequences).toEqual(['施术者会虚弱', '会暴露位置']);
    expect(entry.details).toEqual({
      narrativeFunction: '旧功能',
      resourceCost: '一枚火晶',
    });
  });

  it('protects baseline core fields and stores description changes as appendix', () => {
    const entry = buildUpdatedWorldEntryFromMerge(makeEntry({ baseline: true }), {
      name: '被覆盖的名称',
      category: 'power',
      description: '本章发现的新信息',
      details: { narrativeFunction: '制造新冲突' },
    }, timestamp);

    expect(entry.name).toBe('旧规则');
    expect(entry.category).toBe('rule');
    expect(entry.description).toBe('旧描述');
    expect(entry.details.baselineAppendix).toBe('本章发现的新信息');
    expect(entry.details.narrativeFunction).toBe('制造新冲突');
  });

  it('ignores invalid categories, story roles, arrays, and nested details', () => {
    const entry = buildCreatedWorldEntryFromMerge({
      name: '条目',
      category: 'invalid',
      storyRole: 'invalid',
      constraints: '不是数组',
      details: { valid: true, nested: { value: 'ignored' } },
    }, 1, timestamp, '33333333-3333-4333-8333-333333333333');

    expect(entry.category).toBe('other');
    expect(entry.storyRole).toBeUndefined();
    expect(entry.constraints).toBeUndefined();
    expect(entry.details).toEqual({ valid: 'true' });
  });

  it('detects a known character misclassified as a faction', () => {
    const knownCharacters = new Set(['钱叔', '张虎']);

    expect(isFactionActionForKnownCharacter({
      name: '钱叔',
      category: 'faction',
    }, knownCharacters)).toBe(true);
    expect(isFactionActionForKnownCharacter({
      name: '钱家',
      category: 'faction',
    }, knownCharacters)).toBe(false);
  });
});
