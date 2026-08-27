import { describe, expect, it } from 'vitest';
import {
  FEATURE_FLAGS,
  type UserRole,
  getAvailableFeatures,
  getFeatureLabel,
  getFeatureStatus,
  isFeatureAvailable,
} from './feature-flags';

const ROLES: UserRole[] = ['guest', 'user', 'admin'];

describe('isFeatureAvailable 门控不变量', () => {
  // 这些是数据驱动断言：以后往 FEATURE_FLAGS 加条目也会自动被覆盖
  it('未知功能一律拒绝（fail-closed）', () => {
    for (const role of ROLES) {
      expect(isFeatureAvailable('不存在的功能', role)).toBe(false);
      expect(isFeatureAvailable('', role)).toBe(false);
    }
  });

  it('internal 功能只对 admin 开放', () => {
    const internal = Object.values(FEATURE_FLAGS).filter((f) => f.category === 'internal');
    for (const feature of internal) {
      expect(isFeatureAvailable(feature.id, 'guest')).toBe(false);
      expect(isFeatureAvailable(feature.id, 'user')).toBe(false);
      expect(isFeatureAvailable(feature.id, 'admin')).toBe(true);
    }
  });

  it('requiresAdmin 功能不得对非 admin 开放', () => {
    const adminOnly = Object.values(FEATURE_FLAGS).filter((f) => f.requiresAdmin);
    for (const feature of adminOnly) {
      expect(isFeatureAvailable(feature.id, 'guest')).toBe(false);
      expect(isFeatureAvailable(feature.id, 'user')).toBe(false);
    }
  });

  it('requiresAuth 功能不得对 guest 开放', () => {
    const authOnly = Object.values(FEATURE_FLAGS).filter((f) => f.requiresAuth);
    for (const feature of authOnly) {
      expect(isFeatureAvailable(feature.id, 'guest')).toBe(false);
    }
  });

  it('默认角色按 guest 处理', () => {
    const authOnly = Object.values(FEATURE_FLAGS).find((f) => f.requiresAuth);
    if (!authOnly) return;
    expect(isFeatureAvailable(authOnly.id)).toBe(false);
  });

  it('admin 可用集合是 user 的超集，user 是 guest 的超集', () => {
    const ids = (role: UserRole) => new Set(getAvailableFeatures(role).map((f) => f.id));
    const guest = ids('guest');
    const user = ids('user');
    const admin = ids('admin');
    for (const id of guest) expect(user.has(id)).toBe(true);
    for (const id of user) expect(admin.has(id)).toBe(true);
  });
});

describe('FEATURE_FLAGS 配置表自身一致性', () => {
  it('非空且 key 与 id 一致', () => {
    const entries = Object.entries(FEATURE_FLAGS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, feature] of entries) {
      expect(feature.id).toBe(key);
    }
  });

  it('每项都有非空 label 与合法 category', () => {
    for (const feature of Object.values(FEATURE_FLAGS)) {
      expect(feature.label.trim().length).toBeGreaterThan(0);
      expect(['public', 'advanced', 'internal']).toContain(feature.category);
    }
  });

  it('requiresAdmin 的项必须同时 requiresAuth，否则门控自相矛盾', () => {
    for (const feature of Object.values(FEATURE_FLAGS)) {
      if (feature.requiresAdmin) expect(feature.requiresAuth).toBe(true);
    }
  });
});

describe('getAvailableFeatures', () => {
  it('按分类过滤时只返回该分类', () => {
    for (const category of ['public', 'advanced', 'internal'] as const) {
      const list = getAvailableFeatures('admin', category);
      for (const feature of list) expect(feature.category).toBe(category);
    }
  });

  it('guest 拿不到 internal 分类的任何项', () => {
    expect(getAvailableFeatures('guest', 'internal')).toEqual([]);
  });

  it('返回项与逐个判定结果一致', () => {
    for (const role of ROLES) {
      for (const feature of getAvailableFeatures(role)) {
        expect(isFeatureAvailable(feature.id, role)).toBe(true);
      }
    }
  });
});

describe('getFeatureLabel', () => {
  it('未知功能原样返回 id', () => {
    expect(getFeatureLabel('未知功能')).toBe('未知功能');
  });

  it('advanced 标注进阶池', () => {
    const advanced = Object.values(FEATURE_FLAGS).find((f) => f.category === 'advanced');
    if (!advanced) return;
    expect(getFeatureLabel(advanced.id)).toContain('进阶池');
  });

  it('internal 标注内部', () => {
    const internal = Object.values(FEATURE_FLAGS).find((f) => f.category === 'internal');
    if (!internal) return;
    expect(getFeatureLabel(internal.id)).toContain('内部');
  });

  it('所有已知项的标签都包含其 label', () => {
    for (const feature of Object.values(FEATURE_FLAGS)) {
      expect(getFeatureLabel(feature.id)).toContain(feature.label);
    }
  });
});

describe('getFeatureStatus', () => {
  it('未知功能返回空对象', () => {
    expect(getFeatureStatus('未知功能')).toEqual({});
  });

  it('advanced 返回 warning 色调', () => {
    const advanced = Object.values(FEATURE_FLAGS).find((f) => f.category === 'advanced');
    if (!advanced) return;
    expect(getFeatureStatus(advanced.id)).toEqual({ label: '进阶池', tone: 'warning' });
  });

  it('已计费的 public 返回 success 色调', () => {
    const billed = Object.values(FEATURE_FLAGS).find(
      (f) => f.category === 'public' && f.billingEnabled,
    );
    if (!billed) return;
    expect(getFeatureStatus(billed.id)).toEqual({ label: '商品', tone: 'success' });
  });

  it('返回的 tone 只能是约定的三种', () => {
    for (const feature of Object.values(FEATURE_FLAGS)) {
      const status = getFeatureStatus(feature.id);
      if (status.tone) expect(['success', 'warning', 'info']).toContain(status.tone);
    }
  });
});
