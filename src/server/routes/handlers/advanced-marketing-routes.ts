import type { Router } from 'express';
import { parseJsonPayload } from '../../../utils/json-payload.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import {
  beginPackageBilling,
  cancelPackageBilling,
  settlePackageBilling,
  type PackageBillingSession,
} from './package-billing-helper.js';
import type { AdvancedRouteDeps } from './advanced-route-support.js';

export function registerAdvancedMarketingRoutes(router: Router, deps: AdvancedRouteDeps): void {
  const { novelManager, modelClient, broadcast, agents, billingService, authDb } = deps;

  router.post('/marketing-copy', async (req, res) => {
    let billingSession: PackageBillingSession | null = null;
    try {
      const { novelId, types } = req.body;
      if (!novelId) { res.status(400).json({ error: '缺少 novelId' }); return; }

      const novel = await novelManager.getNovel(novelId);
      const modelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }
      const bypassBilling = modelAccess.billingBypass;
      if (!bypassBilling) {
        const billing = await beginPackageBilling(req, res, billingService, {
          ruleCandidates: ['pkg.publish-pack', 'cap.marketing-copy'],
          bizType: 'pkg.publish-pack',
          bizId: String(novelId),
          missingRuleMessage: 'Publish package billing rule does not exist or is disabled',
        });
        if (billing.blocked) return;
        billingSession = billing.session;
      }
      const characters = await novelManager.getCharacters(novelId);
      const worldEntries = await novelManager.getWorldEntries(novelId);

      const agent = agents?.get('marketing-writer');
      if (!agent) {
        throw new Error('marketing-writer Agent 未注册');
      }

      const context = {
        novelId,
        genre: novel.genre || '',
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis || novel.description || '',
        characterContext: characters.slice(0, 10).map(c => `${c.name}(${c.role}): ${c.personality || ''}`).join('\n'),
        worldContext: worldEntries.slice(0, 15).map(e => `[${e.category}] ${e.name}: ${e.description || ''}`).join('\n'),
        userDirection: Array.isArray(types) ? `请生成以下类型的营销素材：${types.join('、')}` : '请生成全部类型的营销素材',
      };

      const output = await agent.execute(context, modelAccess.client ?? modelClient, (chunk) => {
        broadcast({ type: 'agent:chunk', agentRole: 'marketing-writer', novelId, data: chunk, timestamp: new Date().toISOString() });
      });

      let materials: any;
      try { materials = parseJsonPayload(output.content); } catch { materials = { raw: output.content }; }

      let parsedData: any = materials;
      if (typeof materials.raw === 'string' && materials.raw.trim().startsWith('```')) {
        try {
          const cleaned = materials.raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
          const parsed = JSON.parse(cleaned);
          if (parsed && typeof parsed === 'object') {
            parsedData = { ...parsed, raw: materials.raw };
          }
        } catch {
          // ignore
        }
      }

      const { randomUUID } = await import('node:crypto');
      const packageRecord = {
        id: randomUUID(),
        titles: Array.isArray(parsedData.titles) ? parsedData.titles : [],
        oneLiner: typeof parsedData.oneLiner === 'string' ? parsedData.oneLiner : '',
        shortSynopsis: typeof parsedData.shortSynopsis === 'string' ? parsedData.shortSynopsis : '',
        longSynopsis: typeof parsedData.longSynopsis === 'string' ? parsedData.longSynopsis : '',
        characterCards: Array.isArray(parsedData.characterCards) ? parsedData.characterCards : [],
        socialPosts: Array.isArray(parsedData.socialPosts) ? parsedData.socialPosts : [],
        raw: output.content,
        createdAt: new Date().toISOString(),
      };

      const updatedNovel = {
        ...novel,
        marketingPackages: [packageRecord, ...(novel.marketingPackages || [])].slice(0, 20),
        updatedAt: new Date().toISOString(),
      };
      await novelManager.updateNovel(novelId, updatedNovel);

      await settlePackageBilling(billingService, billingSession);
      res.json({
        materials,
        billingBypassed: bypassBilling,
        modelAccessSource: modelAccess.source,
        billing: billingSession ? {
          ruleCode: billingSession.ruleCode,
          estimatedPoints: billingSession.estimatedPoints,
          bizType: billingSession.bizType,
        } : null,
      });
    } catch (err: unknown) {
      await cancelPackageBilling(billingService, billingSession);
      res.status(500).json({ error: safeErrorMessage(err, '营销文案生成失败') });
    }
  });
}
