/**
 * 工作区导航 items 的唯一定义源。
 * NovelLayout 和 ChapterWorkspace 共用，避免两边不同步。
 */
import type { Component } from 'vue';
import {
  Reading,
  User,
  MapLocation,
  List,
  Document,
  Promotion,
  ArrowLeft,
  MagicStick,
  Coin,
  Connection,
  CollectionTag,
  Share,
  Headset,
  DataLine,
  Link,
  Notebook,
} from '@element-plus/icons-vue';

export type WorkspaceNavItem = {
  id: string;
  label: string;
  title: string;
  icon: Component;
  featureId?: string;
};

/** 上半区：页面导航 */
export const ACTIVITY_ITEMS: WorkspaceNavItem[] = [
  { id: 'chapters', label: '章节', title: '章节工作台', icon: Reading },
  { id: 'universe', label: '宇宙', title: '宇宙主页', icon: CollectionTag },
  { id: 'adaptation', label: '改编', title: 'IP改编工作台', icon: Promotion, featureId: 'adaptation-studio' },
  { id: 'outline', label: '大纲', title: '大纲编辑', icon: List },
  { id: 'constitution', label: '宪章', title: '创作宪章', icon: Document },
  { id: 'world', label: '世界', title: '世界观编辑', icon: MapLocation },
  { id: 'characters', label: '角色', title: '角色管理', icon: User },
];

/** 下半区：工具抽屉 */
export const TOOL_ITEMS: WorkspaceNavItem[] = [
  { id: 'tool-home', label: '返回', title: '返回首页', icon: ArrowLeft },
  { id: 'tool-marketing', label: '包装', title: '发布包装包（正式商品）', icon: Promotion, featureId: 'marketing' },
  { id: 'tool-style-dna', label: '文风', title: '风格DNA', icon: MagicStick, featureId: 'style-dna' },
  { id: 'tool-cost', label: '成本', title: '成本追踪', icon: Coin, featureId: 'cost-tracking' },
  { id: 'tool-fact-graph', label: '图谱', title: '事实图谱', icon: Connection, featureId: 'fact-graph' },
  { id: 'tool-plot-branch', label: '分支', title: '剧情分支', icon: Share, featureId: 'plot-branch' },
  { id: 'tool-audiobook', label: '听书', title: '有声读物', icon: Headset, featureId: 'audiobook' },
  { id: 'tool-story-state', label: '状态', title: '故事状态机', icon: DataLine, featureId: 'story-state' },
  { id: 'tool-anchor', label: '锚点', title: '宇宙锚点', icon: Link, featureId: 'universe-anchor' },
  { id: 'tool-blueprint', label: '策划', title: '长篇策划（进阶能力池）', icon: Notebook, featureId: 'series-blueprint' },
];

/** 桌面端侧边栏菜单（path 路由用） */
export const SIDEBAR_MENU_ITEMS: { path: string; label: string; icon: Component; featureId?: string }[] = [
  { path: 'chapters', label: '章节工作台', icon: Reading },
  { path: 'universe', label: '宇宙主页', icon: CollectionTag },
  { path: 'characters', label: '角色管理', icon: User },
  { path: 'world', label: '世界观', icon: MapLocation },
  { path: 'outline', label: '大纲', icon: List },
  { path: 'constitution', label: '创作宪章', icon: Document },
  { path: 'adaptation', label: 'IP改编', icon: Promotion, featureId: 'adaptation-studio' },
];

/** contextLabelMap — 用于面包屑/标题 */
export const CONTEXT_LABEL_MAP: Record<string, string> = {
  chapters: '章节工作台',
  universe: '宇宙主页',
  characters: '角色管理',
  world: '世界观',
  outline: '大纲',
  constitution: '创作宪章',
  adaptation: 'IP改编',
};
