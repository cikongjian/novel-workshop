import { describe, expect, it } from 'vitest';
import { CharacterProfile } from './types.js';
import {
  applyOrphanRelationshipRepairs,
  planOrphanRelationshipRepairs,
} from './novel-relationship-repair.js';

function character(
  id: string,
  name: string,
  relationships: CharacterProfile['relationships'] = [],
): CharacterProfile {
  return CharacterProfile.parse({
    id,
    name,
    aliases: [],
    role: 'supporting',
    relationships,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  });
}

describe('orphan relationship repair', () => {
  it('remaps a missing target when the relationship names one existing character', () => {
    const source = character('11111111-1111-4111-8111-111111111111', '林总', [{
      targetId: '99999999-9999-4999-8999-999999999999',
      type: 'subordinate',
      description: '林总安排赵琳进入交付环节。',
    }]);
    const target = character('22222222-2222-4222-8222-222222222222', '赵琳');
    const plans = planOrphanRelationshipRepairs([source, target]);

    expect(plans).toEqual([expect.objectContaining({
      characterId: source.id,
      previousTargetId: '99999999-9999-4999-8999-999999999999',
      nextTargetId: target.id,
      targetName: '赵琳',
    })]);
    expect(applyOrphanRelationshipRepairs([source, target], plans)[0]?.relationships[0]?.targetId)
      .toBe(target.id);
  });

  it('does not guess when evidence names multiple possible targets', () => {
    const source = character('11111111-1111-4111-8111-111111111111', '林总', [{
      targetId: '99999999-9999-4999-8999-999999999999',
      type: 'enemy',
      description: '王总监和赵琳都公开反对林总。',
    }]);
    const first = character('22222222-2222-4222-8222-222222222222', '王总监');
    const second = character('33333333-3333-4333-8333-333333333333', '赵琳');

    expect(planOrphanRelationshipRepairs([source, first, second])).toEqual([]);
  });

  it('uses an unambiguous old-ID mapping to resolve another ambiguous description', () => {
    const oldTargetId = '99999999-9999-4999-8999-999999999999';
    const source = character('11111111-1111-4111-8111-111111111111', '林总', [{
      targetId: oldTargetId,
      type: 'ally',
      description: '林总与王总监发生裂痕，王总监转而支持宁瑶。',
    }]);
    const corroborating = character('44444444-4444-4444-8444-444444444444', '周姐', [{
      targetId: oldTargetId,
      type: 'ally',
      description: '周姐把数据交给王总监。',
    }]);
    const first = character('22222222-2222-4222-8222-222222222222', '王总监');
    const second = character('33333333-3333-4333-8333-333333333333', '宁瑶');

    const plans = planOrphanRelationshipRepairs([source, corroborating, first, second]);
    expect(plans).toHaveLength(2);
    expect(plans.every(plan => plan.nextTargetId === first.id)).toBe(true);
  });
});
