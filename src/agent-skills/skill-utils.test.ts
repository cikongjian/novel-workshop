import { describe, expect, it } from 'vitest';

import { matchesGenre, shouldAutoActivateManualSkill } from './skill-utils.js';
import type { AgentSkillDefinition } from './types.js';

function createSkill(targetGenres: string[]): AgentSkillDefinition {
  const now = new Date('2026-03-16T00:00:00.000Z').toISOString();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'test-skill',
    description: '',
    instruction: 'test',
    targetRoles: ['writer'],
    targetGenres,
    priority: 50,
    status: 'active',
    activation: 'auto',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('skill-utils genre matching', () => {
  it('treats modern and urban as aliases', () => {
    const skill = createSkill(['urban']);
    expect(matchesGenre(skill, 'modern')).toBe(true);
  });

  it('treats mystery and suspense as aliases', () => {
    const skill = createSkill(['suspense']);
    expect(matchesGenre(skill, 'mystery')).toBe(true);
  });

  it('auto-activates matching manual subgenre skills from novel card signals', () => {
    const skill: AgentSkillDefinition = {
      ...createSkill(['urban']),
      activation: 'manual',
      tags: ['commercial-pack', 'genre-layered', 'showbiz'],
    };

    expect(shouldAutoActivateManualSkill(skill, {
      genre: 'modern',
      novelTitle: '重生娱乐圈：开局绑定未来影帝',
      novelSynopsis: '女主靠试镜和热搜翻红。',
      novelTags: ['娱乐圈', '重生'],
      startupPlatformProfile: 'fanqie',
    })).toBe(true);
  });
});
