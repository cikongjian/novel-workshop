import { describe, expect, it } from 'vitest';
import { applyCharacterUpdate } from './finalize-merge-handlers.js';

function buildExisting() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: '沈砚',
    baseline: false,
    currentState: '[第1章] 初入京城。',
    backstory: '幼年离乡。',
    arc: '开始寻找真相。',
    abilities: [],
    personalityTraits: [],
    relationships: [],
    growthTrack: {
      milestones: [],
      archivedMilestonesSummary: '',
      unresolvedTrauma: [],
      pendingPromises: [],
    },
  };
}

describe('applyCharacterUpdate', () => {
  it('is idempotent when the same chapter is finalized repeatedly', () => {
    const action = {
      currentState: '[第2章] 决定追查旧案。',
      backstory: '得知父亲曾参与旧案。',
      arc: '开始主动承担风险。',
      growthTrack: {
        milestones: [{ chapter: 2, event: '接下旧案', insight: '逃避无法解决问题' }],
        unresolvedTrauma: [],
        pendingPromises: ['查清旧案'],
      },
    };

    const first = applyCharacterUpdate(buildExisting(), action, '2026-07-12T00:00:00.000Z');
    const second = applyCharacterUpdate(first, action, '2026-07-12T00:01:00.000Z');

    expect(second.currentState).toBe('[第1章] 初入京城。\n[第2章] 决定追查旧案。');
    expect(second.backstory).toBe('幼年离乡。\n得知父亲曾参与旧案。');
    expect(second.arc).toBe('开始寻找真相。\n开始主动承担风险。');
    expect(second.growthTrack.milestones).toHaveLength(1);
  });
});
