import type { Request, Response, Router } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import {
  ProposeBody,
  evaluateSlotCoverage,
  normalizeCastSlots,
  parseProposalFromModel,
  toSlotCandidateFromProposal,
} from './route-support.js';
import {
  buildCastSessionPrompt,
  resolveCastSessionProposeContext,
} from './propose-route-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

type EnsureNovelAccess = (req: Request, res: Response) => Promise<string | null>;

type ProposeRouteDeps = {
  authDb?: AuthDb;
  ensureNovelAccess: EnsureNovelAccess;
  modelClient?: ModelClient;
  novelManager: NovelManager;
};

export function registerCastSessionProposeRoutes(
  router: Router,
  { authDb, ensureNovelAccess, modelClient, novelManager }: ProposeRouteDeps,
): void {
  router.post('/propose', async (req, res) => {
    try {
      const parsed = ProposeBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const novelId = await ensureNovelAccess(req, res);
      if (!novelId) {
        return;
      }

      const {
        novel,
        existingCharacters,
        pendingCandidates,
        modelAccess,
        activeModelClient,
      } = await resolveCastSessionProposeContext({
        deps: {
          authDb,
          modelClient,
          novelManager,
        },
        novelId,
        userId: req.auth?.id,
        headers: req.headers,
      });
      if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }

      if (!activeModelClient) {
        res.status(503).json({ error: 'AI 模型未就绪，无法生成开局角色提案' });
        return;
      }

      const slots = normalizeCastSlots(parsed.data.slots);
      const existingNames = existingCharacters.map(item => item.name).slice(0, 30);
      const pendingNames = pendingCandidates
        .filter(item => item.status === 'pending')
        .map(item => item.name)
        .slice(0, 30);

      const prompt = buildCastSessionPrompt({
        conversation: parsed.data.conversation,
        focus: parsed.data.focus,
        maxCharacters: parsed.data.maxCharacters,
        novel,
        existingNames,
        pendingNames,
        slots,
      });

      const response = await activeModelClient.chat(
        [
          {
            role: 'system',
            content: '只输出合法 JSON，不要 markdown 代码块，不要解释。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          temperature: 0.4,
          maxTokens: 2400,
        },
      );

      let proposal;
      try {
        proposal = parseProposalFromModel(response.content, parsed.data.maxCharacters);
      } catch {
        res.status(500).json({
          error: 'AI 返回结构化提案解析失败，请重试',
          raw: response.content,
        });
        return;
      }

      const slotCoverage = evaluateSlotCoverage(
        slots,
        proposal.characters.map(toSlotCandidateFromProposal),
      );

      res.json({
        proposal,
        slotsUsed: slots,
        slotCoverage,
        model: response.model,
        usage: response.usage,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '生成 cast-session 提案失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });
}
