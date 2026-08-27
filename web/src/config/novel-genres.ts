import type { NovelGenre } from '../types';

export interface NovelGenreOption {
  value: NovelGenre;
  label: string;
}

export const NOVEL_GENRE_OPTIONS: NovelGenreOption[] = [
  { value: 'fantasy', label: '玄幻/奇幻 · 仙侠/武侠' },
  { value: 'mystery', label: '悬疑/推理 · 灵异/恐怖' },
  { value: 'modern', label: '都市/现代 · 职场/体育' },
  { value: 'scifi', label: '科幻 · 游戏/网游' },
  { value: 'historical', label: '历史 · 架空历史' },
  { value: 'romance', label: '言情 · 古言/现言' },
  { value: 'custom', label: '其他 · 自定义题材' },
];

export const NOVEL_GENRE_SELECT_HINT = '这里只定作品的大题材，发布到书城时再补具体分类。';
