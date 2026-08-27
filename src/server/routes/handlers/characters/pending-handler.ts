import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { CharacterRole, type CharacterProfile } from '../../../../novel/types.js';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import {
  approvePendingCandidates,
  isNotFoundLikeError,
  rejectPendingCandidates,
  resolvePendingCandidateTargetNames,
} from './pending-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

const PendingCandidatesBody = z.object({
  names: z.array(z.string().min(1)).optional(),
  role: CharacterRole.optional(),
});

/**
 * Register pending character candidates routes
 * GET    /pending-candidates - Get all pending candidates
 * POST   /pending-candidates/approve - Approve pending candidates
 * POST   /pending-candidates/reject - Reject pending candidates
 */
export function registerPendingCharacterHandlers(
  router: Router,
  novelManager: NovelManager,
  novelMemory?: NovelMemory,
): void {
  // Get pending candidates
  router.get('/pending-candidates', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const candidates = await novelManager.getPendingCharacterCandidates(novelId);
      res.json(candidates);
    } catch (err) {
      const message = safeErrorMessage(err, '获取候选角色失败');
      if (isNotFoundLikeError(message)) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  // Approve pending candidates
  router.post('/pending-candidates/approve', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsed = PendingCandidatesBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const candidates = await novelManager.getPendingCharacterCandidates(novelId);
      const targetNames = resolvePendingCandidateTargetNames({
        candidates,
        names: parsed.data.names,
      });

      if (targetNames.length === 0) {
        res.json({
          approvedCount: 0,
          skippedExistingCount: 0,
          missingCount: 0,
          approvedCharacters: [] as CharacterProfile[],
          skippedExisting: [] as string[],
          missingNames: [] as string[],
          pendingCandidates: candidates,
        });
        return;
      }

      const {
        approvedCharacters,
        skippedExisting,
        missingNames,
        pendingCandidates,
      } = await approvePendingCandidates({
        novelId,
        novelManager,
        novelMemory,
        candidates,
        targetNames,
        role: parsed.data.role,
      });

      res.json({
        approvedCount: approvedCharacters.length,
        skippedExistingCount: skippedExisting.length,
        missingCount: missingNames.length,
        approvedCharacters,
        skippedExisting,
        missingNames,
        pendingCandidates,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '候选角色审批失败');
      if (isNotFoundLikeError(message)) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  // Reject pending candidates
  router.post('/pending-candidates/reject', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsed = PendingCandidatesBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const candidates = await novelManager.getPendingCharacterCandidates(novelId);
      const targetNames = resolvePendingCandidateTargetNames({
        candidates,
        names: parsed.data.names,
      });

      if (targetNames.length === 0) {
        res.json({
          rejectedCount: 0,
          rejectedNames: [] as string[],
          pendingCandidates: candidates,
        });
        return;
      }

      const result = await rejectPendingCandidates({
        novelId,
        novelManager,
        candidates,
        targetNames,
      });

      res.json({
        rejectedCount: result.rejectedCount,
        rejectedNames: result.rejectedNames,
        pendingCandidates: result.pendingCandidates,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '候选角色驳回失败');
      if (isNotFoundLikeError(message)) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });
}
