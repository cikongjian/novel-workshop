import type { Settings } from '../api/settings';

export type ToggleType = 'boolean' | 'enum' | 'number';

export type ToggleCategory =
  | 'creation'
  | 'quality'
  | 'world'
  | 'user'
  | 'content'
  | 'experiment'
  | 'system'
  | 'operation';

export interface ToggleMeta {
  key: keyof Settings;
  label: string;
  category: ToggleCategory;
  type: ToggleType;
  description?: string;
  enumOptions?: { value: string; label: string }[];
  numberMin?: number;
  numberMax?: number;
  numberStep?: number;
  group?: string;
  experiment?: boolean;
  danger?: boolean;
  isParam?: boolean;
}

export const CATEGORY_META: Record<ToggleCategory, { label: string; desc: string; icon: string }> = {
  creation: {
    label: '创作功能',
    desc: '小说创作流程相关的功能开关',
    icon: 'EditPen',
  },
  quality: {
    label: '质量控制',
    desc: '质量门禁、AI 痕迹检测、角色一致性',
    icon: 'CircleCheckFilled',
  },
  world: {
    label: '世界观系统',
    desc: '世界观协议、检索、大纲门禁',
    icon: 'Connection',
  },
  user: {
    label: '用户与账户',
    desc: '注册策略、密码规则、实名认证',
    icon: 'UserFilled',
  },
  content: {
    label: '内容运营',
    desc: '评论、书城、朋友圈、通知',
    icon: 'ChatDotRound',
  },
  experiment: {
    label: '实验功能',
    desc: '正在内测的新功能，关闭即无痕',
    icon: 'MagicStick',
  },
  system: {
    label: '系统集成',
    desc: '邮件、内容审核、外部服务',
    icon: 'SetUp',
  },
  operation: {
    label: '运营配置',
    desc: '首页配置、邮件服务、内容审核',
    icon: 'Tools',
  },
};

