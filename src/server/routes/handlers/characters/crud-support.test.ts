import { describe, expect, it, vi } from 'vitest';
import {
  buildCharacterV2Fields,
  buildCreatedCharacter,
  buildDeprecatedCharacterRouteMessage,
  buildUpdatedCharacter,
  isNotFoundLikeError,
  tryIndexCharacter,
} from './crud-support.js';

describe('character crud support', () => {
  it('builds character v2 fields with speech style inference', () => {
    const fields = buildCharacterV2Fields({
      motivation: '查明真相',
      personalityTraits: ['冷静'],
      speechStyle: '沉稳克制',
    });

    expect(fields.drives.want).toBe('查明真相');
    expect(fields.personalityModel.traits).toEqual(['冷静']);
    expect(fields.speechDNA.tempo).toBe('slow');
    expect(fields.ttsProfile.baseVoice).toBe('default');
  });

  it('builds created and updated character payloads', () => {
    const created = buildCreatedCharacter({
      data: {
        name: '陆焰',
        role: 'protagonist',
        motivation: '复盘旧案',
        speechStyle: '激动时语速很快',
      },
      now: '2026-03-23T00:00:00.000Z',
    });

    const updated = buildUpdatedCharacter({
      existing: created,
      patch: {
        speechStyle: '沉稳克制',
        tags: ['核心角色'],
      },
      now: '2026-03-23T01:00:00.000Z',
    });

    expect(created.name).toBe('陆焰');
    expect(created.speechDNA?.tempo).toBe('fast');
    expect(updated.createdAt).toBe('2026-03-23T00:00:00.000Z');
    expect(updated.updatedAt).toBe('2026-03-23T01:00:00.000Z');
    expect(updated.tags).toEqual(['核心角色']);
    expect(updated.speechDNA?.tempo).toBe('fast');
  });

  it('indexes character safely and exposes deprecated route messages', async () => {
    const indexCharacter = vi.fn();
    await tryIndexCharacter({ indexCharacter } as any, 'novel-1', { id: 'c1' } as any);
    await tryIndexCharacter(undefined, 'novel-1', { id: 'c1' } as any);

    expect(indexCharacter).toHaveBeenCalledOnce();
    expect(buildDeprecatedCharacterRouteMessage('state-history').error).toContain('已废弃');
    expect(buildDeprecatedCharacterRouteMessage('consistency-report').error).toContain('已废弃');
  });

  it('detects not-found-like character errors', () => {
    expect(isNotFoundLikeError('角色不存在')).toBe(true);
    expect(isNotFoundLikeError('validation failed')).toBe(false);
  });
});
