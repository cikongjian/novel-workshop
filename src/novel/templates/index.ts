import type { GenreTemplate } from './types.js';
import { fantasyTemplate } from './fantasy.js';
import { mysteryTemplate } from './mystery.js';
import { modernTemplate } from './modern.js';
import { scifiTemplate } from './scifi.js';

export type { GenreTemplate, GenreWritingRules } from './types.js';

/** 所有题材模板的注册表 */
const templates: Record<string, GenreTemplate> = {
  fantasy: fantasyTemplate,
  mystery: mysteryTemplate,
  modern: modernTemplate,
  scifi: scifiTemplate,
};

/**
 * 根据题材标识获取模板
 * 如果题材不存在，返回 null
 */
export function getTemplate(genre: string): GenreTemplate | null {
  return templates[genre] ?? null;
}

