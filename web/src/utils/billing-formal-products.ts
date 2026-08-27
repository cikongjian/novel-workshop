import type { BillingPricingCatalog, BillingRule, BillingSystemConfig } from '../api/billing';

export type BillingFormalProductId = 'kickstart' | 'chapter-boost' | 'publish-pack';
export type BillingFormalProductStatus = 'available' | 'partial' | 'coming';

type BillingFormalBindingSnapshot = {
  action: 'generate' | 'revise' | 'resize';
  label: string;
  rule: BillingRule | null;
  title: string;
  enabled: boolean;
  requiredPoints: number | null;
};

type BillingFormalProductSnapshot = {
  id: BillingFormalProductId;
  title: string;
  status: BillingFormalProductStatus;
  statusLabel: string;
  enabled: boolean;
  requiredPoints: number | null;
  priceText: string;
  rule: BillingRule | null;
  bindings: BillingFormalBindingSnapshot[];
};

type BillingLikeConfig = BillingPricingCatalog | BillingSystemConfig;

export function findBillingRule(config: BillingLikeConfig | null | undefined, code: string | null | undefined): BillingRule | null {
  if (!config || !code) return null;
  return config.rules.find((rule) => rule.code === code) ?? null;
}

export function findEnabledBillingRule(config: BillingLikeConfig | null | undefined, codes: string[]): BillingRule | null {
  if (!config) return null;
  return config.rules.find((rule) => codes.includes(rule.code) && rule.enabled) ?? null;
}

export function estimateRuleRequiredPoints(rule: BillingRule | null | undefined): number | null {
  if (!rule) return null;
  return Math.max(rule.minPoints, rule.unitPricePoints);
}

export function resolveChapterBoostTitle(config: BillingLikeConfig | null | undefined): string {
  return config?.productPresentation?.chapterBoostTitle?.trim() || '章节增强包';
}

function formatRulePrice(rule: BillingRule | null | undefined, fallback: string): string {
  const requiredPoints = estimateRuleRequiredPoints(rule);
  if (!requiredPoints) return fallback;
  if (rule?.chargeMode === 'per_1k_chars') {
    return `${requiredPoints} 积分 / 千字起`;
  }
  return `${requiredPoints} 积分起`;
}

function buildChapterBoostBindings(config: BillingLikeConfig | null | undefined): BillingFormalBindingSnapshot[] {
  const generateRule = findBillingRule(config, config?.operationBindings.generateChapterRuleCode);
  const reviseRule = findBillingRule(config, config?.operationBindings.reviseChapterRuleCode);
  const resizeRule = findBillingRule(config, config?.operationBindings.resizeChapterRuleCode);

  return [
    {
      action: 'generate',
      label: '生成',
      rule: generateRule,
      title: generateRule?.title?.trim() || '未绑定',
      enabled: Boolean(generateRule?.enabled),
      requiredPoints: estimateRuleRequiredPoints(generateRule),
    },
    {
      action: 'revise',
      label: '修订',
      rule: reviseRule,
      title: reviseRule?.title?.trim() || '未绑定',
      enabled: Boolean(reviseRule?.enabled),
      requiredPoints: estimateRuleRequiredPoints(reviseRule),
    },
    {
      action: 'resize',
      label: '缩扩写',
      rule: resizeRule,
      title: resizeRule?.title?.trim() || '未绑定',
      enabled: Boolean(resizeRule?.enabled),
      requiredPoints: estimateRuleRequiredPoints(resizeRule),
    },
  ];
}

export function resolveBillingFormalProducts(config: BillingLikeConfig | null | undefined): BillingFormalProductSnapshot[] {
  const kickstartRule = findBillingRule(config, 'pkg.kickstart') ?? findEnabledBillingRule(config, ['cap.project-init']);
  const publishRule = findBillingRule(config, 'pkg.publish-pack') ?? findEnabledBillingRule(config, ['cap.marketing-copy']);
  const chapterBindings = buildChapterBoostBindings(config);
  const chapterEnabledCount = chapterBindings.filter((item) => item.enabled).length;
  const chapterPrimaryRule = chapterBindings[0]?.rule ?? null;

  return [
    {
      id: 'kickstart',
      title: kickstartRule?.title?.trim() || '开书包',
      status: kickstartRule?.enabled ? 'available' : 'coming',
      statusLabel: kickstartRule?.enabled ? '已上线' : '待开放',
      enabled: Boolean(kickstartRule?.enabled),
      requiredPoints: estimateRuleRequiredPoints(kickstartRule),
      priceText: formatRulePrice(kickstartRule, '未开放'),
      rule: kickstartRule,
      bindings: [],
    },
    {
      id: 'chapter-boost',
      title: resolveChapterBoostTitle(config),
      status: chapterEnabledCount === 3 ? 'available' : chapterEnabledCount > 0 ? 'partial' : 'coming',
      statusLabel: chapterEnabledCount === 3 ? '已上线' : chapterEnabledCount > 0 ? '部分可用' : '待开放',
      enabled: chapterEnabledCount === 3,
      requiredPoints: chapterBindings[0]?.requiredPoints ?? null,
      priceText: formatRulePrice(chapterPrimaryRule, '按配置计费'),
      rule: chapterPrimaryRule,
      bindings: chapterBindings,
    },
    {
      id: 'publish-pack',
      title: publishRule?.title?.trim() || '发布包装包',
      status: publishRule?.enabled ? 'available' : 'coming',
      statusLabel: publishRule?.enabled ? '已上线' : '筹备中',
      enabled: Boolean(publishRule?.enabled),
      requiredPoints: estimateRuleRequiredPoints(publishRule),
      priceText: formatRulePrice(publishRule, '未开放'),
      rule: publishRule,
      bindings: [],
    },
  ];
}

export function findBillingFormalProduct(
  config: BillingLikeConfig | null | undefined,
  id: BillingFormalProductId,
): BillingFormalProductSnapshot | null {
  return resolveBillingFormalProducts(config).find((item) => item.id === id) ?? null;
}
