/** 各平台默认搜索词模板，{year} 运行时替换为当前年份 */
export const DEFAULT_SEARCH_QUERIES: Record<string, string[]> = {
  qidian: [
    '起点中文网 热门排行榜 {year}',
    '起点中文网 新书推荐 热门题材 {year}',
    '起点 畅销题材 趋势 {year}',
    '起点中文网 作者福利 公告 {year}',
    '起点中文网 新人作者 扶持 {year}',
  ],
  fanqie: [
    '番茄小说 热门排行 {year}',
    '番茄小说 畅销题材 {year}',
    '番茄小说 作者福利 公告 {year}',
    '番茄小说 新书 追更奖 {year}',
  ],
  jjwxc: [
    '晋江文学城 热门 {year}',
    '晋江 新书榜 题材 {year}',
    '晋江文学城 作者公告 签约 {year}',
  ],
  qimao: [
    '七猫小说 热门推荐 {year}',
    '七猫小说 作者福利 公告 {year}',
    '七猫小说 扶摇计划 {year}',
  ],
  zongheng: [
    '纵横中文网 排行榜 {year}',
    '纵横中文网 作者福利 {year}',
    '纵横中文网 七猫 分成 {year}',
  ],
  general: [
    '网文 热门题材 趋势分析 {year}',
    '网络小说 市场分析 读者偏好 {year}',
    '中国网络文学 年度盘点 热门类型 {year}',
  ],
};

/** 每个搜索查询最多返回结果数 */
export const MAX_RESULTS_PER_QUERY = 10;

/** 送入 AI 分析的原始结果上限 */
export const MAX_RAW_RESULTS_FOR_ANALYSIS = 80;

/** AI 分析超时（5 分钟） */
export const ANALYSIS_TIMEOUT_MS = 300_000;

/** 默认定时刷新时间 */
export const DEFAULT_SCHEDULE_HOUR = 8;
export const DEFAULT_SCHEDULE_MINUTE = 0;

/** 历史快照最大保留天数 */
export const MAX_HISTORY_SNAPSHOTS = 90;

/** 两次刷新之间最小间隔（10 分钟） */
export const MIN_REFRESH_INTERVAL_MS = 600_000;

/** AI 分析解析失败时的最大重试次数（不含首次） */
export const ANALYSIS_PARSE_MAX_RETRIES = 2;

/** 解析失败重试间隔（毫秒） */
export const ANALYSIS_PARSE_RETRY_DELAY_MS = 3_000;

/** 重试时的温度系数（每次重试温度递增，增加多样性） */
export const ANALYSIS_RETRY_TEMPERATURE_STEP = 0.2;

/** 并发搜索请求数限制 */
export const SEARCH_CONCURRENCY = 3;

/** 单次搜索请求超时（15 秒） */
export const SEARCH_REQUEST_TIMEOUT_MS = 15_000;

// ==================== 直接抓取常量 ====================

/** 同一域名两次请求之间最小间隔（2 秒） */
export const SCRAPER_DOMAIN_INTERVAL_MS = 2_000;

/** 默认启用的直接抓取源 */
export const DEFAULT_DIRECT_SOURCES = ['weibo', '36kr', 'zhihu', 'baidu'] as const;

/** 抓取器 User-Agent 池 — 每次请求随机选取 */
export const SCRAPER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
] as const;

/** 兼容旧引用 — 取池中第一个 */
export const SCRAPER_USER_AGENT = SCRAPER_USER_AGENTS[0];

/** 429/403 最大重试次数 */
export const SCRAPER_MAX_RETRIES = 2;

/** 源间请求间隔基数（毫秒），实际会加 ±30% 抖动 */
export const SCRAPER_STAGGER_BASE_MS = 1_500;
