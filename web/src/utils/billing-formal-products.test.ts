import { describe, expect, it } from 'vitest';
import type { BillingRule } from '../api/billing';
import {
  estimateRuleRequiredPoints,
  findBillingFormalProduct,
  findBillingRule,
  findEnabledBillingRule,
  resolveBillingFormalProducts,
  resolveChapterBoostTitle,
} from './billing-formal-products';

function rule(overrides: Partial<BillingRule> = {}): BillingRule {
  return {
    code: 'rule.code',
    title: '规则',
    description: '',
    category: 'generation',
    chargeMode: 'per_call',
    unitPricePoints: 10,
    minPoints: 5,
    enabled: true,
    ...overrides,
  };
}

/** 构造最小可用配置，只覆盖被测字段 */
function config(rules: BillingRule[], bindings: Record<string, string> = {}, presentation?: Record<string, string>) {
  return {
    rules,
    operationBindings: {
      generateChapterRuleCode: bindings.generate ?? '',
      reviseChapterRuleCode: bindings.revise ?? '',
      resizeChapterRuleCode: bindings.resize ?? '',
    },
    productPresentation: presentation,
  } as unknown as Parameters<typeof resolveBillingFormalProducts>[0];
}

describe('findBillingRule', () => {
  it('按 code 命中', () => {
    const target = rule({ code: 'pkg.kickstart' });
    expect(findBillingRule(config([target]), 'pkg.kickstart')).toBe(target);
  });

  it('配置或 code 缺失时返回 null', () => {
    expect(findBillingRule(null, 'x')).toBeNull();
    expect(findBillingRule(undefined, 'x')).toBeNull();
    expect(findBillingRule(config([rule()]), null)).toBeNull();
    expect(findBillingRule(config([rule()]), '')).toBeNull();
  });

  it('未命中返回 null', () => {
    expect(findBillingRule(config([rule({ code: 'a' })]), 'b')).toBeNull();
  });

  it('停用的规则也能被按 code 取到', () => {
    const disabled = rule({ code: 'a', enabled: false });
    expect(findBillingRule(config([disabled]), 'a')).toBe(disabled);
  });
});

describe('findEnabledBillingRule', () => {
  it('只返回启用的规则', () => {
    const disabled = rule({ code: 'a', enabled: false });
    const enabled = rule({ code: 'b', enabled: true });
    expect(findEnabledBillingRule(config([disabled, enabled]), ['a', 'b'])).toBe(enabled);
  });

  it('候选全部停用时返回 null', () => {
    expect(findEnabledBillingRule(config([rule({ code: 'a', enabled: false })]), ['a'])).toBeNull();
  });

  it('配置缺失或候选为空时返回 null', () => {
    expect(findEnabledBillingRule(null, ['a'])).toBeNull();
    expect(findEnabledBillingRule(config([rule()]), [])).toBeNull();
  });
});

describe('estimateRuleRequiredPoints', () => {
  it('取 minPoints 与单价的较大值', () => {
    expect(estimateRuleRequiredPoints(rule({ minPoints: 30, unitPricePoints: 10 }))).toBe(30);
    expect(estimateRuleRequiredPoints(rule({ minPoints: 5, unitPricePoints: 25 }))).toBe(25);
  });

  it('两者相等时返回该值', () => {
    expect(estimateRuleRequiredPoints(rule({ minPoints: 12, unitPricePoints: 12 }))).toBe(12);
  });

  it('规则缺失时返回 null', () => {
    expect(estimateRuleRequiredPoints(null)).toBeNull();
    expect(estimateRuleRequiredPoints(undefined)).toBeNull();
  });

  it('零值不被当作缺失', () => {
    expect(estimateRuleRequiredPoints(rule({ minPoints: 0, unitPricePoints: 0 }))).toBe(0);
  });
});

describe('resolveChapterBoostTitle', () => {
  it('优先使用配置下发的标题', () => {
    expect(resolveChapterBoostTitle(config([], {}, { chapterBoostTitle: '自定义包' }))).toBe('自定义包');
  });

  it('标题为空白时回落到默认名', () => {
    expect(resolveChapterBoostTitle(config([], {}, { chapterBoostTitle: '   ' }))).toBe('章节增强包');
    expect(resolveChapterBoostTitle(config([]))).toBe('章节增强包');
    expect(resolveChapterBoostTitle(null)).toBe('章节增强包');
  });
});

