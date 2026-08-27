/**
 * 底部工具栏按钮配置
 * 定义哪些命令应该显示为底部工具栏的图标按钮
 */

export type BottomToolbarButtonId =
  | 'generate'
  | 'revise'
  | 'batch-generate'
  | 'batch-rewrite'
  | 'save'
  | 'finalize'
  | 'adaptation'
  | 'shuangwen-generate';

/**
 * 底部工具栏按钮顺序配置
 * 按照从左到右的顺序排列
 */
export const BOTTOM_TOOLBAR_BUTTON_ORDER: BottomToolbarButtonId[] = [
  'generate',
  'revise',
  'batch-generate',
  'batch-rewrite',
  'save',
  'finalize',
  'adaptation',
  'shuangwen-generate',
];

/**
 * 底部工具栏按钮的 tooltip 文本映射
 * 用于鼠标悬停时显示完整说明
 */
export const BOTTOM_TOOLBAR_BUTTON_TOOLTIP_MAP: Record<BottomToolbarButtonId, string> = {
  'generate': '生成新章节 (Ctrl+N)',
  'revise': '重写本章 (Alt+R)',
  'batch-generate': '批量生成章节',
  'batch-rewrite': '批量重写章节',
  'save': '保存当前章节 (Ctrl+S)',
  'finalize': '章节定稿',
  'adaptation': 'IP改编工作台',
  'shuangwen-generate': '爽文管线生成',
};

/**
 * 底部工具栏按钮的按钮类型映射
 * 对应 Element Plus 的 button type
 */
export const BOTTOM_TOOLBAR_BUTTON_TYPE_MAP: Record<BottomToolbarButtonId, 'primary' | 'success' | 'warning' | 'danger' | 'info' | ''> = {
  'generate': 'primary',
  'revise': 'primary',
  'batch-generate': 'primary',
  'batch-rewrite': 'primary',
  'save': 'success',
  'finalize': 'warning',
  'adaptation': 'info',
  'shuangwen-generate': 'danger',
};

/**
 * 底部工具栏按钮的 plain 属性映射
 */
export const BOTTOM_TOOLBAR_BUTTON_PLAIN_MAP: Record<BottomToolbarButtonId, boolean> = {
  'generate': false,
  'revise': true,
  'batch-generate': true,
  'batch-rewrite': true,
  'save': false,
  'finalize': false,
  'adaptation': true,
  'shuangwen-generate': false,
};
