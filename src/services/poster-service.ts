/**
 * 分享海报服务
 * 负责海报数据组装、金句提取、邀请码生成/校验、HTML 海报页面生成
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { brand } from '../config/brand.js';

/**
 * HTML 海报页面所需数据
 */
export interface PosterPageData {
  novelId: string;
  novelTitle: string;
  authorName: string;
  category?: string;
  chapterCount: number;
  wordCount: number;
  synopsis?: string;
  coverImage?: string;
  headline: string;
  tagline: string;
  hooks: string[];
  latestChapters: { chapterNumber: number; title: string }[];
  /** 书城已上架时传入书城阅读链接，否则使用创作者侧阅读链接 */
  readUrl?: string;
}

export interface PosterQuote {
  text: string;
  chapterNumber: number;
  chapterTitle: string;
}

export interface PosterData {
  id: string;
  novelId: string;
  novelTitle: string;
  coverImage?: string;
  authorName: string;
  chapterCount: number;
  wordCount: number;
  quotes: PosterQuote[];
  inviteCode?: string;
  viewCount?: number;
  category?: string;
  generatedAt: number;
}

export interface PosterInviteRecord {
  inviteCode: string;
  novelId: string;
  inviterId: string;
  createdAt: number;
  usedBy?: string;
  usedAt?: number;
}

/**
 * HTML 海报页面元数据记录
 */
export interface PosterPageRecord {
  posterId: string;
  novelId: string;
  novelTitle: string;
  headline: string;
  tagline: string;
  status: 'active' | 'disabled';
  createdAt: number;
}

/**
 * 海报访问记录（单次）
 */
export interface PosterViewRecord {
  ts: number;
  channel: string;
  device: string;
  visitorId: string;
}

/**
 * 海报统计数据
 */
export interface PosterStats {
  posterId: string;
  totalViews: number;
  uniqueVisitors: number;
  totalReads: number;
  channelStats: Record<string, number>;
  deviceStats: Record<string, number>;
  dailyStats: Record<string, number>;
  firstViewAt: number;
  lastViewAt: number;
  recentViews: PosterViewRecord[];
}

interface PosterStore {
  invites: PosterInviteRecord[];
  posters: PosterData[];
  pages: PosterPageRecord[];
}

export class PosterService {
  private storePath: string;

  constructor(private readonly dataDir: string) {
    this.storePath = path.join(dataDir, 'posters.json');
  }

  private loadStore(): PosterStore {
    try {
      if (!fs.existsSync(this.storePath)) return { invites: [], posters: [], pages: [] };
      const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as Partial<PosterStore>;
      return {
        invites: raw.invites ?? [],
        posters: raw.posters ?? [],
        pages: raw.pages ?? [],
      };
    } catch {
      return { invites: [], posters: [], pages: [] };
    }
  }

