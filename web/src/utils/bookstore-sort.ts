import type { BookStoreSort } from '../api/types';

export type BookStoreSortOption = {
  value: BookStoreSort;
  label: string;
  shortLabel: string;
  description: string;
};

export const BOOKSTORE_SORT_OPTIONS: BookStoreSortOption[] = [
  {
    value: 'updated',
    label: '最新更新',
    shortLabel: '追更优先',
    description: '把刚续更、刚放出新章的作品先顶到前排，追更氛围更强。',
  },
  {
    value: 'hot',
    label: '最火爆',
    shortLabel: '热度优先',
    description: '优先放大阅读、收藏和互动都在冲高的作品，首页更有爆点。',
  },
  {
    value: 'new',
    label: '近期新书',
    shortLabel: '新书优先',
    description: '把最近上架的新书提到第一屏，给新作品更快拿到首波曝光。',
  },
];

export function getBookStoreSortLabel(
  sort: BookStoreSort,
  mode: 'label' | 'short' = 'label',
): string {
  const option = BOOKSTORE_SORT_OPTIONS.find((item) => item.value === sort);
  if (!option) {
    return sort;
  }
  return mode === 'short' ? option.shortLabel : option.label;
}
