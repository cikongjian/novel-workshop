import { computed, type ComputedRef, type Ref } from 'vue';
import { isFeatureAvailable, type UserRole } from '../utils/feature-flags';

type ChapterSidebarFilter = 'all' | 'active' | 'finalized';
type WorkspaceDomain = 'chapters' | 'outline' | 'world' | 'characters' | 'settings';
type WorkspaceLayoutPreset = 'focus' | 'balanced' | 'review';

export type WorkspaceCommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  shortcut?: string;
  disabled?: boolean;
  featureId?: string;
};

export function useWorkspaceCommandItems(options: {
  currentChapter: Ref<unknown | null>;
  currentChapterNum: Ref<number | null>;
  isGenerating: ComputedRef<boolean>;
  batchRunning: ComputedRef<boolean>;
  hasUnsavedChanges: () => boolean;
  previousChapterNumber: ComputedRef<number | null>;
  nextChapterNumber: ComputedRef<number | null>;
  chapterSidebarCollapsed: Ref<boolean>;
  isDesktop: ComputedRef<boolean>;
  activeWorkspaceDomain: Ref<WorkspaceDomain>;
  chapterSidebarFilter: Ref<ChapterSidebarFilter>;
  chapterSidebarFilterActive: ComputedRef<boolean>;
  chapterSidebarDense: Ref<boolean>;
  chapterSidebarKeyboardFocusChapter: Ref<number | null>;
  workspaceLayoutPreset: Ref<WorkspaceLayoutPreset>;
  smartSuggestionsCollapsed: Ref<boolean>;
  showSmartSuggestions: ComputedRef<boolean>;
  commentPanelCollapsed: Ref<boolean>;
  chapterCount: ComputedRef<number>;
  userRole: ComputedRef<UserRole>;
}) {
  return computed<WorkspaceCommandItem[]>(() => {
    const hasChapter = Boolean(options.currentChapter.value);
    const hasChapterNum = Boolean(options.currentChapterNum.value);
    const generating = options.isGenerating.value;
    const isAdmin = options.userRole.value === 'admin';

    const allCommands: WorkspaceCommandItem[] = [
      { id: 'generate', title: '生成新章节', subtitle: '创建下一章草稿', shortcut: 'Ctrl+N', keywords: ['新章节', '生成'] },
      {
        id: 'revise',
        title: '修订当前章节',
        subtitle: '基于反馈进行重写',
        shortcut: 'Alt+R',
        disabled: !hasChapter || generating,
        keywords: ['修订', '重写'],
      },
      {
        id: 'save',
        title: '保存章节',
        subtitle: hasChapter ? '保存当前编辑内容' : '当前无可保存章节',
        shortcut: 'Ctrl+S',
        disabled: !hasChapter,
        keywords: ['保存', '草稿'],
      },
      {
        id: 'finalize',
        title: '章节定稿',
        subtitle: '执行定稿与专家管线',
        disabled: !hasChapter || options.hasUnsavedChanges(),
        keywords: ['定稿', '发布'],
      },
      {
        id: 'tts-play',
        title: 'TTS 播报',
        subtitle: isAdmin ? '优先播放已合成缓存（否则合成）' : '使用当前浏览器本机语音朗读',
        disabled: !hasChapter,
        keywords: ['播报', '语音', 'tts'],
        featureId: 'audiobook',
      },
      {
        id: 'tts-regenerate',
        title: isAdmin ? 'TTS 重新合成' : 'TTS 重新合成（仅管理员）',
        subtitle: isAdmin ? '清理缓存后重播' : '普通用户走浏览器本机朗读，不提供服务端重合成',
        disabled: !hasChapter || !isAdmin,
        keywords: ['tts', '重合成'],
        featureId: 'audiobook',
      },
      {
        id: 'tts-batch',
        title: isAdmin ? 'TTS 批量排队' : 'TTS 批量排队（仅管理员）',
        subtitle: isAdmin ? '选择章节批量合成播报' : '普通用户不提供服务端批量合成队列',
        disabled: !hasChapter || generating || !isAdmin,
        keywords: ['tts', '批量', '排队'],
        featureId: 'audiobook',
      },
      {
        id: 'batch-generate',
        title: '批量生成章节',
        subtitle: '批量队列生成',
        disabled: options.batchRunning.value || generating,
        keywords: ['批量', '生成'],
      },
      {
        id: 'version-history',
        title: '版本历史',
        subtitle: '查看并回滚历史版本',
        disabled: !hasChapterNum,
        keywords: ['版本', '回滚'],
      },
      {
        id: 'plot-explorer',
        title: '剧情探索',
        subtitle: '生成剧情分支建议',
        disabled: !hasChapterNum || generating,
        keywords: ['剧情', '分支'],
      },
      {
        id: 'find-replace',
        title: '查找替换',
        subtitle: '打开查找面板',
        shortcut: 'Ctrl+F',
        keywords: ['查找', '替换'],
      },
      {
        id: 'publish-preview',
        title: '发布预览',
        subtitle: '查看去除标记的干净文本',
        disabled: !hasChapter,
        keywords: ['发布', '预览', '干净', '标记', '去除'],
      },
      {
        id: 'open-shortcut-help',
        title: '快捷键总览',
        subtitle: '查看快捷键清单并快速执行动作',
        shortcut: '? / F1',
        keywords: ['快捷键', '帮助', '键位', 'hotkey'],
      },
      {
        id: 'chapter-prev',
        title: '上一章',
        subtitle: options.previousChapterNumber.value ? `切换到第 ${options.previousChapterNumber.value} 章` : '已是第一章',
        shortcut: 'Alt+[',
        disabled: options.previousChapterNumber.value === null,
        keywords: ['章节', '上一章', '上一个'],
      },
      {
        id: 'chapter-next',
        title: '下一章',
        subtitle: options.nextChapterNumber.value ? `切换到第 ${options.nextChapterNumber.value} 章` : '已是最后一章',
        shortcut: 'Alt+]',
        disabled: options.nextChapterNumber.value === null,
        keywords: ['章节', '下一章', '下一个'],
      },
      {
        id: 'toggle-sidebar',
        title: options.chapterSidebarCollapsed.value ? '展开章节侧栏' : '收起章节侧栏',
        subtitle: '切换左侧章节栏',
        shortcut: 'Ctrl+B',
        disabled: !options.isDesktop.value || options.activeWorkspaceDomain.value !== 'chapters',
        keywords: ['侧栏', '章节列表', '布局'],
      },
      {
        id: 'chapter-filter-all',
        title: `章节筛选：全部${options.chapterSidebarFilter.value === 'all' ? '（当前）' : ''}`,
        subtitle: '章节栏显示全部章节',
        disabled: options.activeWorkspaceDomain.value !== 'chapters',
        keywords: ['章节', '筛选', '全部'],
      },
      {
        id: 'chapter-filter-active',
        title: `章节筛选：进行中${options.chapterSidebarFilter.value === 'active' ? '（当前）' : ''}`,
        subtitle: '仅显示未定稿章节',
        disabled: options.activeWorkspaceDomain.value !== 'chapters',
        keywords: ['章节', '筛选', '进行中', '未定稿'],
      },
      {
        id: 'chapter-filter-finalized',
        title: `章节筛选：已定稿${options.chapterSidebarFilter.value === 'finalized' ? '（当前）' : ''}`,
        subtitle: '仅显示已定稿章节',
        disabled: options.activeWorkspaceDomain.value !== 'chapters',
        keywords: ['章节', '筛选', '已定稿'],
      },
      {
        id: 'chapter-filter-clear',
        title: '清空章节检索',
        subtitle: '清空章节栏关键词与筛选',
        disabled: options.activeWorkspaceDomain.value !== 'chapters' || !options.chapterSidebarFilterActive.value,
        keywords: ['章节', '筛选', '清空'],
      },
      {
        id: 'toggle-chapter-density',
        title: options.chapterSidebarDense.value ? '章节列表：标准密度' : '章节列表：紧凑密度',
        subtitle: options.chapterSidebarDense.value ? '展开章节副信息，降低压缩度' : '提高每屏可见章节数量',
        disabled: options.activeWorkspaceDomain.value !== 'chapters',
        keywords: ['章节', '密度', '紧凑', '标准'],
      },
      {
        id: 'chapter-clear-preselect',
        title: '章节预选：清除',
        subtitle: '清除左侧章节列表键盘预选高亮',
        shortcut: 'Esc',
        disabled: options.activeWorkspaceDomain.value !== 'chapters' || options.chapterSidebarKeyboardFocusChapter.value === null,
        keywords: ['章节', '预选', '清除', 'esc'],
      },
      {
        id: 'layout-focus',
        title: `布局预设：专注写作${options.workspaceLayoutPreset.value === 'focus' ? '（当前）' : ''}`,
        subtitle: '隐藏右侧检查区，聚焦正文编辑',
        keywords: ['布局', '专注', 'focus'],
      },
      {
        id: 'layout-balanced',
        title: `布局预设：标准${options.workspaceLayoutPreset.value === 'balanced' ? '（当前）' : ''}`,
        subtitle: '平衡编辑区与检查区',
        keywords: ['布局', '标准', 'balanced'],
      },
      {
        id: 'layout-review',
        title: `布局预设：审校${options.workspaceLayoutPreset.value === 'review' ? '（当前）' : ''}`,
        subtitle: '优先检查与趋势分析',
        keywords: ['布局', '审校', 'review'],
      },
      {
        id: 'toggle-suggestions',
        title: options.smartSuggestionsCollapsed.value ? '展开智能建议' : '收起智能建议',
        subtitle: '控制底部智能建议区域',
        disabled: !options.showSmartSuggestions.value,
        keywords: ['智能建议', '布局'],
      },
      {
        id: 'reset-inspector-width',
        title: '重置检查区宽度',
        subtitle: '恢复右侧检查区默认宽度',
        disabled: !options.isDesktop.value,
        keywords: ['检查区', '右侧栏', '宽度'],
      },
      {
        id: 'toggle-comment-panel',
        title: options.commentPanelCollapsed.value ? '显示检查区' : '隐藏检查区',
        subtitle: '切换右侧检查区显示',
        disabled: !options.isDesktop.value || options.workspaceLayoutPreset.value === 'focus',
        keywords: ['检查区', '右侧', '面板'],
      },
      {
        id: 'command-backfill',
        title: '补全说话人标记',
        subtitle: '自动识别并补标',
        disabled: !hasChapter || generating,
        keywords: ['补标', '对话'],
        featureId: 'audiobook',
      },
      {
        id: 'command-clean-quote',
        title: '清洗非台词引号',
        subtitle: '批量清洗引号误判',
        disabled: generating || options.chapterCount.value === 0,
        keywords: ['清洗', '引号'],
      },
      {
        id: 'command-curate-foreshadowing',
        title: '整理伏笔池（进阶）',
        subtitle: '梳理伏笔状态，当前不作为正式商品售卖',
        disabled: generating,
        keywords: ['伏笔', '梳理', '进阶'],
        featureId: 'series-blueprint',
      },
      {
        id: 'open-marketing-panel',
        title: '打开发布包装包',
        subtitle: '生成书名、卖点和简介包装',
        keywords: ['包装', '发布', '卖点', '简介'],
        featureId: 'marketing',
      },
      { id: 'goto-dashboard', title: '返回小说主页面', subtitle: '跳转到小说主页面', keywords: ['返回', '首页', '小说主页面'] },
      { id: 'goto-outline', title: '打开大纲编辑', subtitle: '跳转到大纲工作区', keywords: ['跳转', '大纲'] },
      { id: 'goto-world', title: '打开世界观编辑', subtitle: '跳转到世界观工作区', keywords: ['跳转', '世界观'] },
      { id: 'goto-characters', title: '打开角色管理', subtitle: '跳转到角色工作区', keywords: ['跳转', '角色'] },
      { id: 'goto-settings', title: '打开设置', subtitle: '跳转到设置页', keywords: ['跳转', '设置'] },
    ];

    return allCommands.filter(cmd => {
      if (!cmd.featureId) return true;
      return isFeatureAvailable(cmd.featureId, options.userRole.value);
    });
  });
}
