import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ComicAdapter } from '../../adaptation/comic-adapter.js';
import { SceneCardExtractor } from '../../adaptation/scene-card-extractor.js';
import { ComicImageService, type ComicManifest, type ComicPanelResult } from '../../comic/comic-image-service.js';
import { ComicPipeline } from '../../comic/comic-pipeline.js';
import { CharacterDNAStore } from '../../comic/comic-dna-store.js';
import { generateAndSaveDNA } from '../../comic/comic-dna-generator.js';
import type { ComicSceneList } from '../../comic/comic-types.js';
import type { ModelClient } from '../../models/types.js';
import { getNovelsDir, readSettings } from '../../config/index.js';
import { now } from '../../utils/text.js';
import { ensureNovelAccess } from './handlers/adaptation/route-support.js';
import { beginAIBilling, settleAIBilling } from './handlers/billing-guard.js';
import { resolveUserModelAccess } from './helpers/user-api-model-resolver.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';
import { buildHttpErrorResponse } from './handlers/shared/http-error-response.js';
import type { AuthDb } from '../../auth/types.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { CharacterProfile } from '../../novel/types.js';
import type { AdaptationManager } from '../../adaptation/adaptation-manager.js';
import type { BillingService } from '../../billing/billing-service.js';
import type { ImageGenerationClient } from '../../models/image-client.js';
import type { NotificationService } from '../../services/notification-service.js';
import type { UnifiedMessageService } from '../../services/unified-message-service.js';
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';

export type ComicRouterDeps = {
  novelManager: NovelManager;
  adaptationManager: AdaptationManager;
  comicPipeline?: ComicPipeline;
  modelClient?: ModelClient;
  imageClient?: ImageGenerationClient;
  authDb?: AuthDb;
  billingService?: BillingService;
  notificationService?: NotificationService;
  unifiedMessageService?: UnifiedMessageService;
  bookStoreManager?: BookStoreManager;
};

/** 单章最多渲染格数上限（防滥用） */
const COMIC_MAX_PANELS_LIMIT = 6;
const COMIC_DEFAULT_PANELS = 3;
/** 单格图片文件名白名单：panel-{panelIndex}-{8位hex}.{png|jpg|jpeg|webp} */
const PANEL_FILE_PATTERN = /^panel-\d+-[a-f0-9]{8}\.(png|jpg|jpeg|webp)$/;
/** novelId 白名单（UUID 形态，防路径穿越） */
const NOVEL_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

