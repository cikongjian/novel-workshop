import type { Router } from 'express';
import {
  getConfig,
  readSettings,
  type SettingsPayload,
  writeSettings,
} from '../../../config/index.js';
import { DEFAULT_COMIC_PANELS_PER_CHAPTER } from '../../../comic/comic-config.js';
import { appendRealNameAuditLog, listRealNameAuditLogs } from '../../../auth/real-name-audit-service.js';
import { getAllowedRealNameVerificationProviders } from '../../../auth/real-name-provider.js';
import { resetTTSEngine } from '../../../tts/engine-factory.js';
import { kokoroServiceManager } from '../../../tts/kokoro-service-manager.js';
import { qwen3TTSServiceManager } from '../../../tts/qwen3-service-manager.js';
import { PROVIDER_PRESETS } from '../../../models/types.js';
import { normalizeSettingsPayload } from './settings-payload.js';
import { ensureAdmin, type GeneralSettingsRouteDeps } from './general-support.js';

export function registerGeneralSettingsReadWriteRoutes(
  router: Router,
  deps: GeneralSettingsRouteDeps,
): void {
  // 公开端点：封面配置（无需登录，封面编辑器需要读取 disableCoverUpload）
  router.get('/public/cover-config', (_req, res) => {
    try {
      const settings = readSettings();
      res.json({ disableCoverUpload: settings.disableCoverUpload });
    } catch (err) {
      res.status(500).json({ error: 'Failed to read cover config', detail: String(err) });
    }
  });

  // 公开端点：友情链接（无需登录）
  router.get('/public/friendly-links', (_req, res) => {
    try {
      const settings = readSettings();
      const enabled = (settings.friendlyLinks ?? []).filter((l) => l.enabled);
      res.json(enabled);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read friendly links', detail: String(err) });
    }
  });

  // 公开端点：章节漫画开关（无需登录，移动端入口据此决定是否渲染漫画 Tab）
  router.get('/public/comic-config', (_req, res) => {
    try {
      const settings = readSettings();
      res.json({
        enabled: settings.comicChapterEnabled,
        defaultPanelsPerChapter: DEFAULT_COMIC_PANELS_PER_CHAPTER,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to read comic config', detail: String(err) });
    }
  });

  // 公开端点：AI 有声书/广播剧访问模式（无需登录，移动端入口据此决定是否展示）
  router.get('/public/audiobook-config', (req, res) => {
    try {
      const settings = readSettings();
      const mode = settings.audiobookAccessMode ?? 'admin';
      const isLoggedIn = !!req.auth;
      const isAdmin = req.auth?.role === 'admin';
      let hasAccess = false;
      if (mode === 'on') {
        hasAccess = isLoggedIn;
      } else if (mode === 'admin') {
        hasAccess = isAdmin;
      } else {
        hasAccess = false;
      }
      res.json({
        mode,
        enabled: mode !== 'off',
        hasAccess,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to read audiobook config', detail: String(err) });
    }
  });

  router.get('/', (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const settings = readSettings();
      res.json({
        ...settings,
        providers: PROVIDER_PRESETS,
        realNameVerificationProviders: getAllowedRealNameVerificationProviders(),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to read settings', detail: String(err) });
    }
  });

  router.get('/real-name/audits', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    if (!deps.authDb) {
      res.json([]);
      return;
    }
    try {
      res.json(await listRealNameAuditLogs(deps.authDb, 20));
    } catch (err) {
      console.error('[real-name/audits] 查询失败:', err);
      res.status(500).json({ error: 'Failed to load real-name audits', detail: String(err) });
    }
  });

  router.put('/', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const body = req.body as SettingsPayload;
      if (!body.modelProvider) {
        res.status(400).json({ error: 'modelProvider is required' });
        return;
      }

      const previous = readSettings();
      const nextPayload = normalizeSettingsPayload(body);
      if (
        process.env.NODE_ENV === 'production'
        && nextPayload.realNameVerificationProvider === 'mock_identity'
      ) {
        res.status(400).json({ error: '生产环境不允许启用模拟实名校验 provider' });
        return;
      }

      await writeSettings(nextPayload);
      resetTTSEngine();

      if ((body.ttsEngine ?? 'edge-tts') === 'qwen3-tts') {
        void qwen3TTSServiceManager.autoStartIfNeeded(
          'qwen3-tts',
          body.qwen3TtsUrl ?? 'http://127.0.0.1:8765',
        );
        if ((body.ttsNarrationEngine ?? 'edge-tts') === 'kokoro') {
          void kokoroServiceManager.autoStartIfNeeded(
            'kokoro',
            body.kokoroUrl ?? 'http://127.0.0.1:8767',
          );
        }
      }

      deps.onSettingsChanged?.();

      if (deps.authDb && req.auth?.id) {
        const changed = [
          previous.realNameVerificationEnabled !== nextPayload.realNameVerificationEnabled,
          previous.realNameVerificationProvider !== nextPayload.realNameVerificationProvider,
          previous.realNameRequiredForComment !== nextPayload.realNameRequiredForComment,
          previous.realNameRequiredForCreatorApplication !== nextPayload.realNameRequiredForCreatorApplication,
          previous.realNameRequiredForBookPublishing !== nextPayload.realNameRequiredForBookPublishing,
          previous.realNameRequiredForBilling !== nextPayload.realNameRequiredForBilling,
          previous.realNameVerificationMaxFailedAttempts !== nextPayload.realNameVerificationMaxFailedAttempts,
          previous.realNameVerificationCooldownMinutes !== nextPayload.realNameVerificationCooldownMinutes,
          previous.realNameVerificationHttpUrl !== nextPayload.realNameVerificationHttpUrl,
          previous.realNameVerificationHttpTimeoutMs !== nextPayload.realNameVerificationHttpTimeoutMs,
          previous.realNameVerificationHttpHeaders !== nextPayload.realNameVerificationHttpHeaders,
        ].some(Boolean);

        if (changed) {
          void appendRealNameAuditLog(deps.authDb, {
            action: 'policy_update',
            status: 'success',
            operatorUserId: req.auth.id,
            detail: JSON.stringify({
              before: {
                enabled: previous.realNameVerificationEnabled,
                provider: previous.realNameVerificationProvider,
                requiredForComment: previous.realNameRequiredForComment,
                requiredForCreatorApplication: previous.realNameRequiredForCreatorApplication,
                requiredForBookPublishing: previous.realNameRequiredForBookPublishing,
                requiredForBilling: previous.realNameRequiredForBilling,
                maxFailedAttempts: previous.realNameVerificationMaxFailedAttempts,
                cooldownMinutes: previous.realNameVerificationCooldownMinutes,
                httpUrl: previous.realNameVerificationHttpUrl,
                httpTimeoutMs: previous.realNameVerificationHttpTimeoutMs,
                httpHeaders: previous.realNameVerificationHttpHeaders,
              },
              after: {
                enabled: nextPayload.realNameVerificationEnabled,
                provider: nextPayload.realNameVerificationProvider,
                requiredForComment: nextPayload.realNameRequiredForComment,
                requiredForCreatorApplication: nextPayload.realNameRequiredForCreatorApplication,
                requiredForBookPublishing: nextPayload.realNameRequiredForBookPublishing,
                requiredForBilling: nextPayload.realNameRequiredForBilling,
                maxFailedAttempts: nextPayload.realNameVerificationMaxFailedAttempts,
                cooldownMinutes: nextPayload.realNameVerificationCooldownMinutes,
                httpUrl: nextPayload.realNameVerificationHttpUrl,
                httpTimeoutMs: nextPayload.realNameVerificationHttpTimeoutMs,
                httpHeaders: nextPayload.realNameVerificationHttpHeaders,
              },
            }),
          });
        }
      }

      const updated = readSettings();
      res.json({
        message: 'Settings saved',
        ...updated,
        realNameVerificationProviders: getAllowedRealNameVerificationProviders(),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save settings', detail: String(err) });
    }
  });
}
