import { describe, expect, it } from 'vitest';
import {
  getDefaultRoleAttireEntry,
  matchRoleAttireEntryWithIndex,
  ROLE_ATTIRE_INDEX,
} from './portrait-role-attire-index.js';

describe('portrait role attire index', () => {
  it('matches imperial signals to the crown prince entry', () => {
    const match = matchRoleAttireEntryWithIndex('宫廷太子，准备继承皇位', ROLE_ATTIRE_INDEX);

    expect(match.matched).toBe(true);
    expect(match.entry.id).toBe('cn-crown-prince');
    expect(match.preferredEras).toContain('ancient-cn');
    expect(match.matchedKeywords).toContain('太子');
  });

  it('uses era hints to prefer modern professional roles', () => {
    const match = matchRoleAttireEntryWithIndex('现代公司里的ceo，处理商业危机', ROLE_ATTIRE_INDEX);

    expect(match.matched).toBe(true);
    expect(match.entry.id).toBe('modern-ceo');
    expect(match.preferredEras).toContain('modern');
  });

  it('matches xianxia identities from the shared index', () => {
    const match = matchRoleAttireEntryWithIndex('修仙宗门长老，负责传功', ROLE_ATTIRE_INDEX);

    expect(match.matched).toBe(true);
    expect(match.entry.id).toBe('xianxia-elder');
    expect(match.preferredEras).toContain('xianxia');
  });

  it('falls back to the default entry when no keyword matches', () => {
    const fallback = getDefaultRoleAttireEntry();
    const match = matchRoleAttireEntryWithIndex('神秘旅人，身份未知', ROLE_ATTIRE_INDEX);

    expect(match.matched).toBe(false);
    expect(match.entry).toEqual(fallback);
    expect(match.resolutionReason).toContain('未命中身份词典关键词');
  });
});
