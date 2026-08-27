/**
 * 功能开关配置
 * 用于区分开发者自用功能和线上服务功能
 */

export type FeatureCategory = 'public' | 'advanced' | 'internal';

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
 * 功能配置表
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
    billingEnabled: false, // TODO: M2 阶段接入
    description: '一键立项、爽文蓝图创建（计划商品化）',
  },
  'chapter-boost-package': {
    id: 'chapter-boost-package',
    label: '章节增强包',
    category: 'public',
    requiresAuth: true,
    requiresAdmin: false,
    billingEnabled: false, // TODO: M3 阶段接入
    description: '单章体检 + 修订闭环（计划商品化）',
  },
  'publish-pack-package': {
    id: 'publish-pack-package',
    label: '发布包装包',
    category: 'public',
    requiresAuth: true,
    requiresAdmin: false,
    billingEnabled: false, // TODO: M4 阶段接入
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
  'analytics': {
    id: 'analytics',
    label: '数据分析',
    category: 'internal',
    requiresAuth: true,
    requiresAdmin: true,
    billingEnabled: false,
    description: '运营分析工具',
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
};

/**
 * 检查功能是否可用
 */
function isFeatureAvailable(
  featureId: string,
  userRole: 'guest' | 'user' | 'admin' = 'guest'
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
  userRole: 'guest' | 'user' | 'admin' = 'guest',
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
