export type StylePresetOption =
  | 'auto'
  | 'serious'
  | 'comedy'
  | 'wacky'
  | 'historical'
  | 'xianxia'
  | 'wuxia'
  | 'suspense'
  | 'horror'
  | 'campus'
  | 'workplace'
  | 'political'
  | 'hard-scifi'
  | 'romance-sweet'
  | 'romance-angst';

export type WordLimitOption = 'none' | '2000' | '3000' | '4000' | '5000' | 'custom';

export const DEFAULT_CHAPTER_WORD_TARGET = 3000;

export const STYLE_PRESET_OPTIONS: Array<{ label: string; value: StylePresetOption }> = [
  { label: '自动识别（推荐）', value: 'auto' },
  { label: '正剧', value: 'serious' },
  { label: '搞笑', value: 'comedy' },
  { label: '逗比', value: 'wacky' },
  { label: '历史', value: 'historical' },
  { label: '仙侠', value: 'xianxia' },
  { label: '武侠', value: 'wuxia' },
  { label: '悬疑', value: 'suspense' },
  { label: '惊悚', value: 'horror' },
  { label: '校园', value: 'campus' },
  { label: '职场', value: 'workplace' },
  { label: '权谋', value: 'political' },
  { label: '硬科幻', value: 'hard-scifi' },
  { label: '甜宠', value: 'romance-sweet' },
  { label: '虐恋', value: 'romance-angst' },
];

export const WORD_LIMIT_OPTIONS: Array<{ label: string; value: WordLimitOption }> = [
  { label: '不限', value: 'none' },
  { label: '2000 字', value: '2000' },
  { label: '3000 字（推荐）', value: '3000' },
  { label: '4000 字', value: '4000' },
  { label: '5000 字', value: '5000' },
  { label: '自定义', value: 'custom' },
];

export function resolveMaxWordCount(option: WordLimitOption, custom: number): number | undefined {
  if (option === 'none') return undefined;
  if (option === 'custom') {
    const normalized = Number.isFinite(custom) ? Math.round(custom) : DEFAULT_CHAPTER_WORD_TARGET;
    return Math.min(20000, Math.max(800, normalized));
  }
  return Number(option);
}

export function isStylePresetOption(value: string): value is StylePresetOption {
  return STYLE_PRESET_OPTIONS.some((item) => item.value === value);
}

export function isWordLimitOption(value: string): value is WordLimitOption {
  return WORD_LIMIT_OPTIONS.some((item) => item.value === value);
}
