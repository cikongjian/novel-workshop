import { describe, expect, it } from 'vitest';
import { projectCharacterIdentityLabels } from './character-identity-labels.js';
import { CharacterProfile } from './types.js';

function buildCharacter() {
  const timestamp = new Date('2026-07-12T00:00:00.000Z').toISOString();
  return CharacterProfile.parse({
    id: '11111111-1111-4111-8111-111111111111',
    name: '测试角色',
    aliases: [],
    role: 'mentor',
    position: '藏书阁主',
    appearance: '',
    personality: '',
    personalityTraits: ['克制', '洞察敏锐'],
    speechStyle: '',
    speechExamples: [],
    backstory: '',
    motivation: '',
    abilities: [],
    relationships: [{
      targetId: '22222222-2222-4222-8222-222222222222',
      type: 'protector',
      description: '',
    }],
    arc: '',
    currentState: '',
    socialIdentity: {
      faction: '天衡书院',
      socialClass: '士族',
      reputation: '深藏不露',
    },
    tags: ['auto-extracted'],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

describe('projectCharacterIdentityLabels', () => {
  it('derives reader-facing labels from confirmed structured fields', () => {
    const labels = projectCharacterIdentityLabels(buildCharacter());
    expect(labels.map(item => item.label)).toEqual(expect.arrayContaining([
      '导师',
      '藏书阁主',
      '天衡书院',
      '士族',
      '克制',
      '守护关系',
    ]));
    expect(labels.some(item => item.label === 'auto-extracted')).toBe(false);
  });

  it('preserves user and AI labels while rebuilding derived labels', () => {
    const character = buildCharacter();
    character.identityLabels = [
      {
        key: 'reader:contrast',
        label: '反差型',
        category: 'reader',
        source: 'ai',
        confidence: 0.8,
      },
      {
        key: 'role:mentor',
        label: '幕后引路人',
        category: 'structural',
        source: 'user',
        confidence: 1,
        userLocked: true,
      },
    ];

    const labels = projectCharacterIdentityLabels(character);
    expect(labels.find(item => item.key === 'role:mentor')?.label).toBe('幕后引路人');
    expect(labels.some(item => item.label === '反差型')).toBe(true);
  });
});
