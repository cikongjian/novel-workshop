import type { Request, Response, Router } from 'express';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import {
  ConfirmBody,
  buildProspectiveSlotCandidates,
  evaluateSlotCoverage,
  normalizeCastSlots,
} from './route-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  applyCharacterProposals,
  applyPowerSystemProposals,
  applyRelationshipSeeds,
  buildCharacterLookup,
  dedupeCharacterProposals,
} from './confirm-route-support.js';

type EnsureNovelAccess = (req: Request, res: Response) => Promise<string | null>;

type ConfirmRouteDeps = {
  ensureNovelAccess: EnsureNovelAccess;
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
};

export function registerCastSessionConfirmRoutes(
  router: Router,
  { ensureNovelAccess, novelManager, novelMemory }: ConfirmRouteDeps,
): void {
  router.post('/confirm', async (req, res) => {
    try {
      const parsed = ConfirmBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const novelId = await ensureNovelAccess(req, res);
      if (!novelId) {
        return;
      }

      const timestamp = new Date().toISOString();
      const slots = normalizeCastSlots(parsed.data.slots);

      const [existingCharacters, existingWorldEntries] = await Promise.all([
        novelManager.getCharacters(novelId),
        novelManager.getWorldEntries(novelId),
      ]);

      const characterByNameKey = buildCharacterLookup(existingCharacters);
      const dedupedCharacterProposals = dedupeCharacterProposals(parsed.data.proposal);

      const prospectiveCandidates = buildProspectiveSlotCandidates({
        existingCharacters,
        proposals: dedupedCharacterProposals,
        mode: parsed.data.mode,
      });
      const slotCoverage = evaluateSlotCoverage(slots, prospectiveCandidates);
      if (!slotCoverage.passed) {
        res.status(400).json({
          error: `关键角色槽位覆盖不足：${slotCoverage.missingRequired.join('、')}`,
          slotCoverage,
        });
        return;
      }

      const {
        createdCharacters,
        updatedCharacters,
        skippedCharacters,
      } = await applyCharacterProposals({
        novelId,
        timestamp,
        proposals: dedupedCharacterProposals,
        mode: parsed.data.mode,
        characterByNameKey,
        novelManager,
        novelMemory,
      });

      const {
        createdPowerEntries,
        updatedPowerEntries,
        skippedPowerEntries,
      } = await applyPowerSystemProposals({
        novelId,
        timestamp,
        proposals: parsed.data.proposal.powerSystem,
        mode: parsed.data.mode,
        existingWorldEntries,
        novelManager,
        novelMemory,
      });

      const relationshipApplied = await applyRelationshipSeeds({
        novelId,
        timestamp,
        proposal: parsed.data.proposal,
        novelManager,
        novelMemory,
      });

      res.json({
        slotsUsed: slots,
        slotCoverage,
        characterResult: {
          createdCount: createdCharacters.length,
          updatedCount: updatedCharacters.length,
          skippedCount: skippedCharacters.length,
          skippedNames: skippedCharacters,
        },
        powerResult: {
          createdCount: createdPowerEntries.length,
          updatedCount: updatedPowerEntries.length,
          skippedCount: skippedPowerEntries.length,
          skippedNames: skippedPowerEntries,
        },
        relationshipResult: {
          appliedCount: relationshipApplied,
        },
        createdCharacters,
        updatedCharacters,
        createdPowerEntries,
        updatedPowerEntries,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '确认 cast-session 提案失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });
}
