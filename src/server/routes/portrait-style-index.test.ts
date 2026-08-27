import { describe, expect, it, vi } from 'vitest';
import { ROLE_ATTIRE_INDEX } from './portrait-role-attire-index.js';

vi.mock('./portrait-role-attire-catalog.js', () => ({
  getMergedRoleAttireEntries: () => ROLE_ATTIRE_INDEX,
}));

import { buildPortraitStyleIndex } from './portrait-style-index.js';

describe('portrait style index', () => {
  it('builds an imperial portrait index from role signals', () => {
    const styleIndex = buildPortraitStyleIndex({
      name: '萧承泽',
      role: '主角',
      gender: '男',
      position: '太子',
      personality: '冷静克制',
    } as any);

    expect(styleIndex.roleAttire.id).toBe('cn-crown-prince');
    expect(styleIndex.layerHits.find(item => item.layer === 'era')?.key).toBe('cn-imperial');
    expect(styleIndex.layerHits.find(item => item.layer === 'expression')?.key).toBe('composed');
  });

  it('marks manual era overrides in the output', () => {
    const styleIndex = buildPortraitStyleIndex(
      {
        name: '林岚',
        role: '配角',
        position: '律师',
      } as any,
      { eraKey: 'sci-fi' },
    );

    expect(styleIndex.overrides.eraManual).toBe(true);
    expect(styleIndex.overrides.eraKey).toBe('sci-fi');
    expect(styleIndex.layerHits.find(item => item.layer === 'era')?.summary).toContain('手动覆盖');
  });

  it('applies manual role attire overrides without changing the output shape', () => {
    const styleIndex = buildPortraitStyleIndex(
      {
        name: '沈砚',
        role: '配角',
        position: '医生',
      } as any,
      { roleAttireId: 'modern-police' },
    );

    expect(styleIndex.roleAttire.id).toBe('modern-police');
    expect(styleIndex.overrides.roleAttireManual).toBe(true);
    expect(styleIndex.roleAttire.resolutionReason).toContain('手动覆盖角色服饰词典');
  });
});