describe('resolveBillingFormalProducts', () => {
  it('始终返回三个固定商品', () => {
    const products = resolveBillingFormalProducts(null);
    expect(products.map((item) => item.id)).toEqual(['kickstart', 'chapter-boost', 'publish-pack']);
  });

  it('配置为空时全部为待开放且不可用', () => {
    for (const product of resolveBillingFormalProducts(null)) {
      expect(product.enabled).toBe(false);
      expect(product.status).toBe('coming');
      expect(product.requiredPoints).toBeNull();
    }
  });

  it('开书包规则启用后标记为已上线', () => {
    const products = resolveBillingFormalProducts(
      config([rule({ code: 'pkg.kickstart', title: '开书包', enabled: true, minPoints: 80 })]),
    );
    const kickstart = products.find((item) => item.id === 'kickstart');
    expect(kickstart?.status).toBe('available');
    expect(kickstart?.enabled).toBe(true);
    expect(kickstart?.requiredPoints).toBe(80);
  });

  it('开书包缺失时回退到能力规则', () => {
    const products = resolveBillingFormalProducts(
      config([rule({ code: 'cap.project-init', title: '立项', enabled: true })]),
    );
    expect(products.find((item) => item.id === 'kickstart')?.enabled).toBe(true);
  });

  it('章节包三个绑定全启用时为已上线', () => {
    const rules = [
      rule({ code: 'r.gen', enabled: true }),
      rule({ code: 'r.rev', enabled: true }),
      rule({ code: 'r.res', enabled: true }),
    ];
    const products = resolveBillingFormalProducts(
      config(rules, { generate: 'r.gen', revise: 'r.rev', resize: 'r.res' }),
    );
    const boost = products.find((item) => item.id === 'chapter-boost');
    expect(boost?.status).toBe('available');
    expect(boost?.enabled).toBe(true);
    expect(boost?.bindings).toHaveLength(3);
  });

  it('章节包部分启用时为部分可用且整体不可用', () => {
    const rules = [
      rule({ code: 'r.gen', enabled: true }),
      rule({ code: 'r.rev', enabled: false }),
    ];
    const products = resolveBillingFormalProducts(
      config(rules, { generate: 'r.gen', revise: 'r.rev', resize: 'r.missing' }),
    );
    const boost = products.find((item) => item.id === 'chapter-boost');
    expect(boost?.status).toBe('partial');
    expect(boost?.enabled).toBe(false);
  });

  it('按千字计费的规则价格文案标注千字', () => {
    const products = resolveBillingFormalProducts(
      config([rule({ code: 'pkg.kickstart', chargeMode: 'per_1k_chars', enabled: true, minPoints: 20 })]),
    );
    expect(products.find((item) => item.id === 'kickstart')?.priceText).toContain('千字');
  });

  it('未开放时价格文案为兜底文本', () => {
    const products = resolveBillingFormalProducts(null);
    expect(products.find((item) => item.id === 'kickstart')?.priceText).toBe('未开放');
    expect(products.find((item) => item.id === 'chapter-boost')?.priceText).toBe('按配置计费');
  });

  it('规则标题为空白时使用默认商品名', () => {
    const products = resolveBillingFormalProducts(
      config([rule({ code: 'pkg.kickstart', title: '   ', enabled: true })]),
    );
    expect(products.find((item) => item.id === 'kickstart')?.title).toBe('开书包');
  });

  it('每个商品的状态与状态标签都非空', () => {
    for (const product of resolveBillingFormalProducts(null)) {
      expect(['available', 'partial', 'coming']).toContain(product.status);
      expect(product.statusLabel.length).toBeGreaterThan(0);
      expect(product.title.length).toBeGreaterThan(0);
    }
  });
});

describe('findBillingFormalProduct', () => {
  it('按 id 取到对应商品', () => {
    expect(findBillingFormalProduct(null, 'publish-pack')?.id).toBe('publish-pack');
  });

  it('三个 id 都能取到', () => {
    for (const id of ['kickstart', 'chapter-boost', 'publish-pack'] as const) {
      expect(findBillingFormalProduct(null, id)).not.toBeNull();
    }
  });
});
