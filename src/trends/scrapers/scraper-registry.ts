import type { DirectSource, HotListScraper } from './scraper-types.js';
import { WeiboScraper } from './weibo-scraper.js';
import { ThirtySixKrScraper } from './36kr-scraper.js';
import { ZhihuScraper } from './zhihu-scraper.js';
import { BaiduScraper } from './baidu-scraper.js';
import { BilibiliScraper } from './bilibili-scraper.js';
import { ToutiaoScraper } from './toutiao-scraper.js';

const SCRAPER_CONSTRUCTORS: Record<DirectSource, new () => HotListScraper> = {
  weibo: WeiboScraper,
  '36kr': ThirtySixKrScraper,
  zhihu: ZhihuScraper,
  baidu: BaiduScraper,
  bilibili: BilibiliScraper,
  toutiao: ToutiaoScraper,
};

/** 根据启用列表创建对应抓取器实例 */
export function createScraperRegistry(enabledSources: readonly DirectSource[]): HotListScraper[] {
  return enabledSources
    .filter((s) => s in SCRAPER_CONSTRUCTORS)
    .map((s) => new SCRAPER_CONSTRUCTORS[s]());
}
