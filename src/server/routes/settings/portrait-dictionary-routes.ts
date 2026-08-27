import type { Router } from 'express';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import {
  getBuiltinRoleAttireExtensions,
  getCustomRoleAttireEntries,
  getMergedRoleAttireEntries,
  getSystemRoleAttireEntries,
  saveCustomRoleAttireEntries,
} from '../portrait-role-attire-catalog.js';

export function registerPortraitDictionaryRoutes(router: Router): void {
  router.use((req, res, next) => {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ error: 'Admin permission required' });
      return;
    }
    next();
  });

  router.get('/portrait-role-attire-dictionary', (_req, res) => {
    try {
      const systemEntries = getSystemRoleAttireEntries();
      const extensionEntries = getBuiltinRoleAttireExtensions();
      const customEntries = getCustomRoleAttireEntries();
      const mergedEntries = getMergedRoleAttireEntries();
      res.json({
        systemCount: systemEntries.length,
        extensionCount: extensionEntries.length,
        customCount: customEntries.length,
        mergedCount: mergedEntries.length,
        extensionEntries,
        customEntries,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load portrait role-attire dictionary', detail: safeErrorMessage(err, '加载人物服饰词典失败') });
    }
  });

  router.put('/portrait-role-attire-dictionary', async (req, res) => {
    try {
      const { customEntries } = req.body as { customEntries?: unknown };
      const saved = await saveCustomRoleAttireEntries(customEntries ?? []);
      const mergedEntries = getMergedRoleAttireEntries();
      res.json({
        message: 'Portrait role-attire dictionary saved',
        customCount: saved.length,
        mergedCount: mergedEntries.length,
        customEntries: saved,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save portrait role-attire dictionary', detail: safeErrorMessage(err, '保存人物服饰词典失败') });
    }
  });
}
