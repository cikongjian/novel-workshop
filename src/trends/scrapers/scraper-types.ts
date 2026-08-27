import { z } from 'zod';

// ==================== 直接抓取源枚举 ====================

export const DirectSourceEnum = z.enum([
  'weibo',
  '36kr',
  'zhihu',
  'baidu',
  'bilibili',
  'toutiao',
]);
export type DirectSource = z.infer<typeof DirectSourceEnum>;

// ==================== 抓取结果类型 ====================

export type ScrapedItem = {
  title: string;
  snippet: string;
  url: string;
  rank: number;
  hotScore?: number;
};

export type ScrapeResult = {
  platform: string;
  platformLabel: string;
  items: ScrapedItem[];
  scrapedAt: string;
};

// ==================== 抓取器接口 ====================

export interface HotListScraper {
  readonly platform: string;
  readonly platformLabel: string;
  scrape(maxResults: number): Promise<ScrapeResult>;
}
