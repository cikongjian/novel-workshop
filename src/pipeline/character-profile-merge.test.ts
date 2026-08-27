import { describe, expect, it } from 'vitest';
import {
  mergeArchivedMilestoneSummary,
  mergeChapterHistory,
  mergeDistinctText,
  mergeGrowthMilestones,
} from './character-profile-merge.js';

describe('character profile merge helpers', () => {
  it('keeps one latest state per chapter across repeated finalization', () => {
    const existing = [
      '[第1章] 初到宗门。',
      '[第2章] 旧状态。',
      '[第2章] 重复状态。',
    ].join('\n');

    expect(mergeChapterHistory(existing, '[第2章] 新状态。')).toBe([
      '[第1章] 初到宗门。',
      '[第2章] 新状态。',
    ].join('\n'));
  });

  it('only accepts the latest chapter when an agent returns full history', () => {
    expect(mergeChapterHistory(
      '[第1章] 已确认事实。',
      '[第1章] 过期复述。\n[第3章] 作出新的选择。',
    )).toBe('[第1章] 已确认事实。\n[第3章] 作出新的选择。');
  });

  it('deduplicates repeated free text and milestone archives', () => {
    expect(mergeDistinctText('旧事揭晓', '旧事揭晓\n新的线索')).toBe('旧事揭晓\n新的线索');
    expect(mergeArchivedMilestoneSummary('第1章: 觉醒', '第1章: 觉醒；第2章: 受挫'))
      .toBe('第1章: 觉醒; 第2章: 受挫');
  });

  it('replaces the milestone for the same chapter', () => {
    expect(mergeGrowthMilestones(
      [{ chapter: 2, event: '旧事件', insight: '' }],
      [{ chapter: 2, event: '新事件', insight: '不再逃避' }],
    )).toEqual([{ chapter: 2, event: '新事件', insight: '不再逃避' }]);
  });
});
