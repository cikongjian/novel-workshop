import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PosterService } from '../../services/poster-service.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { NovelAgent, AgentContext } from '../../agents/types.js';
import type { ModelClient } from '../../models/types.js';
import type { AuthDb } from '../../auth/types.js';
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import { getProfile } from '../../auth/user-service.js';

/**
 * 海报文案风格池 — 每次随机选择一种，确保 AI 生成内容有多样性
 */
const POSTER_STYLES = [
  {
    name: '悬念型',
    direction: '用悬念和未解之谜吸引读者，让人忍不住想点开看真相',
    examples: '如"真相远比想象更可怕"、"当所有线索指向同一个人..."',
  },
  {
    name: '情感共鸣型',
    direction: '聚焦人物情感纠葛和内心挣扎，引发读者共情',
    examples: '如"有些选择，一旦做出就再无回头"、"爱一个人，到底要付出多少代价"',
  },
  {
    name: '反转型',
    direction: '强调剧情反转和意想不到的真相，突出"意料之外"',
    examples: '如"你以为的真相，只是另一个谎言的开始"、"所有人都被骗了，包括读者"',
  },
  {
    name: '金句型',
    direction: '用一句有力量感、有哲理的话作为核心 slogan',
    examples: '如"命运从不公平，但勇气从不孤独"、"在这个世界，弱者连善良的资格都没有"',
  },
  {
    name: '社交传播型',
    direction: '用网感强、适合朋友圈转发的口吻，带点调侃或情绪化',
    examples: '如"看完三章直接通宵，这小说有毒"、"朋友推荐时我不屑，看完后我跪了"',
  },
  {
    name: '冲突对抗型',
    direction: '突出核心矛盾和对抗，强调紧张感和戏剧冲突',
    examples: '如"一个人，对抗整个世界"、"当敌人成为唯一可以信任的人"',
  },
  {
    name: '氛围沉浸型',
    direction: '营造强烈的氛围感和画面感，让读者仿佛身临其境',
    examples: '如"雨夜、孤灯、一封迟到的遗书"、"这座城市的每个角落，都藏着秘密"',
  },
  {
    name: '角色魅力型',
    direction: '聚焦主角的个人魅力、成长弧线或独特特质',
    examples: '如"从废柴到王座，他只用了三天"、"她不是天才，她只是不认命"',
  },
];

