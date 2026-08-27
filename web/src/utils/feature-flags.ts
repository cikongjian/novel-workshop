/**
 * 前端功能开关工具
 * 与后端 src/config/feature-flags.ts 保持一致
 */

export type FeatureCategory = 'public' | 'advanced' | 'internal';
export type UserRole = 'guest' | 'user' | 'admin';

export interface FeatureConfig {
  id: string;
  label: string;
  category: FeatureCategory;
  requiresAuth: boolean;
  requiresAdmin: boolean;
  billingEnabled: boolean;
  description?: string;
}

/**
 * 功能配置表（与后端保持同步）
 */
export const FEATURE_FLAGS: Record<string, FeatureConfig> = {
  // ========== 线上服务（积分用户可用）==========
  'chapter-generate': {
    id: 'chapter-generate',
    label: '章节生成',
    category: 'public',
    requiresAuth: true,
    requiresAdmin: false,
    billingEnabled: true,
    description: '已接入积分限制的核心功能',
  },
  'chapter-revise': {
    id: 'chapter-revise',
    label: '章节修订',
    category: 'public',
    requiresAuth: true,
    requiresAdmin: false,
    billingEnabled: true,
    description: '已接入积分限制的核心功能',
  },
  'chapter-resize': {
    id: 'chapter-resize',
    label: '章节扩写/缩写',
    category: 'public',
    requiresAuth: true,
    requiresAdmin: false,
    billingEnabled: true,
    description: '已接入积分限制的核心功能',
  },
  'kickstart-package': {
    id: 'kickstart-package',
    label: '开书包',
    category: 'public',
    requiresAuth: true,
    requiresAdmin: false,
    billingEnabled: false,
    description: '一键立项、爽文蓝图创建（计划商品化）',
  },
  'chapter-boost-package': {
    id: 'chapter-boost-package',
    label: '章节增强包',
    category: 'public',
    requiresAuth: true,
    requiresAdmin: false,
    billingEnabled: false,
    description: '单章体检 + 修订闭环（计划商品化）',
  },
  'publish-pack-package': {
    id: 'publish-pack-package',
    label: '发布包装包',
    category: 'public',
    requiresAuth: true,
    requiresAdmin: false,
    billingEnabled: false,
    description: '书名、简介、营销文案生成（计划商品化）',
  },

  // ========== 进阶能力池（暂不对外售卖）==========
  'series-blueprint': {
    id: 'series-blueprint',
    label: '长篇策划',
    category: 'advanced',
    requiresAuth: true,
    requiresAdmin: false,
    billingEnabled: false,
    description: '百章蓝图，未完成商品化',
  },

  // ========== 开发者自用（不对外开放）==========
  'adaptation-studio': {
    id: 'adaptation-studio',
    label: 'IP改编',
    category: 'internal',
    requiresAuth: true,
    requiresAdmin: true,
    billingEnabled: false,
    description: '内部工具，不适合普通用户',
  },
  'cost-tracking': {
    id: 'cost-tracking',
    label: '成本追踪',
    category: 'internal',
    requiresAuth: true,
    requiresAdmin: true,
    billingEnabled: false,
    description: '运营数据，不对外',
  },
  'audiobook': {
    id: 'audiobook',
    label: '有声读物',
    category: 'internal',
    requiresAuth: true,
    requiresAdmin: true,
    billingEnabled: false,
    description: 'TTS合成，技术能力未完善',
  },
  'style-dna': {
    id: 'style-dna',
    label: '风格DNA',
    category: 'internal',
    requiresAuth: true,
    requiresAdmin: true,
    billingEnabled: false,
    description: '实验性功能',
  },
  'fact-graph': {
    id: 'fact-graph',
    label: '事实图谱',
    category: 'internal',
    requiresAuth: true,
    requiresAdmin: true,
    billingEnabled: false,
    description: '底层技术展示',
  },
  'plot-branch': {
    id: 'plot-branch',
    label: '剧情分支',
    category: 'internal',
    requiresAuth: true,
    requiresAdmin: true,
    billingEnabled: false,
    description: '复杂度高，未完成产品化',
  },
  'story-state': {
    id: 'story-state',
    label: '故事状态机',
    category: 'internal',
    requiresAuth: true,
    requiresAdmin: true,
    billingEnabled: false,
    description: '技术工具',
  },
  'universe-anchor': {
    id: 'universe-anchor',
    label: '宇宙锚点',
    category: 'internal',
    requiresAuth: true,
    requiresAdmin: true,
    billingEnabled: false,
    description: '系列小说高级功能，受众小',
  },
  'marketing': {
    id: 'marketing',
    label: '营销文案',
    category: 'internal',
    requiresAuth: true,
    requiresAdmin: true,
    billingEnabled: false,
    description: '营销文案生成工具',
  },
};

/**
 * 检查功能是否可用
 */
export function isFeatureAvailable(
  featureId: string,
  userRole: UserRole = 'guest'
): boolean {
  const feature = FEATURE_FLAGS[featureId];
  if (!feature) return false;

  // 内部功能只对管理员开放
  if (feature.category === 'internal' && userRole !== 'admin') {
    return false;
  }

  // 需要认证的功能
  if (feature.requiresAuth && userRole === 'guest') {
    return false;
  }

  // 需要管理员权限的功能
  if (feature.requiresAdmin && userRole !== 'admin') {
    return false;
  }

  return true;
}

/**
 * 获取用户可见的功能列表
 */
export function getAvailableFeatures(
  userRole: UserRole = 'guest',
  category?: FeatureCategory
): FeatureConfig[] {
  return Object.values(FEATURE_FLAGS).filter((feature) => {
    if (category && feature.category !== category) return false;
    return isFeatureAvailable(feature.id, userRole);
  });
}

/**
 * 获取功能的显示标签（带状态标识）
 */
export function getFeatureLabel(featureId: string): string {
  const feature = FEATURE_FLAGS[featureId];
  if (!feature) return featureId;

  const labels: string[] = [feature.label];

  if (feature.category === 'advanced') {
    labels.push('(进阶池)');
  } else if (feature.category === 'internal') {
    labels.push('(内部)');
  }

  if (!feature.billingEnabled && feature.category === 'public') {
    labels.push('(开发中)');
  }

  return labels.join(' ');
}

/**
 * 获取功能的状态标签和色调
 */
export function getFeatureStatus(featureId: string): {
  label?: string;
  tone?: 'success' | 'warning' | 'info';
} {
  const feature = FEATURE_FLAGS[featureId];
  if (!feature) return {};

  if (feature.category === 'advanced') {
    return { label: '进阶池', tone: 'warning' };
  }

  if (feature.billingEnabled && feature.category === 'public') {
    return { label: '商品', tone: 'success' };
  }

  return {};
}
