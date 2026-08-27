export type ShortcutHelpRegistryItem = {
  key: string;
  action: string;
  description: string;
  commandId?: string;
};

export type ShortcutHelpRegistryGroup = {
  id: string;
  label: string;
  items: ShortcutHelpRegistryItem[];
};

export const WORKSPACE_SHORTCUT_HELP_BUILTIN_COMMAND_IDS = [
  'open-command-palette',
  'open-operation-center',
  'open-shortcut-help',
] as const;

export const WORKSPACE_SHORTCUT_HELP_GROUPS: ShortcutHelpRegistryGroup[] = [
  {
    id: 'global',
    label: '全局入口',
    items: [
      { key: 'Ctrl+K', action: '命令面板', description: '搜索并执行命令', commandId: 'open-command-palette' },
      { key: 'Ctrl+.', action: '操作中心', description: '分组操作面板（支持置顶/最近）', commandId: 'open-operation-center' },
      { key: '? / F1', action: '快捷键总览', description: '打开本面板', commandId: 'open-shortcut-help' },
    ],
  },
  {
    id: 'editing',
    label: '编辑操作',
    items: [
      { key: 'Ctrl+N', action: '生成新章节', description: '创建下一章草稿', commandId: 'generate' },
      { key: 'Alt+R', action: '修订当前章节', description: '按反馈重写当前章节', commandId: 'revise' },
      { key: 'Ctrl+S', action: '保存章节', description: '保存当前编辑内容', commandId: 'save' },
      { key: 'Ctrl+F', action: '查找替换', description: '打开查找替换面板', commandId: 'find-replace' },
      { key: 'Ctrl+Shift+R', action: '重写选中片段', description: '仅重写当前选中文本（局部）' },
      { key: 'Ctrl+Enter', action: 'AI 续写', description: '触发 AI 接续写作' },
    ],
  },
  {
    id: 'chapter',
    label: '章节导航',
    items: [
      { key: 'Alt+[ / Alt+]', action: '上一章 / 下一章', description: '快速切换章节' },
      { key: 'J / K', action: '下一章 / 上一章', description: '非输入状态下切章' },
      { key: '↑ / ↓', action: '章节预选', description: '在左侧章节树移动预选' },
      { key: 'Home / End', action: '首章 / 末章预选', description: '快速跳边界' },
      { key: 'PgUp / PgDn', action: '跨步预选', description: '每次按 5 章跳转' },
      { key: 'Enter', action: '打开预选章节', description: '进入当前预选章节' },
      { key: 'Delete', action: '删除预选章节', description: '仍需确认弹窗' },
      { key: 'Esc', action: '清除章节预选', description: '清除左侧章节树预选高亮', commandId: 'chapter-clear-preselect' },
    ],
  },
  {
    id: 'layout',
    label: '布局控制',
    items: [
      { key: 'Ctrl+B', action: '章节栏开关', description: '展开/收起左侧章节栏', commandId: 'toggle-sidebar' },
      { key: 'F11', action: '全屏切换', description: '进入/退出全屏写作', commandId: 'toggle-fullscreen' },
    ],
  },
];
