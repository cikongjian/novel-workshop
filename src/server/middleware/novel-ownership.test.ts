import { describe, expect, it } from 'vitest';
import {
  DEV_OWNER_ID,
  canAccessNovel,
  resolveActorId,
  resolveOwnerId,
} from './novel-ownership.js';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

describe('canAccessNovel', () => {
  it('允许所有者访问', () => {
    expect(canAccessNovel({ id: OWNER_ID }, { ownerId: OWNER_ID })).toBe(true);
  });

  it('拒绝其他普通用户访问', () => {
    expect(canAccessNovel({ id: OTHER_ID }, { ownerId: OWNER_ID })).toBe(false);
  });

  it('允许管理员访问他人小说', () => {
    expect(canAccessNovel({ id: OTHER_ID, role: 'admin' }, { ownerId: OWNER_ID })).toBe(true);
  });

  it('普通角色名不得当作管理员', () => {
    for (const role of ['user', 'Admin', 'ADMIN', 'administrator', '']) {
      expect(canAccessNovel({ id: OTHER_ID, role }, { ownerId: OWNER_ID })).toBe(false);
    }
  });

  it('认证关闭时虚拟用户可访问无归属小说', () => {
    expect(canAccessNovel(undefined, {})).toBe(true);
  });

  it('认证开启后普通用户不得访问无归属的历史小说', () => {
    // 早期数据没有 ownerId，归一化为 dev；真实用户 id 不等于 dev，必须拒绝
    expect(canAccessNovel({ id: OWNER_ID }, {})).toBe(false);
  });

  it('未认证请求不得访问已有归属的小说', () => {
    expect(canAccessNovel(undefined, { ownerId: OWNER_ID })).toBe(false);
  });

  it('无法用字面量 dev 冒充历史小说所有者以外的目标', () => {
    expect(canAccessNovel({ id: DEV_OWNER_ID }, { ownerId: OWNER_ID })).toBe(false);
  });
});

describe('resolveActorId', () => {
  it('缺少身份时回落到虚拟用户', () => {
    expect(resolveActorId(undefined)).toBe(DEV_OWNER_ID);
    expect(resolveActorId({})).toBe(DEV_OWNER_ID);
  });

  it('保留真实用户 id', () => {
    expect(resolveActorId({ id: OWNER_ID })).toBe(OWNER_ID);
  });
});

describe('resolveOwnerId', () => {
  it('缺少归属时回落到虚拟用户', () => {
    expect(resolveOwnerId({})).toBe(DEV_OWNER_ID);
  });

  it('保留真实归属 id', () => {
    expect(resolveOwnerId({ ownerId: OWNER_ID })).toBe(OWNER_ID);
  });
});