export function createPosterRouter(
  posterService: PosterService,
  novelManager: NovelManager,
  agents?: Map<string, NovelAgent>,
  modelClient?: ModelClient,
  authDb?: AuthDb,
  bookStoreManager?: BookStoreManager,
) {
  const router = Router();

  function getUserId(req: Request): string | undefined {
    return ((req as any).auth as { id?: string } | undefined)?.id;
  }

  // GET /api/posters/generate?novelId=xxx - 基础海报数据（金句提取，保留兼容）
  router.get('/generate', async (req: Request, res: Response) => {
    try {
      const novelId = String(req.query.novelId ?? '');
      if (!novelId) { res.status(400).json({ error: '缺少 novelId' }); return; }

      const novel = await novelManager.getNovel(novelId);
      if (!novel) { res.status(404).json({ error: '作品未找到' }); return; }

      const chapterSummaries = await novelManager.listChapters(novelId);
      const topChapters = chapterSummaries.slice(0, 10);
      const chapters: { chapterNumber: number; title: string; content: string }[] = [];
      for (const ch of topChapters) {
        try {
          const full = await novelManager.getChapter(novelId, ch.chapterNumber);
          if (full?.content) chapters.push({ chapterNumber: ch.chapterNumber, title: ch.title, content: full.content });
        } catch { /* skip */ }
      }

      const generateInviteCode = req.query.invite === 'true';
      const userId = getUserId(req);

      const poster = posterService.assemblePoster({
        novelId,
        novelTitle: novel.title,
        coverImage: novel.coverImage,
        authorName: (novel as any).authorName || '佚名',
        chapterCount: novel.chapterCount ?? chapterSummaries.length,
        wordCount: novel.wordCount ?? 0,
        viewCount: (novel as any).viewCount,
        category: novel.genre,
        chapters,
        userId,
        generateInviteCode,
      });

      res.json({ poster });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '生成失败' });
    }
  });

  // POST /api/posters/promote - AI 生成推广文案 + 生成 HTML 海报页面
  // 返回 { posterId, pageUrl, headline, tagline, hooks, novelTitle, ... }
  router.post('/promote', async (req: Request, res: Response) => {
    try {
      const { novelId } = req.body ?? {};
      if (!novelId) { res.status(400).json({ error: '缺少 novelId' }); return; }

      const novel = await novelManager.getNovel(novelId);
      if (!novel) { res.status(404).json({ error: '作品未找到' }); return; }

      // 加载角色和世界观，为 AI 提供上下文
      let characterContext = '';
      let worldContext = '';
      try {
        const characters = await novelManager.getCharacters?.(novelId) ?? [];
        characterContext = (characters as any[]).map((c: any) =>
          `${c.name}(${c.role || '未知角色'}): ${c.personality || ''}`
        ).join('\n');
        const worldEntries = await (novelManager as any).getWorldEntries?.(novelId) ?? [];
        worldContext = (worldEntries as any[]).map((e: any) =>
          `[${e.category || '设定'}] ${e.name}: ${e.description || ''}`
        ).join('\n');
      } catch { /* 忽略 */ }

      // 取最新章节列表（用于 HTML 海报页面展示）
      const chapterSummaries = await novelManager.listChapters(novelId);
      const latestChapters = chapterSummaries
        .slice(-3)
        .reverse()
        .map((c: any) => ({ chapterNumber: c.chapterNumber, title: c.title }));

      // 加载最新章节正文片段，为 AI 提供具体剧情素材
      let latestChapterExcerpt = '';
      try {
        if (chapterSummaries.length > 0) {
          const lastChapter = chapterSummaries[chapterSummaries.length - 1];
          const chapterContent = await (novelManager as any).getChapter?.(novelId, lastChapter.chapterNumber);
          if (chapterContent?.content) {
            // 取前 500 字作为剧情素材
            latestChapterExcerpt = String(chapterContent.content).slice(0, 500);
          }
        }
      } catch { /* 忽略 */ }

      // 随机选择文案风格，增加多样性
      const style = POSTER_STYLES[Math.floor(Math.random() * POSTER_STYLES.length)];

      // 调用 AI 生成推广文案
      let headline = novel.title;
      let tagline = '';
      let hooks: string[] = [];

      const agent = agents?.get('marketing-writer');
      if (agent && modelClient) {
        const context: AgentContext = {
          novelId,
          genre: novel.genre || '奇幻',
          novelTitle: novel.title,
          novelSynopsis: novel.synopsis || novel.description || '',
          characterContext,
          worldContext,
          userDirection: `请为这部小说的分享海报生成推广文案。

**本次文案风格：${style.name}**
${style.direction}
参考感觉：${style.examples}

要求：
1. headline：核心 slogan，8-12 字，要有冲击力，符合${style.name}的风格
2. tagline：副文案，15-25 字，突出这部小说的独特卖点
3. hooks：3 条宣传短句，每条 10-20 字，从不同角度吸引读者

输出 JSON 格式：{"headline": "...", "tagline": "...", "hooks": ["...", "...", "..."]}
不要输出额外解释。文案要吸睛、有网感，适合朋友圈传播。${latestChapterExcerpt ? '\n\n参考最新剧情片段（可用于提取悬念或金句）：\n' + latestChapterExcerpt : ''}`,
        };

        const output = await agent.execute(context, modelClient);
        try {
          const cleaned = output.content
            .replace(/```json\s*/gi, '').replace(/```\s*/g, '')
            .trim();
          const parsed = JSON.parse(cleaned);
          headline = parsed.headline || novel.title;
          tagline = parsed.tagline || '';
          hooks = Array.isArray(parsed.hooks) ? parsed.hooks : [];
        } catch {
          tagline = output.content.slice(0, 50);
        }
      }

      // 获取用户笔名（优先 penName，其次 username，最后 '佚名'）
      let authorName = '佚名';
      const userId = getUserId(req);
      if (userId && authDb) {
        try {
          const profile = await getProfile(authDb, userId);
          if (profile?.penName) authorName = profile.penName;
          else if (profile?.username) authorName = profile.username;
        } catch { /* 忽略 */ }
      }

      // 检查作品是否已上架书城，决定"立即阅读"跳转目标
      let readUrl: string | undefined;
      if (bookStoreManager) {
        try {
          const storeBook = await bookStoreManager.getBookByNovelId(novelId);
          if (storeBook && storeBook.publishStatus === 'approved') {
            readUrl = `../../../m/bookstore/${encodeURIComponent(storeBook.id)}/read`;
          }
        } catch { /* 忽略，降级到默认 URL */ }
      }

      // 生成 HTML 海报页面
      const posterId = posterService.createPosterPage({
        novelId,
        novelTitle: novel.title,
        authorName,
        category: novel.genre,
        chapterCount: novel.chapterCount || chapterSummaries.length,
        wordCount: novel.wordCount || 0,
        synopsis: novel.synopsis || novel.description || '',
        coverImage: novel.coverImage,
        headline,
        tagline,
        hooks,
        latestChapters,
        readUrl,
      });

      // pageUrl 用相对路径，前端拼接 deploy base
      res.json({
        posterId,
        pageUrl: `/posters/page/${posterId}`,
        headline,
        tagline,
        hooks,
        novelTitle: novel.title,
        authorName: (novel as any).authorName || '佚名',
        chapterCount: novel.chapterCount || chapterSummaries.length,
        wordCount: novel.wordCount || 0,
        category: novel.genre,
      });

    } catch (err: any) {
      res.status(500).json({ error: err?.message || '生成失败' });
    }
  });

  // GET /api/posters/page/:posterId - 返回 HTML 海报页面（自包含，可直接分享）
  router.get('/page/:posterId', (req: Request, res: Response) => {
    const posterId = String(req.params.posterId ?? '');
    if (!posterId || !/^[\w-]+$/.test(posterId)) {
      res.status(400).type('text/html').send('<!DOCTYPE html><meta charset="utf-8"><h1>无效的海报链接</h1>');
      return;
    }
    const html = posterService.readPosterHtml(posterId);
    if (!html) {
      res.status(404).type('text/html').send('<!DOCTYPE html><meta charset="utf-8"><h1>海报不存在或已过期</h1>');
      return;
    }
    res.type('text/html').send(html);
  });

  // POST /api/posters/page/:posterId/track - 记录海报访问（免认证，外部用户调用）
  router.post('/page/:posterId/track', (req: Request, res: Response) => {
    const posterId = String(req.params.posterId ?? '');
    if (!posterId || !/^[\w-]+$/.test(posterId)) {
      res.status(400).json({ error: 'invalid posterId' });
      return;
    }
    const { channel, device, visitorId } = req.body ?? {};
    posterService.recordView(posterId, {
      channel: String(channel || 'direct'),
      device: String(device || 'unknown'),
      visitorId: String(visitorId || 'anonymous'),
    });
    res.json({ ok: true });
  });

  // POST /api/posters/page/:posterId/track-read - 记录"立即阅读"点击（免认证）
  router.post('/page/:posterId/track-read', (req: Request, res: Response) => {
    const posterId = String(req.params.posterId ?? '');
    if (!posterId || !/^[\w-]+$/.test(posterId)) {
      res.status(400).json({ error: 'invalid posterId' });
      return;
    }
    posterService.recordRead(posterId);
    res.json({ ok: true });
  });

  // GET /api/posters/:posterId/stats - 获取海报统计数据（需认证）
  router.get('/:posterId/stats', (req: Request, res: Response) => {
    const posterId = String(req.params.posterId ?? '');
    if (!posterId) { res.status(400).json({ error: '缺少 posterId' }); return; }
    const stats = posterService.getStats(posterId);
    res.json({ stats: stats ?? {
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
    }});
  });

  // GET /api/posters/list?novelId=xxx - 列出某小说的海报历史
  router.get('/list', (req: Request, res: Response) => {
    const novelId = String(req.query.novelId ?? '');
    if (!novelId) { res.status(400).json({ error: '缺少 novelId' }); return; }
    const pages = posterService.listPages(novelId);
    res.json({ pages: pages.map((p) => ({ ...p, pageUrl: `/posters/page/${p.posterId}` })) });
  });

  // PATCH /api/posters/:posterId/disable - 禁用海报
  router.patch('/:posterId/disable', (req: Request, res: Response) => {
    const posterId = String(req.params.posterId ?? '');
    if (!posterId) { res.status(400).json({ error: '缺少 posterId' }); return; }
    const record = posterService.disablePage(posterId);
    if (!record) { res.status(404).json({ error: '海报不存在' }); return; }
    res.json({ page: record });
  });

  // PATCH /api/posters/:posterId/enable - 启用海报
  router.patch('/:posterId/enable', (req: Request, res: Response) => {
    const posterId = String(req.params.posterId ?? '');
    if (!posterId) { res.status(400).json({ error: '缺少 posterId' }); return; }
    const record = posterService.enablePage(posterId);
    if (!record) { res.status(404).json({ error: '海报不存在' }); return; }
    res.json({ page: record });
  });

  // DELETE /api/posters/:posterId - 永久删除海报
  router.delete('/:posterId', (req: Request, res: Response) => {
    const posterId = String(req.params.posterId ?? '');
    if (!posterId) { res.status(400).json({ error: '缺少 posterId' }); return; }
    const ok = posterService.deletePage(posterId);
    if (!ok) { res.status(404).json({ error: '海报不存在' }); return; }
    res.json({ success: true });
  });

  // POST /api/posters/redeem
  router.post('/redeem', (req: Request, res: Response) => {
    const { inviteCode } = req.body ?? {};
    const userId = getUserId(req);
    if (!inviteCode || !userId) { res.status(400).json({ error: 'Missing inviteCode or unauthorized' }); return; }
    const result = posterService.redeemInviteCode(String(inviteCode), userId);
    if (!result) { res.status(404).json({ error: '邀请码无效或已使用' }); return; }
    res.json({ novelId: result.novelId, inviterId: result.inviterId });
  });

  return router;
}