export function createComicRouter(deps: ComicRouterDeps): Router {
  const router = Router({ mergeParams: true });
  const comicAdapter = new ComicAdapter();
  const extractor = new SceneCardExtractor();
  const dnaStore = new CharacterDNAStore();

  /**
   * 从角色档案 + DNA 构建 prompt 工程师的角色视觉参考卡。
   * 只含服饰、体型、姿态——不含五官（五官由参考图 + 锚点锁定）。
   * 这样 prompt 工程师能准确描述 "穿深灰西装的高瘦男性" 而非泛泛 "a man in suit"。
   */
  async function buildCharacterBriefForPromptEngineer(
    chars: CharacterProfile[],
    nid: string,
  ): Promise<string> {
    const lines: string[] = [];
    for (const c of chars) {
      const dna = await dnaStore.get(nid, c.id);
      const outfit = dna?.outfit?.main || c.appearance?.split('，')[0] || '';
      const build = dna?.body?.build || '';
      const hair = dna?.hair?.style || '';
      const gender = dna?.gender || c.gender || '';
      const parts: string[] = [c.name];
      if (gender) parts.push(`(${gender})`);
      if (build) parts.push(`- ${build}`);
      if (hair) parts.push(`- ${hair}`);
      if (outfit) parts.push(`- 服饰：${outfit}`);
      lines.push(parts.join(' '));
    }
    return lines.join('\n');
  }

  /**
   * 层2 开关守卫：功能关闭时所有端点返回 404，等价于路由不存在。
   * 与前端入口 v-if、计费规则 enabled 共同构成「关闭即无痕」三重保险。
   */
  function isComicEnabled(): boolean {
    return readSettings().comicChapterEnabled;
  }

  // ── 角色 DNA：批量检查（只返回已存在的 DNA，永远 200，无 404 噪音） ──
  router.get('/dna-check', async (req, res) => {
    if (!isComicEnabled()) {
      res.json({});
      return;
    }
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const raw = String((req.query as Record<string, string>).charIds ?? '');
      const charIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
      const result: Record<string, boolean> = {};
      for (const cid of charIds) {
        result[cid] = !!(await dnaStore.get(novelId, cid));
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '批量检查 DNA 失败') });
    }
  });

  // ── 批量漫画状态（一次返回所有章节的漫画状态，避免逐章 404） ──
  router.get('/_status', async (req, res) => {
    if (!isComicEnabled()) {
      res.json({});
      return;
    }
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const comicDir = path.join(getNovelsDir(), novelId, 'comics');
      const result: Record<string, string> = {};
      try {
        const entries = await fs.readdir(comicDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || !entry.name.startsWith('chapter-')) continue;
          const cn = entry.name.replace('chapter-', '');
          const mfPath = path.join(comicDir, entry.name, 'manifest.json');
          try {
            const raw = await fs.readFile(mfPath, 'utf-8');
            const mf = JSON.parse(raw);
            if (mf.status) result[cn] = mf.status;
          } catch { /* 忽略 */ }
        }
      } catch { /* 目录不存在，返回空 */ }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取漫画状态失败') });
    }
  });

  // ── 生成本章漫画 ──
  router.post('/:chapter', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    if (!deps.imageClient) {
      res.status(503).json({ error: '图像生成服务未配置，请在设置页配置 IMAGE_API_KEY' });
      return;
    }

    const billingUserId = req.auth?.id;
    let freezeId: string | undefined;
    let frozenPoints = 0;
    let panelCount = COMIC_DEFAULT_PANELS;

    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;

      const chapterNumber = Number(req.params.chapter);
      if (!Number.isFinite(chapterNumber) || chapterNumber < 1) {
        res.status(400).json({ error: '章节号无效' });
        return;
      }

      const { size, maxPanels } = (req.body ?? {}) as { size?: string; maxPanels?: number };
      panelCount = Math.max(1, Math.min(COMIC_MAX_PANELS_LIMIT, Math.floor(maxPanels ?? COMIC_DEFAULT_PANELS)));

      const novel = await deps.novelManager.getNovel(novelId);
      const characters = await deps.novelManager.getCharacters(novelId);

      // 取/提取 SceneCard（已有则复用）
      let sceneCards = await deps.adaptationManager.getSceneCards(novelId, chapterNumber);
      if (sceneCards.length === 0) {
        const chapterData = await deps.novelManager.getChapter(novelId, chapterNumber);
        if (!chapterData?.content?.trim()) {
          res.status(400).json({ error: '章节内容为空，无法生成漫画' });
          return;
        }
        sceneCards = extractor.extract({
          chapterNumber,
          chapterTitle: chapterData.title,
          chapterContent: chapterData.content,
          characters: characters.map((c) => ({ id: c.id, name: c.name })),
        });
        await deps.adaptationManager.saveSceneCards(novelId, chapterNumber, sceneCards);
      }

      // 计费预扣（per_call × 格数）
      const modelAccess = await resolveUserModelAccess({
        authDb: deps.authDb,
        userId: billingUserId,
        headers: req.headers,
        novel,
      });
      const isAdmin = req.auth?.role === 'admin';
      // admin 免计费（自部署场景 admin 自用不扣自己积分），与 BYOK 同等 bypass
      const bypassBilling = modelAccess.billingBypass || isAdmin;
      if (!bypassBilling && deps.billingService && billingUserId && billingUserId !== 'dev') {
        try {
          const guard = await beginAIBilling({
            billingService: deps.billingService,
            userId: billingUserId,
            operation: 'comicPanel',
            quantity: panelCount,
            bizType: 'comic.panel',
            bizId: `comic:${novelId}:${chapterNumber}`,
          });
          freezeId = guard.freezeId;
          frozenPoints = guard.estimatedPoints;
        } catch (billingErr) {
          const msg = billingErr instanceof Error ? billingErr.message : String(billingErr);
          res.status(402).json({ error: msg, code: 'INSUFFICIENT_BALANCE' });
          return;
        }
      }

      // 出图（服务在确认 imageClient 后构造，保证拿到最新实例）
      const comicImageService = new ComicImageService(deps.imageClient, comicAdapter);
      const manifest = await comicImageService.generateChapter({
        novelId,
        chapterNumber,
        sceneCards,
        characters,
        size,
        maxPanels: panelCount,
      });

      // 结算：按实际成功格数（失败格退还）
      if (freezeId && deps.billingService && billingUserId) {
        const successCount = manifest.panels.filter((p) => !p.failed).length;
        const actualPoints = Math.round((frozenPoints * successCount) / panelCount);
        await settleAIBilling(deps.billingService, billingUserId, freezeId, actualPoints);
      }

      res.status(201).json(manifest);
    } catch (err) {
      if (freezeId && deps.billingService && billingUserId) {
        settleAIBilling(deps.billingService, billingUserId, freezeId, 0).catch(() => undefined);
      }
      const { statusCode, payload } = buildHttpErrorResponse(err, '生成章节漫画失败');
      res.status(statusCode).json(payload);
    }
  });

  // ── 读取本章漫画 manifest ──
  router.get('/:chapter', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const chapterNumber = Number(req.params.chapter);
      const chapterDir = path.join(getNovelsDir(), novelId, `comics/chapter-${chapterNumber}`);
      const manifestPath = path.join(chapterDir, 'manifest.json');
      let raw: string;
      try {
        raw = await fs.readFile(manifestPath, 'utf-8');
      } catch {
        res.json(null);
        return;
      }
      const manifest = JSON.parse(raw) as ComicManifest;

      // 过滤掉已失效的 panel（imagePath 指向的文件已不存在），防止展示残影/错位
      const validPanelPaths = new Set<string>();
      const validPanels: typeof manifest.panels = [];
      for (const panel of manifest.panels) {
        if (panel.imagePath) {
          const filePath = path.join(getNovelsDir(), novelId, panel.imagePath);
          try {
            await fs.access(filePath);
            validPanels.push(panel);
            validPanelPaths.add(panel.imagePath);
          } catch {
            // 文件不存在，该面板视为已删除
          }
        } else {
          // 无图片路径，保留（可能正在生成中）
          validPanels.push(panel);
        }
      }

      // 如果过滤后 panels 变了，写回清理后的 manifest
      if (validPanels.length !== manifest.panels.length) {
        manifest.panels = validPanels;
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      }

      // 清理孤立的 panel 图片文件（manifest 未引用但残留磁盘的旧文件）
      try {
        const dirEntries = await fs.readdir(chapterDir);
        for (const entry of dirEntries) {
          if (!PANEL_FILE_PATTERN.test(entry)) continue;
          const relPath = `comics/chapter-${chapterNumber}/${entry}`;
          if (!validPanelPaths.has(relPath)) {
            await fs.unlink(path.join(getNovelsDir(), novelId, relPath)).catch(() => undefined);
          }
        }
      } catch { /* 目录不存在，忽略 */ }

      res.json(manifest);
    } catch (err) {
      const missing = err instanceof Error && 'code' in err && err.code === 'ENOENT';
      if (missing) {
        res.status(404).json({ error: '本章尚未生成漫画' });
      } else {
        res.status(500).json({ error: safeErrorMessage(err, '读取漫画失败') });
      }
    }
  });

  // ── 读取单格图片（流式返回） ──
  router.get('/:chapter/panels/:file', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    try {
      const novelId = String((req.params as Record<string, string>).novelId ?? '');
      if (!NOVEL_ID_PATTERN.test(novelId)) {
        res.status(400).json({ error: '无效的小说 ID' });
        return;
      }
      const chapterNumber = Number(req.params.chapter);
      const file = String(req.params.file);
      if (!PANEL_FILE_PATTERN.test(file)) {
        res.status(400).json({ error: '无效的图片名' });
        return;
      }
      const filePath = path.join(
        getNovelsDir(), novelId, `comics/chapter-${chapterNumber}`, file,
      );
      const bytes = await fs.readFile(filePath);
      const ext = path.extname(file).toLowerCase();
      const mime = ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(bytes);
    } catch (err) {
      const missing = err instanceof Error && 'code' in err && err.code === 'ENOENT';
      res.status(missing ? 404 : 500).json({
        error: missing ? '图片不存在' : safeErrorMessage(err, '读取图片失败'),
      });
    }
  });

  // ── 发布本章漫画（draft → published；已发布的不被定期清理，可供书城读者） ──
  router.post('/:chapter/publish', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const chapterNumber = Number(req.params.chapter);
      const manifestPath = path.join(getNovelsDir(), novelId, `comics/chapter-${chapterNumber}`, 'manifest.json');
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as ComicManifest;
        if (manifest.status === 'published') {
          res.json({ ...manifest, alreadyPublished: true });
          return;
        }
        manifest.status = 'published';
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

        // 漫画发布通知：通知收藏该小说的读者（异步，不阻塞）
        if (deps.unifiedMessageService && deps.bookStoreManager) {
          const unifiedMessageService = deps.unifiedMessageService;
          const bookStoreManager = deps.bookStoreManager;
          void (async () => {
            try {
              const novel = await deps.novelManager.getNovel(novelId);
              if (!novel) return;
              const book = await bookStoreManager.getBookByNovelId(novelId);
              if (!book || !Array.isArray(book.favoritedBy) || book.favoritedBy.length === 0) return;
              for (const userId of book.favoritedBy) {
                unifiedMessageService.notifyComicPublished({
                  userId,
                  novelId,
                  novelTitle: novel.title || '未命名小说',
                  chapterNumber,
                });
              }
              console.log('[comic] 漫画发布通知已发送', { novelId, chapterNumber, recipientCount: book.favoritedBy.length });
            } catch (err) {
              console.warn('[comic] 漫画发布通知发送失败', err instanceof Error ? err.message : String(err));
            }
          })();
        }

        res.json(manifest);
      } catch (err) {
        const missing = err instanceof Error && 'code' in err && err.code === 'ENOENT';
        res.status(missing ? 404 : 500).json({
          error: missing ? '本章尚未生成漫画，无法发布' : safeErrorMessage(err, '发布失败'),
        });
      }
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '发布失败') });
    }
  });

  // ── 设计漫画场景（①剧情挖掘 + ②分镜设计，AI 产出场景列表） ──
  router.post('/:chapter/design-scenes', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    if (!deps.comicPipeline || !deps.modelClient) {
      res.status(503).json({ error: '漫画生成管线未就绪（需配置 AI 模型）' });
      return;
    }
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const chapterNumber = Number(req.params.chapter);
      if (!Number.isFinite(chapterNumber) || chapterNumber < 1) {
        res.status(400).json({ error: '章节号无效' });
        return;
      }
      const novel = await deps.novelManager.getNovel(novelId);
      const modelAccess = await resolveUserModelAccess({
        authDb: deps.authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      const model = modelAccess.client ?? deps.modelClient;
      const { mode } = (req.body ?? {}) as { mode?: 'replace' | 'append' };
      const sceneList = await deps.comicPipeline.designScenes(novelId, chapterNumber, model, mode ?? 'replace');
      res.status(201).json(sceneList);
    } catch (err) {
      const { statusCode, payload } = buildHttpErrorResponse(err, '设计漫画场景失败');
      res.status(statusCode).json(payload);
    }
  });

  // ── 读取场景列表（作者勾选场景用） ──
  router.get('/:chapter/scenes', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const chapterNumber = Number(req.params.chapter);
      const scenesPath = path.join(getNovelsDir(), novelId, `comics/chapter-${chapterNumber}`, 'scene-list.json');
      const raw = await fs.readFile(scenesPath, 'utf-8');
      res.json(JSON.parse(raw) as ComicSceneList);
    } catch (err) {
      const missing = err instanceof Error && 'code' in err && err.code === 'ENOENT';
      res.status(missing ? 404 : 500).json({
        error: missing ? '本章尚未设计漫画场景' : safeErrorMessage(err, '读取场景列表失败'),
      });
    }
  });

  // ── 删除单个候选分镜场景（只删除候选脚本，不删除已生成漫画格） ──
  router.delete('/:chapter/scenes/:sceneId', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const chapterNumber = Number(req.params.chapter);
      const sceneId = String(req.params.sceneId ?? '').trim();
      if (!Number.isFinite(chapterNumber) || chapterNumber < 1 || !sceneId) {
        res.status(400).json({ error: '章节号或场景 ID 无效' });
        return;
      }

      const chapterDir = path.join(getNovelsDir(), novelId, `comics/chapter-${chapterNumber}`);
      const scenesPath = path.join(chapterDir, 'scene-list.json');
      const sceneList = JSON.parse(await fs.readFile(scenesPath, 'utf-8')) as ComicSceneList;
      const exists = sceneList.scenes.some((scene) => scene.sceneId === sceneId);
      if (!exists) {
        res.status(404).json({ error: '候选场景不存在' });
        return;
      }

      const manifestPath = path.join(chapterDir, 'manifest.json');
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as ComicManifest;
        const usedByPanel = manifest.panels.some((panel) => panel.sceneId === sceneId);
        if (usedByPanel) {
          res.status(409).json({ error: '该场景已生成漫画格，保留后可继续单格重生' });
          return;
        }
      } catch {
        // 未生成 manifest 时可直接删除候选。
      }

      const nextSceneList: ComicSceneList = {
        ...sceneList,
        scenes: sceneList.scenes.filter((scene) => scene.sceneId !== sceneId),
      };
      await fs.writeFile(scenesPath, JSON.stringify(nextSceneList, null, 2), 'utf-8');
      res.json(nextSceneList);
    } catch (err) {
      const missing = err instanceof Error && 'code' in err && err.code === 'ENOENT';
      res.status(missing ? 404 : 500).json({
        error: missing ? '本章尚未设计漫画场景' : safeErrorMessage(err, '删除候选场景失败'),
      });
    }
  });

  // ── 生成选中场景的漫画（③prompt工程师 + 出图，作者勾选后的闭环） ──
  router.post('/:chapter/generate-selected', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    if (!deps.comicPipeline || !deps.imageClient || !deps.modelClient) {
      res.status(503).json({ error: '漫画生成管线未就绪（需配置 AI 模型与图像模型）' });
      return;
    }
    const billingUserId = req.auth?.id;
    let freezeId: string | undefined;
    let frozenPoints = 0;
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const chapterNumber = Number(req.params.chapter);
      const { sceneIds, comicStyle } = (req.body ?? {}) as { sceneIds?: string[]; comicStyle?: string };
      if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
        res.status(400).json({ error: '请至少选择一个场景' });
        return;
      }

      // 读场景列表 + 筛选选中场景
      const scenesPath = path.join(getNovelsDir(), novelId, `comics/chapter-${chapterNumber}`, 'scene-list.json');
      let sceneList: ComicSceneList;
      try {
        sceneList = JSON.parse(await fs.readFile(scenesPath, 'utf-8')) as ComicSceneList;
      } catch {
        res.status(404).json({ error: '请先设计漫画场景' });
        return;
      }
      const selectedScenes = sceneList.scenes.filter((s) => sceneIds.includes(s.sceneId));
      if (selectedScenes.length === 0) {
        res.status(400).json({ error: '选中的场景不存在' });
        return;
      }

      const novel = await deps.novelManager.getNovel(novelId);
      const characters = await deps.novelManager.getCharacters(novelId);
      const modelAccess = await resolveUserModelAccess({
        authDb: deps.authDb,
        userId: billingUserId,
        headers: req.headers,
        novel,
      });
      const isAdmin = req.auth?.role === 'admin';
      const bypassBilling = modelAccess.billingBypass || isAdmin;
      const model = modelAccess.client ?? deps.modelClient;

      // 计费预扣（按选中场景数 × 单格价）
      if (!bypassBilling && deps.billingService && billingUserId && billingUserId !== 'dev') {
        try {
          const guard = await beginAIBilling({
            billingService: deps.billingService,
            userId: billingUserId,
            operation: 'comicPanel',
            quantity: selectedScenes.length,
            bizType: 'comic.panel',
            bizId: `comic:${novelId}:${chapterNumber}:sel`,
          });
          freezeId = guard.freezeId;
          frozenPoints = guard.estimatedPoints;
        } catch (billingErr) {
          const msg = billingErr instanceof Error ? billingErr.message : String(billingErr);
          res.status(402).json({ error: msg, code: 'INSUFFICIENT_BALANCE' });
          return;
        }
      }

      // 异步出图（不阻塞请求，立即返回；后台逐个出图 + 增量写 manifest + 结算）
      // 解决"选多个场景同步等待整体超时"问题——前端轮询 manifest 拿增量
      const total = selectedScenes.length;

      // 构建角色视觉参考卡片（供 prompt 工程师描述角色时使用，不含五官细节）
      const characterContextForPrompt = await buildCharacterBriefForPromptEngineer(characters, novelId);

      void (async () => {
        try {
          const prompts = await deps.comicPipeline!.generatePrompts(
            selectedScenes, model, characterContextForPrompt,
          );
          const comicImageService = new ComicImageService(deps.imageClient!, comicAdapter);
          const manifest = await comicImageService.renderFromScenes({
            novelId,
            chapterNumber,
            scenes: selectedScenes,
            prompts,
            characters,
            comicStyle,
            onPanelComplete: (panel) => {
              // 每格完成发通知中心消息（含 route，点击跳回漫画定位该格）
              if (!billingUserId || !deps.notificationService) return;
              try {
                deps.notificationService.addInAppNotification(billingUserId, {
                  userId: billingUserId,
                  type: 'system',
                  title: `第 ${panel.panelIndex} 格漫画生成完成`,
                  body: panel.failed ? '该格生成失败，可重新生成' : '点击查看本章漫画',
                  data: {
                    novelId,
                    chapterNumber,
                    route: `/m/novel/${novelId}/read?comicPanel=${panel.panelIndex}`,
                  },
                });
              } catch (err) {
                console.warn('[comic] 发送完成通知失败', err instanceof Error ? err.message : String(err));
              }
            },
          });
          // 结算（按成功格数，失败格退还）
          if (freezeId && deps.billingService && billingUserId) {
            const successCount = manifest.panels.filter((p) => !p.failed).length;
            const actualPoints = Math.round((frozenPoints * successCount) / total);
            await settleAIBilling(deps.billingService, billingUserId, freezeId, actualPoints);
          }
        } catch (err) {
          console.error('[comic] 后台生成漫画失败', err instanceof Error ? err.message : String(err));
          if (freezeId && deps.billingService && billingUserId) {
            await settleAIBilling(deps.billingService, billingUserId, freezeId, 0).catch(() => undefined);
          }
        }
      })();

      res.status(202).json({ started: true, total });
    } catch (err) {
      if (freezeId && deps.billingService && billingUserId) {
        settleAIBilling(deps.billingService, billingUserId, freezeId, 0).catch(() => undefined);
      }
      const { statusCode, payload } = buildHttpErrorResponse(err, '生成漫画失败');
      res.status(statusCode).json(payload);
    }
  });

  // ── 单格原位重试：按该格对应的 sceneId/pageIndex/panelIndexInPage 重新出图并替换 manifest ──
  router.post('/:chapter/panels/:panelIndex/regenerate', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    if (!deps.comicPipeline || !deps.imageClient || !deps.modelClient) {
      res.status(503).json({ error: '漫画生成管线未就绪（需配置 AI 模型与图像模型）' });
      return;
    }

    const billingUserId = req.auth?.id;
    let freezeId: string | undefined;
    let frozenPoints = 0;

    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const chapterNumber = Number(req.params.chapter);
      const panelIndex = Number(req.params.panelIndex);
      if (!Number.isFinite(chapterNumber) || chapterNumber < 1 || !Number.isFinite(panelIndex) || panelIndex < 1) {
        res.status(400).json({ error: '章节号或格号无效' });
        return;
      }

      const manifestPath = path.join(getNovelsDir(), novelId, `comics/chapter-${chapterNumber}`, 'manifest.json');
      const scenesPath = path.join(getNovelsDir(), novelId, `comics/chapter-${chapterNumber}`, 'scene-list.json');
      let manifest: ComicManifest;
      let sceneList: ComicSceneList;
      try {
        manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as ComicManifest;
        sceneList = JSON.parse(await fs.readFile(scenesPath, 'utf-8')) as ComicSceneList;
      } catch {
        res.status(404).json({ error: '请先设计并生成本章漫画' });
        return;
      }

      const panel = manifest.panels.find((p) => p.panelIndex === panelIndex);
      if (!panel) {
        res.status(404).json({ error: '该格不存在' });
        return;
      }

      const scene = findSceneForPanel(sceneList, panel);
      if (!scene) {
        res.status(404).json({ error: '找不到该格对应的分镜场景，请重新选择场景生成' });
        return;
      }

      const novel = await deps.novelManager.getNovel(novelId);
      const characters = await deps.novelManager.getCharacters(novelId);
      const modelAccess = await resolveUserModelAccess({
        authDb: deps.authDb,
        userId: billingUserId,
        headers: req.headers,
        novel,
      });
      const isAdmin = req.auth?.role === 'admin';
      const bypassBilling = modelAccess.billingBypass || isAdmin;
      const model = modelAccess.client ?? deps.modelClient;

      if (!bypassBilling && deps.billingService && billingUserId && billingUserId !== 'dev') {
        try {
          const guard = await beginAIBilling({
            billingService: deps.billingService,
            userId: billingUserId,
            operation: 'comicPanel',
            quantity: 1,
            bizType: 'comic.panel',
            bizId: `comic:${novelId}:${chapterNumber}:${panelIndex}:retry`,
          });
          freezeId = guard.freezeId;
          frozenPoints = guard.estimatedPoints;
        } catch (billingErr) {
          const msg = billingErr instanceof Error ? billingErr.message : String(billingErr);
          res.status(402).json({ error: msg, code: 'INSUFFICIENT_BALANCE' });
          return;
        }
      }

      const { comicStyle } = (req.body ?? {}) as { comicStyle?: string };
      const characterContextForPrompt = await buildCharacterBriefForPromptEngineer(characters, novelId);
      const prompts = await deps.comicPipeline.generatePrompts([scene], model, characterContextForPrompt);
      const comicImageService = new ComicImageService(deps.imageClient, comicAdapter);
      const nextPanel = await comicImageService.renderSceneReplacement({
        novelId,
        chapterNumber,
        scene,
        finalPrompt: prompts[0]?.finalPrompt ?? scene.promptDraft,
        characters,
        panelIndex,
        total: manifest.panels.length,
        size: manifest.size,
        comicStyle,
      });

      const oldImagePath = panel.imagePath;
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as ComicManifest;
      manifest.panels = manifest.panels.map((item) => (item.panelIndex === panelIndex ? nextPanel : item));
      manifest.generatedAt = now();
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      if (oldImagePath && oldImagePath !== nextPanel.imagePath) {
        await fs.unlink(path.join(getNovelsDir(), novelId, oldImagePath)).catch(() => undefined);
      }

      if (freezeId && deps.billingService && billingUserId) {
        await settleAIBilling(deps.billingService, billingUserId, freezeId, nextPanel.failed ? 0 : frozenPoints);
      }

      res.json(manifest);
    } catch (err) {
      if (freezeId && deps.billingService && billingUserId) {
        settleAIBilling(deps.billingService, billingUserId, freezeId, 0).catch(() => undefined);
      }
      const { statusCode, payload } = buildHttpErrorResponse(err, '重新生成该格失败');
      res.status(statusCode).json(payload);
    }
  });

  // ── 删除单格漫画 ──
  router.delete('/:chapter/panels/:panelIndex', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const chapterNumber = Number(req.params.chapter);
      const panelIndex = Number(req.params.panelIndex);
      const manifestPath = path.join(getNovelsDir(), novelId, `comics/chapter-${chapterNumber}`, 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as ComicManifest;
      const panel = manifest.panels.find((p) => p.panelIndex === panelIndex);
      if (!panel) {
        res.status(404).json({ error: '该格不存在' });
        return;
      }
      if (panel.imagePath) {
        await fs.unlink(path.join(getNovelsDir(), novelId, panel.imagePath)).catch(() => undefined);
      }
      manifest.panels = manifest.panels.filter((p) => p.panelIndex !== panelIndex);
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      res.json(manifest);
    } catch (err) {
      const missing = err instanceof Error && 'code' in err && err.code === 'ENOENT';
      res.status(missing ? 404 : 500).json({
        error: missing ? '本章尚未生成漫画' : safeErrorMessage(err, '删除失败'),
      });
    }
  });

  // ── 排序漫画格（传新顺序的 panelIndex 数组） ──
  router.post('/:chapter/reorder', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const chapterNumber = Number(req.params.chapter);
      const { panelIndices } = (req.body ?? {}) as { panelIndices?: number[] };
      if (!Array.isArray(panelIndices)) {
        res.status(400).json({ error: '缺少 panelIndices' });
        return;
      }
      const manifestPath = path.join(getNovelsDir(), novelId, `comics/chapter-${chapterNumber}`, 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as ComicManifest;
      manifest.panels = panelIndices
        .map((idx) => manifest.panels.find((p) => p.panelIndex === idx))
        .filter((p): p is ComicPanelResult => Boolean(p));
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      res.json(manifest);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '排序失败') });
    }
  });

  // ── 角色 DNA：生成（分析角色档案 → 结构化 DNA + 英文 prompt 片段） ──
  router.post('/character-dna/:charId', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    if (!deps.modelClient) {
      res.status(503).json({ error: 'AI 模型未配置' });
      return;
    }
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const charId = String(req.params.charId);

      const novel = await deps.novelManager.getNovel(novelId);
      const characters = await deps.novelManager.getCharacters(novelId);
      const char = characters.find((c) => c.id === charId);
      if (!char) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      const modelAccess = await resolveUserModelAccess({
        authDb: deps.authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      const model = modelAccess.client ?? deps.modelClient;
      if (!model) {
        res.status(503).json({ error: 'AI 模型未配置，无法生成角色 DNA' });
        return;
      }

      try {
        const dna = await generateAndSaveDNA({ char, model, novel: { id: novelId, genre: novel.genre, title: novel.title, synopsis: novel.synopsis } });
        res.status(201).json(dna);
      } catch (parseErr) {
        console.error('[comic] DNA 解析失败', parseErr instanceof Error ? parseErr.message : String(parseErr));
        res.status(500).json({
          error: `DNA 解析失败：${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        });
      }
    } catch (err) {
      const { statusCode, payload } = buildHttpErrorResponse(err, '生成角色 DNA 失败');
      res.status(statusCode).json(payload);
    }
  });

  // ── 角色 DNA：读取 ──
  router.get('/character-dna/:charId', async (req, res) => {
    if (!isComicEnabled()) {
      res.status(404).json({ error: '章节漫画功能未开启' });
      return;
    }
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) return;
      const charId = String(req.params.charId);
      const dna = await dnaStore.get(novelId, charId);
      if (!dna) {
        res.status(404).json({ error: '该角色尚未生成 DNA' });
        return;
      }
      res.json(dna);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '读取 DNA 失败') });
    }
  });

  return router;
}

function findSceneForPanel(sceneList: ComicSceneList, panel: ComicPanelResult) {
  if (panel.sceneId) {
    const byId = sceneList.scenes.find((scene) => scene.sceneId === panel.sceneId);
    if (byId) return byId;
  }
  return sceneList.scenes.find((scene) =>
    scene.pageIndex === panel.pageIndex &&
    scene.panelIndexInPage === panel.panelIndexInPage
  );
}
