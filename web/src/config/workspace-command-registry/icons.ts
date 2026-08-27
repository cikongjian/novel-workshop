import type { Component } from 'vue';
import {
  DocumentAdd,
  Edit,
  FolderAdd,
  Document,
  Check,
  Promotion,
  MagicStick,
  Search,
  QuestionFilled,
  FullScreen,
  Fold,
  Expand,
  Filter,
  Delete,
  ArrowLeft,
  ArrowRight,
  Operation,
  ChatLineSquare,
  Headset,
  Microphone,
  Tools,
  BrushFilled,
  DeleteFilled,
} from '@element-plus/icons-vue';

/**
 * 工作区命令图标映射表
 * 为每个命令 ID 配置对应的 Element Plus 图标组件
 */
export const WORKSPACE_COMMAND_ICON_MAP: Record<string, Component> = {
  // 章节操作
  'generate': DocumentAdd,
  'revise': Edit,
  'save': Document,
  'finalize': Check,
  'batch-generate': FolderAdd,
  'batch-rewrite': BrushFilled,

  // 改编与特殊功能
  'adaptation': Promotion,
  'shuangwen-generate': MagicStick,

  // 查找与帮助
  'find-replace': Search,
  'open-shortcut-help': QuestionFilled,
  'open-command-palette': Operation,

  // 布局控制
  'toggle-fullscreen': FullScreen,
  'layout-focus': Fold,
  'layout-balanced': Operation,
  'layout-review': Expand,
  'toggle-suggestions': ChatLineSquare,
  'toggle-comment-panel': Operation,
  'reset-inspector-width': Operation,

  // 章节导航与筛选
  'chapter-prev': ArrowLeft,
  'chapter-next': ArrowRight,
  'chapter-filter-all': Filter,
  'chapter-filter-active': Filter,
  'chapter-filter-finalized': Filter,
  'chapter-filter-clear': DeleteFilled,
  'toggle-chapter-density': Operation,
  'chapter-clear-preselect': Delete,

  // 版本与剧情
  'version-history': Document,
  'plot-explorer': Operation,
  'dialogue-polish': ChatLineSquare,

  // TTS 与音频
  'tts-play': Headset,
  'tts-regenerate': Microphone,
  'tts-batch': FolderAdd,
  'command-backfill': Tools,

  // 质量与清洗
  'command-curate-foreshadowing': MagicStick,
  'command-clean-quote': BrushFilled,

  // 面板打开
  'open-marketing-panel': Promotion,
};

/**
 * 获取命令对应的图标组件
 */
export function getCommandIcon(commandId: string): Component | undefined {
  return WORKSPACE_COMMAND_ICON_MAP[commandId];
}