export const ADMIN_TOGGLES: ToggleMeta[] = [
  // ==================== 创作功能 ====================
  {
    key: 'modelStreamingEnabled',
    label: '流式输出',
    category: 'creation',
    type: 'boolean',
    description: '启用 SSE 流式输出，提升创作响应感知速度',
    group: 'AI 模型',
  },
  {
    key: 'superLongModeEnabled',
    label: '超长模式',
    category: 'creation',
    type: 'boolean',
    description: '支持超长文本生成，消耗更多 token',
    group: '生成能力',
    experiment: true,
  },
  {
    key: 'truthFilesEnabled',
    label: '真相档案',
    category: 'creation',
    type: 'boolean',
    description: '章节生成时自动整理关键事实档案',
    group: '生成能力',
  },
  {
    key: 'structuredAuditEnabled',
    label: '结构化审核',
    category: 'creation',
    type: 'boolean',
    description: '对生成内容进行结构化质量审核',
    group: '生成能力',
  },
  {
    key: 'snapshotEnabled',
    label: '快照功能',
    category: 'creation',
    type: 'boolean',
    description: '支持章节快照与版本回溯',
    group: '生成能力',
  },
  {
    key: 'autoRevisionEnabled',
    label: '自动修订',
    category: 'creation',
    type: 'boolean',
    description: '质量不达标时自动触发修订流程',
    group: '自动优化',
  },
  {
    key: 'qualityFloorRevisionEnabled',
    label: '强制质量地板修订',
    category: 'creation',
    type: 'boolean',
    description: '关闭自动修订时，命中低分/停滞仍强制重写（很费时，默认关闭提速）',
    group: '自动优化',
  },
  {
    key: 'autoCurateEnabled',
    label: '自动定稿梳理',
    category: 'creation',
    type: 'boolean',
    description: '生成后自动梳理定稿内容',
    group: '自动优化',
  },
  {
    key: 'autoFinalizeEnabled',
    label: '生成后自动定稿',
    category: 'creation',
    type: 'boolean',
    description: '章节生成完成后自动定稿，提取角色/世界/剧情上下文并入库（默认开启）',
    group: '自动优化',
  },
  {
    key: 'authorNoteEnabled',
    label: '作者备注',
    category: 'creation',
    type: 'boolean',
    description: '支持在章节中添加作者备注',
    group: '辅助功能',
  },
  {
    key: 'chapterLengthGuardEnabled',
    label: '章节长度守卫',
    category: 'creation',
    type: 'boolean',
    description: '自动检测并调整章节长度',
    group: '辅助功能',
  },

  // ==================== 质量控制 ====================
  {
    key: 'antiAiTellsEnabled',
    label: '负面清单检测',
    category: 'quality',
    type: 'boolean',
    description: '检测 AI 写作常见负面痕迹',
    group: 'AI 痕迹规避',
  },
  {
    key: 'antiAiStructureEnabled',
    label: '结构性检测',
    category: 'quality',
    type: 'boolean',
    description: '检测 AI 写作结构模式化问题',
    group: 'AI 痕迹规避',
  },
  {
    key: 'qualityGateMode',
    label: '质量门禁',
    category: 'quality',
    type: 'enum',
    description: '整体质量门禁强度',
    group: '门禁模式',
    enumOptions: [
      { value: 'off', label: '关闭' },
      { value: 'warn', label: '警告' },
      { value: 'strict', label: '严格' },
    ],
  },
  {
    key: 'qualityGateStrictFallbackToWarn',
    label: '严格模式降级',
    category: 'quality',
    type: 'boolean',
    description: '严格模式判定失败时降级为警告',
    group: '门禁模式',
  },
  {
    key: 'continuityGateMode',
    label: '连续性门禁',
    category: 'quality',
    type: 'enum',
    description: '前后文连续性检查强度',
    group: '门禁模式',
    enumOptions: [
      { value: 'off', label: '关闭' },
      { value: 'warn', label: '警告' },
      { value: 'strict', label: '严格' },
    ],
  },
  {
    key: 'continuityGateStrictFallbackToWarn',
    label: '连续性降级',
    category: 'quality',
    type: 'boolean',
    description: '连续性严格模式失败时降级',
    group: '门禁模式',
  },
  {
    key: 'powerRuleGateMode',
    label: '战力规则门禁',
    category: 'quality',
    type: 'enum',
    description: '战力体系一致性检查强度',
    group: '门禁模式',
    enumOptions: [
      { value: 'off', label: '关闭' },
      { value: 'warn', label: '警告' },
      { value: 'strict', label: '严格' },
    ],
  },
  {
    key: 'powerRuleGateStrictFallbackToWarn',
    label: '战力规则降级',
    category: 'quality',
    type: 'boolean',
    description: '战力规则严格模式失败时降级',
    group: '门禁模式',
  },
  {
    key: 'aiTraceGateMode',
    label: 'AI 追溯',
    category: 'quality',
    type: 'enum',
    description: 'AI 写作痕迹追溯强度',
    group: '门禁模式',
    enumOptions: [
      { value: 'off', label: '关闭' },
      { value: 'warn', label: '警告' },
      { value: 'strict', label: '严格' },
    ],
  },

  // ==================== 世界观系统 ====================
  {
    key: 'worldContractEnabled',
    label: '世界观协议',
    category: 'world',
    type: 'boolean',
    description: '启用世界观协议约束生成内容',
    group: '世界观',
  },
  {
    key: 'worldGateMode',
    label: '世界观门禁',
    category: 'world',
    type: 'enum',
    description: '世界观一致性检查强度',
    group: '世界观',
    enumOptions: [
      { value: 'off', label: '关闭' },
      { value: 'warn', label: '警告' },
      { value: 'strict', label: '严格' },
    ],
  },
  {
    key: 'worldGateStrictFallbackToWarn',
    label: '世界观降级',
    category: 'world',
    type: 'boolean',
    description: '世界观严格模式失败时降级',
    group: '世界观',
  },
  {
    key: 'worldRetrievalV2Enabled',
    label: '世界观检索 V2',
    category: 'world',
    type: 'boolean',
    description: '启用新一代世界观检索算法',
    group: '世界观',
    experiment: true,
  },
  {
    key: 'outlineGateMode',
    label: '大纲门禁',
    category: 'world',
    type: 'enum',
    description: '大纲遵循度检查强度',
    group: '大纲',
    enumOptions: [
      { value: 'off', label: '关闭' },
      { value: 'warn', label: '警告' },
      { value: 'strict', label: '严格' },
    ],
  },
  {
    key: 'outlineGateStrictFallbackToWarn',
    label: '大纲降级',
    category: 'world',
    type: 'boolean',
    description: '大纲严格模式失败时降级',
    group: '大纲',
  },

  // ==================== 用户与账户 ====================
  {
    key: 'registrationProtectionEnabled',
    label: '注册保护',
    category: 'user',
    type: 'boolean',
    description: '启用注册频率限制，防刷号',
    group: '注册防护',
  },
  {
    key: 'disableCoverUpload',
    label: '关闭手动封面上传',
    category: 'user',
    type: 'boolean',
    description: '仅允许 AI 生成封面，从源头杜绝违规图片',
    group: '内容安全',
    danger: true,
  },
  {
    key: 'userApiFeatureEnabled',
    label: '用户自带 API',
    category: 'user',
    type: 'boolean',
    description: '允许用户配置自己的 API Key',
    group: '用户 API',
  },
  {
    key: 'userApiAllowPlatformCache',
    label: '平台缓存用户 API',
    category: 'user',
    type: 'boolean',
    description: '允许平台缓存用户 API 配置',
    group: '用户 API',
  },
  {
    key: 'userApiAllowLocalOnly',
    label: '仅本地使用用户 API',
    category: 'user',
    type: 'boolean',
    description: '用户 API 仅在本地浏览器生效',
    group: '用户 API',
  },
  {
    key: 'realNameVerificationEnabled',
    label: '实名认证',
    category: 'user',
    type: 'boolean',
    description: '启用实名认证功能',
    group: '实名认证',
  },
  {
    key: 'realNameRequiredForComment',
    label: '评论需实名',
    category: 'user',
    type: 'boolean',
    description: '发表评论前必须完成实名认证',
    group: '实名认证',
  },
  {
    key: 'realNameRequiredForCreatorApplication',
    label: '申请创作者需实名',
    category: 'user',
    type: 'boolean',
    description: '申请创作者身份前必须完成实名认证',
    group: '实名认证',
  },
  {
    key: 'realNameRequiredForBookPublishing',
    label: '发布书籍需实名',
    category: 'user',
    type: 'boolean',
    description: '发布作品到书城前必须完成实名认证',
    group: '实名认证',
  },
  {
    key: 'realNameRequiredForBilling',
    label: '计费需实名',
    category: 'user',
    type: 'boolean',
    description: '使用付费功能前必须完成实名认证',
    group: '实名认证',
  },
  {
    key: 'authPasswordRequireLowercase',
    label: '小写字母',
    category: 'user',
    type: 'boolean',
    description: '密码必须包含小写字母',
    group: '密码策略',
  },
  {
    key: 'authPasswordRequireUppercase',
    label: '大写字母',
    category: 'user',
    type: 'boolean',
    description: '密码必须包含大写字母',
    group: '密码策略',
  },
  {
    key: 'authPasswordRequireNumbers',
    label: '数字',
    category: 'user',
    type: 'boolean',
    description: '密码必须包含数字',
    group: '密码策略',
  },
  {
    key: 'authPasswordRequireSpecialChars',
    label: '特殊字符',
    category: 'user',
    type: 'boolean',
    description: '密码必须包含特殊字符',
    group: '密码策略',
  },

  // ==================== 内容运营 ====================
  {
    key: 'commentEnabled',
    label: '评论功能',
    category: 'content',
    type: 'boolean',
    description: '全局开关评论功能',
    group: '互动功能',
  },
  {
    key: 'momentsIdleCooldownHours',
    label: '朋友圈空窗保护',
    category: 'content',
    type: 'number',
    description: '角色朋友圈发布冷却时间（小时，0=不限制）',
    group: '互动功能',
    numberMin: 0,
    numberMax: 168,
    numberStep: 1,
  },

  // ==================== 实验功能 ====================
  {
    key: 'comicChapterEnabled',
    label: '章节漫画',
    category: 'experiment',
    type: 'boolean',
    description: '移动端章节漫画功能（实验中），关闭即无痕',
    group: '漫画',
    experiment: true,
    danger: true,
  },
  {
    key: 'audiobookAccessMode',
    label: 'AI 广播剧',
    category: 'experiment',
    type: 'enum',
    description: 'AI 广播剧/有声书功能访问权限控制',
    group: '广播剧',
    experiment: true,
    enumOptions: [
      { value: 'off', label: '关闭' },
      { value: 'admin', label: '仅管理员' },
      { value: 'on', label: '所有登录用户' },
    ],
  },

  // ==================== 系统集成 ====================
  {
    key: 'smtpSecure',
    label: 'SMTP SSL',
    category: 'system',
    type: 'boolean',
    description: '邮件服务使用 SSL 加密连接',
    group: '邮件服务',
  },

  // ==================== 质量门禁参数 ====================
  {
    key: 'characterGuardrailMinConflictRate',
    label: '冲突率阈值',
    category: 'quality',
    type: 'number',
    description: '角色一致性检测的最小冲突率阈值',
    group: '角色一致性',
    numberMin: 0,
    numberMax: 1,
    numberStep: 0.01,
    isParam: true,
  },
  {
    key: 'characterGuardrailMinHumanityRate',
    label: '人性化率阈值',
    category: 'quality',
    type: 'number',
    description: '角色对话的最小人性化率阈值',
    group: '角色一致性',
    numberMin: 0,
    numberMax: 1,
    numberStep: 0.01,
    isParam: true,
  },
  {
    key: 'characterGuardrailMinStabilityScore',
    label: '稳定性分数',
    category: 'quality',
    type: 'number',
    description: '角色行为稳定性的最小分数阈值',
    group: '角色一致性',
    numberMin: 0,
    numberMax: 10,
    numberStep: 0.1,
    isParam: true,
  },
  {
    key: 'antiTemplateRepeatedOpenerMinCount',
    label: '重复开头阈值',
    category: 'quality',
    type: 'number',
    description: '检测重复开头的最小次数阈值',
    group: '去模板化',
    numberMin: 1,
    numberMax: 20,
    numberStep: 1,
    isParam: true,
  },
  {
    key: 'antiTemplateRepeatedClicheMinCount',
    label: '重复套路阈值',
    category: 'quality',
    type: 'number',
    description: '检测重复套路的最小次数阈值',
    group: '去模板化',
    numberMin: 1,
    numberMax: 20,
    numberStep: 1,
    isParam: true,
  },
  {
    key: 'antiTemplateLookbackChapters',
    label: '回溯章节数',
    category: 'quality',
    type: 'number',
    description: '去模板化检测回溯的章节数量',
    group: '去模板化',
    numberMin: 1,
    numberMax: 10,
    numberStep: 1,
    isParam: true,
  },

  // ==================== 运营配置 ====================
  {
    key: 'contentAuditProvider',
    label: '内容审核供应商',
    category: 'operation',
    type: 'enum',
    description: '内容安全审核的服务提供商',
    group: '内容审核',
    enumOptions: [
      { value: '', label: '未配置' },
      { value: 'baidu', label: '百度内容审核' },
      { value: 'aliyun', label: '阿里云内容安全' },
    ],
    isParam: true,
  },
  {
    key: 'contentAuditPassThreshold',
    label: '审核通过阈值',
    category: 'operation',
    type: 'number',
    description: '内容审核的通过分数阈值（0-100）',
    group: '内容审核',
    numberMin: 0,
    numberMax: 100,
    numberStep: 1,
    isParam: true,
  },
  {
    key: 'contentAuditBlockThreshold',
    label: '审核封禁阈值',
    category: 'operation',
    type: 'number',
    description: '内容审核的封禁分数阈值（0-100）',
    group: '内容审核',
    numberMin: 0,
    numberMax: 100,
    numberStep: 1,
    isParam: true,
  },
];

export function getTogglesByCategory(category: ToggleCategory): ToggleMeta[] {
  return ADMIN_TOGGLES.filter((t) => t.category === category);
}

export function getTogglesByGroup(category: ToggleCategory, group: string): ToggleMeta[] {
  return ADMIN_TOGGLES.filter((t) => t.category === category && t.group === group);
}

export function getGroupsByCategory(category: ToggleCategory): string[] {
  const groups = new Set<string>();
  ADMIN_TOGGLES.forEach((t) => {
    if (t.category === category && t.group) {
      groups.add(t.group);
    }
  });
  return Array.from(groups);
}

export function getToggleByKey(key: keyof Settings): ToggleMeta | undefined {
  return ADMIN_TOGGLES.find((t) => t.key === key);
}