  private saveStore(store: PosterStore): void {
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  /**
   * 从章节内容中提取候选金句
   * 启发式：长度 15-60 字、含情感关键词或感叹号/问号、不以"第"开头
   */
  extractQuotes(
    chapters: { chapterNumber: number; title: string; content: string }[],
  ): PosterQuote[] {
    const emotional = /情|爱|恨|命|天|道|剑|战|死|生|梦|光|暗|心|泪|笑|怒|悲|喜|念|愿/;
    const quotes: PosterQuote[] = [];

    for (const ch of chapters) {
      const sentences = ch.content
        .replace(/\n/g, '。')
        .split(/[。！？!?]+/)
        .map((s) => s.trim())
        .filter((s) => {
          const len = s.length;
          if (len < 15 || len > 60) return false;
          if (/^第[一二两三四五六七八九十百千\d]/.test(s)) return false;
          if (s.startsWith('第')) return false;
          return true;
        });

      for (const sentence of sentences.slice(0, 5)) {
        // 优先取含情感关键词的句子
        if (emotional.test(sentence)) {
          quotes.push({
            text: sentence,
            chapterNumber: ch.chapterNumber,
            chapterTitle: ch.title,
          });
        }
      }
    }

    // 去重 + 按章节排序 + 取最多 5 条
    const seen = new Set<string>();
    const unique: PosterQuote[] = [];
    for (const q of quotes) {
      const key = q.text.slice(0, 20);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(q);
      if (unique.length >= 5) break;
    }

    // 如果没有找到情感句，退回取长度合适的句子
    if (unique.length === 0) {
      for (const ch of chapters) {
        const sentences = ch.content
          .replace(/\n/g, '。')
          .split(/[。！？!?]+/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 15 && s.length <= 60);
        for (const s of sentences.slice(0, 2)) {
          unique.push({ text: s, chapterNumber: ch.chapterNumber, chapterTitle: ch.title });
          if (unique.length >= 5) break;
        }
        if (unique.length >= 5) break;
      }
    }

    return unique;
  }

  /**
   * 生成/获取海报数据
   */
  assemblePoster(params: {
    novelId: string;
    novelTitle: string;
    coverImage?: string;
    authorName: string;
    chapterCount: number;
    wordCount: number;
    viewCount?: number;
    category?: string;
    chapters: { chapterNumber: number; title: string; content: string }[];
    userId?: string;
    generateInviteCode?: boolean;
  }): PosterData {
    const quotes = this.extractQuotes(params.chapters);

    let inviteCode: string | undefined;
    if (params.generateInviteCode && params.userId) {
      inviteCode = this.generateInviteCode(params.novelId, params.userId);
    }

    const poster: PosterData = {
      id: randomUUID(),
      novelId: params.novelId,
      novelTitle: params.novelTitle,
      coverImage: params.coverImage,
      authorName: params.authorName,
      chapterCount: params.chapterCount,
      wordCount: params.wordCount,
      quotes,
      inviteCode,
      viewCount: params.viewCount,
      category: params.category,
      generatedAt: Date.now(),
    };

    // 缓存（方便后续连载海报刷新）
    const store = this.loadStore();
    store.posters = store.posters.filter((p) => p.novelId !== params.novelId).slice(-50);
    store.posters.push(poster);
    this.saveStore(store);

    return poster;
  }

  /**
   * 生成邀请码: base64(userId_novelId_timestamp) 截断
   */
  private generateInviteCode(novelId: string, userId: string): string {
    const raw = `${userId}_${novelId}_${Date.now()}`;
    const code = Buffer.from(raw).toString('base64url').slice(0, 12).toUpperCase();
    const store = this.loadStore();
    store.invites.push({
      inviteCode: code,
      novelId,
      inviterId: userId,
      createdAt: Date.now(),
    });
    this.saveStore(store);
    return code;
  }

  /**
   * 核销邀请码
   */
  redeemInviteCode(code: string, newUserId: string): { novelId: string; inviterId: string } | null {
    const store = this.loadStore();
    const record = store.invites.find((r) => r.inviteCode === code && !r.usedBy);
    if (!record) return null;

    record.usedBy = newUserId;
    record.usedAt = Date.now();
    this.saveStore(store);

    return { novelId: record.novelId, inviterId: record.inviterId };
  }

  /**
   * 刷新已缓存的海报数据（用于连载海报自动刷新）
   */
  refreshPoster(
    novelId: string,
    updates: Partial<Pick<PosterData, 'chapterCount' | 'wordCount' | 'viewCount' | 'quotes'>>,
  ): PosterData | null {
    const store = this.loadStore();
    const idx = store.posters.findIndex((p) => p.novelId === novelId);
    if (idx < 0) return null;

    store.posters[idx] = { ...store.posters[idx], ...updates, generatedAt: Date.now() };
    this.saveStore(store);
    return store.posters[idx];
  }

  // ===== HTML 海报页面 =====

  private getPosterPageDir(): string {
    const dir = path.join(this.dataDir, 'poster-pages');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private getPosterPagePath(posterId: string): string {
    return path.join(this.getPosterPageDir(), `${posterId}.html`);
  }

  /**
   * 生成自包含的 HTML 海报页面并落盘，同时记录元数据
   * @returns posterId（用于后续访问 /api/posters/page/:posterId）
   */
  createPosterPage(data: PosterPageData): string {
    const posterId = randomUUID();
    const html = this.renderPosterHtml(data);
    fs.writeFileSync(this.getPosterPagePath(posterId), html, 'utf-8');

    // 记录元数据
    const store = this.loadStore();
    store.pages.push({
      posterId,
      novelId: data.novelId,
      novelTitle: data.novelTitle,
      headline: data.headline || data.novelTitle,
      tagline: data.tagline || '',
      status: 'active',
      createdAt: Date.now(),
    });
    // 每本小说最多保留 30 条历史
    const novelPages = store.pages.filter((p) => p.novelId === data.novelId);
    if (novelPages.length > 30) {
      const toRemove = novelPages.slice(0, novelPages.length - 30);
      store.pages = store.pages.filter((p) => !toRemove.some((r) => r.posterId === p.posterId));
      // 同步删除旧 HTML 文件
      for (const r of toRemove) {
        try { fs.unlinkSync(this.getPosterPagePath(r.posterId)); } catch { /* 忽略 */ }
      }
    }
    this.saveStore(store);

    return posterId;
  }

  /**
   * 读取已生成的 HTML 海报页面内容
   * - 已禁用的海报返回下线提示页
   */
  readPosterHtml(posterId: string): string | null {
    try {
      // 先检查状态
      const store = this.loadStore();
      const record = store.pages.find((p) => p.posterId === posterId);
      if (record && record.status === 'disabled') {
        return this.renderOfflineHtml(record);
      }
      const filePath = this.getPosterPagePath(posterId);
      if (!fs.existsSync(filePath)) return null;
      let html = fs.readFileSync(filePath, 'utf-8');
      // 旧海报可能没有追踪 JS，自动补注入
      if (!html.includes('/track') && html.includes('</body>')) {
        html = html.replace('</body>', `${this.renderTrackingScript(posterId)}\n</body>`);
        // 同步写回文件，下次不用再补
        try { fs.writeFileSync(filePath, html, 'utf-8'); } catch { /* 忽略 */ }
      }
      return html;
    } catch {
      return null;
    }
  }

  /**
   * 生成追踪 JS 片段（用于补注入旧海报）
   */
  private renderTrackingScript(_posterId: string): string {
    return `<script>
(function(){
  var ua = navigator.userAgent;
  var params = new URLSearchParams(location.search);
  var from = params.get('from') || '';
  if (!from) {
    if (/MicroMessenger/.test(ua)) from = 'wechat';
    else if (/QQ\\//.test(ua) || /QQBrowser/.test(ua)) from = 'qq';
    else from = 'direct';
  }
  var device = /Mobile|Android|iPhone|iPad/.test(ua) ? 'mobile' : 'desktop';
  var visitorKey = 'ps_vid';
  var visitorId = '';
  try { visitorId = localStorage.getItem(visitorKey) || ''; } catch(e) {}
  if (!visitorId) {
    visitorId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { localStorage.setItem(visitorKey, visitorId); } catch(e) {}
  }
  var basePath = location.pathname;
  try {
    fetch(basePath + '/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: from, device: device, visitorId: visitorId })
    }).catch(function(){});
  } catch(e) {}
  var cta = document.querySelector('.cta-btn');
  if (cta) {
    cta.addEventListener('click', function() {
      try {
        fetch(basePath + '/track-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: from })
        }).catch(function(){});
      } catch(e) {}
    }, false);
  }
})();
</script>`;
  }

  /**
   * 列出某本小说的所有海报历史（按创建时间倒序）
   */
  listPages(novelId: string): PosterPageRecord[] {
    const store = this.loadStore();
    return store.pages
      .filter((p) => p.novelId === novelId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 禁用海报（访问时显示下线提示，保留 HTML 文件和元数据）
   */
  disablePage(posterId: string): PosterPageRecord | null {
    const store = this.loadStore();
    const idx = store.pages.findIndex((p) => p.posterId === posterId);
    if (idx < 0) return null;
    store.pages[idx].status = 'disabled';
    this.saveStore(store);
    return store.pages[idx];
  }

  /**
   * 启用海报（恢复访问）
   */
  enablePage(posterId: string): PosterPageRecord | null {
    const store = this.loadStore();
    const idx = store.pages.findIndex((p) => p.posterId === posterId);
    if (idx < 0) return null;
    store.pages[idx].status = 'active';
    this.saveStore(store);
    return store.pages[idx];
  }

  /**
   * 永久删除海报（删除 HTML 文件 + 元数据 + 统计数据）
   */
  deletePage(posterId: string): boolean {
    const store = this.loadStore();
    const idx = store.pages.findIndex((p) => p.posterId === posterId);
    if (idx < 0) return false;
    store.pages.splice(idx, 1);
    this.saveStore(store);
    try { fs.unlinkSync(this.getPosterPagePath(posterId)); } catch { /* 忽略 */ }
    this.deleteStats(posterId);
    return true;
  }

  // ===== 海报数据统计 =====

  private getStatsPath(): string {
    return path.join(this.dataDir, 'poster-stats.json');
  }

  private loadAllStats(): Record<string, PosterStats> {
    try {
      if (!fs.existsSync(this.getStatsPath())) return {};
      return JSON.parse(fs.readFileSync(this.getStatsPath(), 'utf-8'));
    } catch {
      return {};
    }
  }

  private saveAllStats(all: Record<string, PosterStats>): void {
    try {
      fs.writeFileSync(this.getStatsPath(), JSON.stringify(all, null, 2), 'utf-8');
    } catch { /* 忽略 */ }
  }

  /**
   * 记录一次海报访问
   */
  recordView(posterId: string, meta: { channel: string; device: string; visitorId: string }): void {
    const all = this.loadAllStats();
    const stats = all[posterId] ?? {
      posterId,
      totalViews: 0,
      uniqueVisitors: 0,
      totalReads: 0,
      channelStats: {},
      deviceStats: {},
      dailyStats: {},
      firstViewAt: 0,
      lastViewAt: 0,
      recentViews: [],
    };

    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);

    stats.totalViews += 1;
    stats.lastViewAt = now;
    if (stats.firstViewAt === 0) stats.firstViewAt = now;

    // 唯一访客：检查 recentViews 中是否已有该 visitorId
    const allVisitorIds = new Set(stats.recentViews.map((v) => v.visitorId));
    if (!allVisitorIds.has(meta.visitorId)) {
      stats.uniqueVisitors += 1;
    }

    stats.channelStats[meta.channel] = (stats.channelStats[meta.channel] ?? 0) + 1;
    stats.deviceStats[meta.device] = (stats.deviceStats[meta.device] ?? 0) + 1;
    stats.dailyStats[day] = (stats.dailyStats[day] ?? 0) + 1;

    stats.recentViews.push({ ts: now, channel: meta.channel, device: meta.device, visitorId: meta.visitorId });
    // 只保留最近 200 条
    if (stats.recentViews.length > 200) {
      stats.recentViews = stats.recentViews.slice(-200);
    }

    all[posterId] = stats;
    this.saveAllStats(all);
  }

  /**
   * 记录一次"立即阅读"点击
   */
  recordRead(posterId: string): void {
    const all = this.loadAllStats();
    const stats = all[posterId];
    if (!stats) return;
    stats.totalReads += 1;
    all[posterId] = stats;
    this.saveAllStats(all);
  }

  /**
   * 获取海报统计数据
   */
  getStats(posterId: string): PosterStats | null {
    const all = this.loadAllStats();
    return all[posterId] ?? null;
  }

  /**
   * 删除海报统计数据（删除海报时调用）
   */
  deleteStats(posterId: string): void {
    const all = this.loadAllStats();
    if (all[posterId]) {
      delete all[posterId];
      this.saveAllStats(all);
    }
  }

  private renderOfflineHtml(record: PosterPageRecord): string {
    const title = escapeHtml(record.novelTitle || '作品');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${title} · 海报已下线</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#0b1020;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.box{text-align:center;max-width:320px}
.icon{width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;color:#ef4444;font-size:28px}
h1{font-size:18px;font-weight:600;margin-bottom:8px}
p{font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6}
</style>
</head>
<body>
<div class="box">
  <div class="icon">×</div>
  <h1>该分享海报已下线</h1>
  <p>作者已关闭此分享链接，如需查看《${title}》请直接前往平台搜索。</p>
</div>
</body>
</html>`;
  }

  /**
   * 渲染 HTML 海报页面字符串
   * - 所有资源用相对路径，自动适配 DMP 子路径部署
   * - 封面图相对路径：../../novels/cover/<novelId>（相对于 /api/posters/page/<posterId>）
   * - CTA 跳转相对路径：../../../m/novel/<novelId>（前端路由）
   */
  private renderPosterHtml(data: PosterPageData): string {
    const escape = escapeHtml;
    const title = escape(data.novelTitle || '未命名作品');
    const headline = escape(data.headline || data.novelTitle || '');
    const tagline = escape(data.tagline || '');
    const author = escape(data.authorName || '佚名');
    const GENRE_LABELS: Record<string, string> = {
      fantasy: '玄幻奇幻',
      mystery: '悬疑推理',
      modern: '都市现代',
      scifi: '科幻',
      historical: '历史',
      romance: '言情',
      custom: '原创',
    };
    const rawCategory = data.category || '';
    const category = escape(GENRE_LABELS[rawCategory] || rawCategory);
    const synopsis = escape(truncate(data.synopsis || '', 200));
    const hooks = (data.hooks || []).slice(0, 3).map((h) => escape(h));
    const chapters = (data.latestChapters || []).slice(0, 3).map((c) => ({
      num: c.chapterNumber,
      title: escape(c.title || ''),
    }));
    const wordCount = formatWordCount(data.wordCount);
    const chapterCount = data.chapterCount || 0;

    // 相对路径（相对于 /api/posters/page/<posterId>）
    const coverUrl = data.coverImage
      ? `../../novels/cover/${encodeURIComponent(data.novelId)}?w=600`
      : '';
    const readUrl = data.readUrl
      || `../../../m/novel/${encodeURIComponent(data.novelId)}/read`;

    const hooksHtml = hooks.length
      ? `<ul class="hooks">${hooks.map((h) => `<li>${h}</li>`).join('')}</ul>`
      : '';

    const chaptersHtml = chapters.length
      ? `<section class="chapters">
          <h3>最新章节</h3>
          <ul>${chapters.map((c) =>
            `<li><span class="ch-num">第${c.num}章</span><strong>${c.title}</strong></li>`
          ).join('')}</ul>
        </section>`
      : '';

    const coverBg = coverUrl ? `style="background-image:url('${coverUrl}')"` : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="format-detection" content="telephone=no">
<title>${title} · ${brand.displayName}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#0b1020;color:#fff;min-height:100vh}
.page{max-width:480px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;background:linear-gradient(180deg,#0b1020 0%,#1a1f3a 100%)}
.cover{position:relative;width:100%;padding-top:133%;background-size:cover;background-position:center;background-color:#1a1f3a}
.cover::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,16,32,0) 40%,rgba(11,16,32,0.55) 70%,rgba(11,16,32,0.95) 100%)}
.cover-title{position:absolute;left:0;right:0;bottom:0;padding:24px 22px calc(22px + env(safe-area-inset-bottom));z-index:1}
.cover-title h1{font-size:26px;font-weight:800;line-height:1.3;letter-spacing:0.5px;text-shadow:0 2px 12px rgba(0,0,0,0.6)}
.cover-title .tagline{margin-top:10px;font-size:14px;line-height:1.5;color:rgba(255,255,255,0.82);text-shadow:0 1px 6px rgba(0,0,0,0.6)}
.brand-tag{display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(99,102,241,0.85);font-size:11px;font-weight:600;letter-spacing:1px;margin-bottom:12px}
.hooks{padding:22px 22px 4px}
.hooks li{list-style:none;padding:10px 0 10px 18px;position:relative;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.88)}
.hooks li::before{content:"";position:absolute;left:0;top:16px;width:6px;height:6px;border-radius:50%;background:#818cf8}
.meta{padding:22px}
.meta h2{font-size:18px;font-weight:700;margin-bottom:8px}
.meta .author{font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:14px}
.meta .author span{margin:0 6px;color:rgba(255,255,255,0.3)}
.meta .synopsis{font-size:14px;line-height:1.7;color:rgba(255,255,255,0.78)}
.chapters{padding:0 22px 22px}
.chapters h3{font-size:13px;font-weight:600;color:rgba(255,255,255,0.5);margin-bottom:12px;letter-spacing:1px}
.chapters li{list-style:none;padding:12px 0;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:10px}
.chapters li:last-child{border-bottom:1px solid rgba(255,255,255,0.08)}
.chapters .ch-num{flex-shrink:0;font-size:11px;color:#818cf8;background:rgba(99,102,241,0.15);padding:3px 8px;border-radius:6px}
.chapters strong{font-size:14px;font-weight:500;color:rgba(255,255,255,0.9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cta{padding:8px 22px calc(28px + env(safe-area-inset-bottom));margin-top:auto}
.cta-btn{display:block;width:100%;padding:16px;text-align:center;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;font-size:16px;font-weight:600;text-decoration:none;border-radius:14px;box-shadow:0 8px 24px rgba(99,102,241,0.35)}
.cta-brand{text-align:center;margin-top:14px;font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:2px}
</style>
</head>
<body>
<div class="page">
  <div class="cover" ${coverBg}>
    <div class="cover-title">
      <span class="brand-tag">${brand.displayName}</span>
      <h1>${headline}</h1>
      ${tagline ? `<p class="tagline">${tagline}</p>` : ''}
    </div>
  </div>
  ${hooksHtml ? `<section class="hooks">${hooksHtml}</section>` : ''}
  <section class="meta">
    <h2>${title}</h2>
    <p class="author">${author}${category ? `<span>·</span>${category}` : ''}${chapterCount ? `<span>·</span>${chapterCount}章` : ''}${wordCount ? `<span>·</span>${wordCount}` : ''}</p>
    ${synopsis ? `<p class="synopsis">${synopsis}</p>` : ''}
  </section>
  ${chaptersHtml}
  <div class="cta">
    <a class="cta-btn" href="${readUrl}">立即开始阅读</a>
    <p class="cta-brand">${brand.displayName} · 让故事被看见</p>
  </div>
</div>
<script>
(function(){
  var ua = navigator.userAgent;
  var params = new URLSearchParams(location.search);
  var from = params.get('from') || '';
  // 自动识别微信/QQ内置浏览器
  if (!from) {
    if (/MicroMessenger/.test(ua)) from = 'wechat';
    else if (/QQ\//.test(ua) || /QQBrowser/.test(ua)) from = 'qq';
    else from = 'direct';
  }
  var device = /Mobile|Android|iPhone|iPad/.test(ua) ? 'mobile' : 'desktop';
  // 生成唯一访客 ID
  var visitorKey = 'ps_vid';
  var visitorId = '';
  try { visitorId = localStorage.getItem(visitorKey) || ''; } catch(e) {}
  if (!visitorId) {
    visitorId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { localStorage.setItem(visitorKey, visitorId); } catch(e) {}
  }
  var basePath = location.pathname;
  // 上报访问
  try {
    fetch(basePath + '/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: from, device: device, visitorId: visitorId })
    }).catch(function(){});
  } catch(e) {}
  // CTA 点击追踪
  var cta = document.querySelector('.cta-btn');
  if (cta) {
    cta.addEventListener('click', function() {
      try {
        fetch(basePath + '/track-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: from })
        }).catch(function(){});
      } catch(e) {}
    }, false);
  }
})();
</script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function formatWordCount(n: number): string {
  if (!n) return '';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万字';
  return n + '字';
}
