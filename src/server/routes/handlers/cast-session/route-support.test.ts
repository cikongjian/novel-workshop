import { describe, expect, it } from 'vitest';

import {
  buildCharacterFromProposal,
  evaluateSlotCoverage,
  normalizeCastSlots,
  parseProposalFromModel,
  toSlotCandidateFromProposal,
} from './route-support.js';

describe('cast session route support facade', () => {
  it('re-exports proposal parsing and slot coverage helpers', () => {
    const proposal = parseProposalFromModel(`{
      "characters": [
        { "name": "林昼", "role": "protagonist", "slot": "主角" },
        { "name": "沈烬", "role": "antagonist", "slot": "核心反派" },
        { "name": "顾遥", "role": "supporting", "slot": "关键盟友" }
      ],
      "powerSystem": [],
      "relationshipSeeds": []
    }`, 3);

    const slots = normalizeCastSlots(undefined);
    const coverage = evaluateSlotCoverage(
      slots,
      proposal.characters.map(toSlotCandidateFromProposal),
    );

    expect(coverage.passed).toBe(true);
    expect(coverage.missingRequired).toEqual([]);
  });

  it('re-exports persistence helpers for character creation', () => {
    const timestamp = '2026-03-21T00:00:00.000Z';
    const character = buildCharacterFromProposal({
      name: '林昼',
      aliases: ['阿昼', '林昼'],
      role: 'protagonist',
      tags: ['核心视角'],
      slot: '主角',
      motivation: '找到真相',
    }, timestamp);

    expect(character.name).toBe('林昼');
    expect(character.aliases).toEqual(['阿昼', '林昼']);
    expect(character.tags).toContain('cast-session');
    expect(character.tags).toContain('slot:主角');
    expect(character.createdAt).toBe(timestamp);
  });
});
