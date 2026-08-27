import { ref, computed, watch } from 'vue';

/** 单个快捷标签 */
export interface StyleTag {
  label: string;
  /** 追加到风格补充中的文本片段 */
  text: string;
}

/** 标签分类 */
export interface StyleTagCategory {
  name: string;
  tags: StyleTag[];
}

const STORAGE_KEY = 'nw-style-custom-tags';

/** 内置预设标签（按分类组织） */
const PRESET_CATEGORIES: StyleTagCategory[] = [
  {
    name: '节奏',
    tags: [
      { label: '快节奏', text: '快节奏，场景切换迅速' },
      { label: '慢热', text: '节奏放缓，细腻铺陈' },
      { label: '张弛有度', text: '张弛有度，紧张与舒缓交替' },
      { label: '紧凑', text: '紧凑叙事，无冗余段落' },
      { label: '层层递进', text: '层层递进，逐步推向高潮' },
      { label: '一波三折', text: '一波三折，反转不断' },
    ],
  },
  {
    name: '语体',
    tags: [
      { label: '口语化', text: '语言口语化，贴近日常' },
      { label: '文白混搭', text: '文白混搭，典雅而不晦涩' },
      { label: '诗意', text: '语言诗意唯美' },
      { label: '冷硬', text: '冷硬简洁，不带多余修饰' },
      { label: '轻松幽默', text: '轻松幽默，读来愉快' },
      { label: '暗黑压抑', text: '语调阴郁压抑' },
    ],
  },
  {
    name: '叙事',
    tags: [
      { label: '第一人称', text: '使用第一人称叙事' },
      { label: '第三人称限知', text: '第三人称限知视角' },
      { label: '全知视角', text: '全知视角叙述' },
      { label: '多视角切换', text: '多人称视角交替切换' },
    ],
  },
  {
    name: '笔法',
    tags: [
      { label: '大量对话', text: '以对话驱动情节推进' },
      { label: '心理描写', text: '注重角色内心独白与心理活动' },
      { label: '环境烘托', text: '借环境描写烘托气氛' },
      { label: '蒙太奇', text: '蒙太奇手法，场景交叉剪辑' },
      { label: '意识流', text: '意识流写法，思维跳跃' },
      { label: '白描', text: '白描手法，简洁不铺陈' },
      { label: '细节雕琢', text: '注重细节刻画' },
      { label: '留白', text: '留白暗示，不说破' },
    ],
  },
  {
    name: '情感基调',
    tags: [
      { label: '热血', text: '热血激昂，充满力量感' },
      { label: '温馨', text: '温馨治愈的氛围' },
      { label: '虐心', text: '虐心揪心，情感撕裂' },
      { label: '治愈', text: '治愈系，给予温暖与希望' },
      { label: '讽刺', text: '带有讽刺与黑色幽默' },
      { label: '悬念感', text: '营造强烈悬念感' },
    ],
  },
  {
    name: '场景偏好',
    tags: [
      { label: '打戏为主', text: '侧重动作场面描写' },
      { label: '感情戏为主', text: '侧重感情互动' },
      { label: '日常戏', text: '日常向，轻松生活化' },
      { label: '剧情推进', text: '以剧情推进为主线' },
      { label: '伏笔铺设', text: '多埋伏笔，为后续章节铺垫' },
      { label: '群像戏', text: '群像描写，多角色平衡出场' },
    ],
  },
];

function loadCustomTags(): StyleTag[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t: unknown): t is StyleTag =>
        typeof t === 'object' && t !== null && typeof (t as StyleTag).label === 'string' && typeof (t as StyleTag).text === 'string',
    );
  } catch {
    return [];
  }
}

function saveCustomTags(tags: StyleTag[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
}

/**
 * 风格快捷标签管理 composable。
 *
 * - 内置 6 大分类的预设标签
 * - 用户可自定义标签（持久化到 localStorage）
 * - 点击标签 → 追加/移除对应文本到 styleNotes
 */
export function useStyleQuickTags(opts: {
  styleNotes: () => string;
  onUpdate: (value: string) => void;
}) {
  const customTags = ref<StyleTag[]>(loadCustomTags());

  // 持久化自定义标签
  watch(customTags, (v) => saveCustomTags(v), { deep: true });

  /** 用 computed 包装，确保 Vue 模板能正确追踪响应式依赖 */
  const currentNotes = computed(() => opts.styleNotes());

  /** 当前激活标签文本集合（computed → 模板自动响应更新） */
  const activeTexts = computed(() => {
    const notes = currentNotes.value;
    const allTags = [...PRESET_CATEGORIES.flatMap((c) => c.tags), ...customTags.value];
    return new Set(allTags.filter((t) => notes.includes(t.text)).map((t) => t.text));
  });

  /** 判断一个标签是否处于激活态 */
  function isTagActive(tag: StyleTag): boolean {
    return activeTexts.value.has(tag.text);
  }

  /** 切换标签：已存在则移除，不存在则追加 */
  function toggleTag(tag: StyleTag) {
    const current = currentNotes.value;
    if (current.includes(tag.text)) {
      // 移除——处理前后可能的分隔符
      let updated = current.replace(tag.text, '');
      // 清理多余的分号/顿号分隔
      updated = updated.replace(/[；;、]\s*[；;、]/g, '；');
      updated = updated.replace(/^[；;、\s]+/, '').replace(/[；;、\s]+$/, '');
      opts.onUpdate(updated);
    } else {
      const separator = current.trim() ? '；' : '';
      opts.onUpdate(current.trim() + separator + tag.text);
    }
  }

  /** 添加自定义标签 */
  function addCustomTag(label: string, text?: string) {
    const trimLabel = label.trim();
    if (!trimLabel) return false;
    if (customTags.value.some((t) => t.label === trimLabel)) return false;
    customTags.value.push({ label: trimLabel, text: text?.trim() || trimLabel });
    return true;
  }

  /** 删除自定义标签 */
  function removeCustomTag(label: string) {
    const idx = customTags.value.findIndex((t) => t.label === label);
    if (idx >= 0) customTags.value.splice(idx, 1);
  }

  return {
    PRESET_CATEGORIES,
    customTags,
    isTagActive,
    toggleTag,
    addCustomTag,
    removeCustomTag,
  };
}
