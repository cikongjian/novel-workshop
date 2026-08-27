import type { Router } from 'express';
import { signAccessToken } from '../../../../auth/jwt-service.js';
import { UserDisabledError, verifyCredentials, recordLogin } from '../../../../auth/user-service.js';
import { getAiUsageContext } from '../../../../ai/usage-context.js';
import { canAccessNovelByOwner, syncImportNovel, triggerReindex } from '../../sync-import.js';
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from '../../../middleware/login-rate-limit.js';
import {
  getSyncUserScope,
  isValidId,
  MAX_IMPORT_SIZE,
  SyncSessionBody,
  type SyncRouterDeps,
} from './route-support.js';

export function registerPassiveSyncRoutes(
  router: Router,
  deps: SyncRouterDeps,
): void {
  const { authConfig, authDb, backupManager, broadcastJson, novelManager, redis } = deps;

  router.post('/session', async (req, res) => {
    if (!authConfig?.enabled) {
      res.json({ authEnabled: false, accessToken: '' });
      return;
    }
    if (!authDb) {
      res.status(503).json({ error: '认证服务未就绪' });
      return;
    }
    const parsed = SyncSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
      return;
    }

    const { username, password } = parsed.data;

    // 登录限流检查（与 /auth/login 保持一致）
    const retryAfter = await checkLoginRateLimit(username, redis);
    if (retryAfter > 0) {
      res.status(429).json({
        error: '登录尝试过于频繁，请稍后再试',
        code: 'LOGIN_RATE_LIMIT',
        retryAfter,
      });
      return;
    }

    try {
      const user = await verifyCredentials(authDb, username, password);
      if (!user) {
        await recordLoginFailure(username, redis);
        res.status(401).json({ error: '账号或密码错误' });
        return;
      }

      await clearLoginFailures(username, redis);

      // 记录最近登录时间
      void recordLogin(authDb, user.id);

      const accessToken = signAccessToken(
        { userId: user.id, username: user.username, role: user.role },
        authConfig.jwtSecret,
        authConfig.jwtExpiresIn,
      );
      res.json({
        authEnabled: true,
        accessToken,
        user: { id: user.id, username: user.username, role: user.role },
      });
    } catch (err) {
      if (err instanceof UserDisabledError) {
        res.status(401).json({ error: '账号或密码错误' });
        return;
      }
      res.status(500).json({ error: '远端登录失败' });
    }
  });

  router.get('/manifest', async (req, res) => {
    try {
      const scope = getSyncUserScope(req);
      const novels = await novelManager.listNovels();
      const manifest = novels
        .filter((novel) => canAccessNovelByOwner(novel.ownerId, scope))
        .map((novel) => ({
          id: novel.id,
          syncId: novel.syncId ?? novel.id,
          title: novel.title,
          updatedAt: novel.updatedAt,
          chapterCount: novel.chapterCount ?? 0,
        }));
      res.json(manifest);
    } catch {
      res.status(500).json({ error: '获取清单失败' });
    }
  });

  router.get('/export/:novelId', async (req, res) => {
    try {
      if (!isValidId(req.params.novelId)) {
        res.status(400).json({ error: '无效的小说 ID' });
        return;
      }

      const scope = getSyncUserScope(req);
      const novel = await novelManager.getNovel(req.params.novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      if (!canAccessNovelByOwner(novel.ownerId, scope)) {
        res.status(403).json({ error: '无权导出该小说' });
        return;
      }

      const { buffer, title } = await backupManager.exportNovel(req.params.novelId);
      const safeTitle = title.replace(/[^\w\u4e00-\u9fff-]/g, '_');
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.tar.gz"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch {
      res.status(500).json({ error: '导出失败' });
    }
  });

  router.post('/import', async (req, res) => {
    try {
      const contentType = req.headers['content-type'] ?? '';
      if (!contentType.includes('application/gzip') && !contentType.includes('application/octet-stream')) {
        res.status(400).json({ error: '请以 application/gzip 格式上传' });
        return;
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;
      for await (const chunk of req) {
        totalSize += (chunk as Buffer).length;
        if (totalSize > MAX_IMPORT_SIZE) {
          res.status(413).json({ error: '文件过大' });
          return;
        }
        chunks.push(chunk as Buffer);
      }
      if (chunks.length === 0) {
        res.status(400).json({ error: '未收到数据' });
        return;
      }

      const data = Buffer.concat(chunks);
      const scope = getSyncUserScope(req);
      const aiUsageContext = getAiUsageContext();
      const result = await syncImportNovel(data, backupManager, novelManager, scope);

      triggerReindex(result.novelId, broadcastJson, {
        ...(aiUsageContext ?? {
          scope: 'http',
          operationKey: 'sync.import',
          operationLabel: 'Sync import',
          operationRegistered: true,
        }),
        novelId: result.novelId,
      });

      res.status(201).json({
        success: true,
        message: `小说「${result.title}」同步成功`,
        novelId: result.novelId,
        title: result.title,
        isUpdate: result.isUpdate,
      });
    } catch {
      res.status(500).json({ error: '同步导入失败' });
    }
  });
}
