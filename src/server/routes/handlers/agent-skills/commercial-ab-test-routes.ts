import type { Router } from 'express';
import { runCommercialPackAbTest } from './commercial-ab-test-runner.js';
import {
  RunCommercialAbTestBody,
  type AgentSkillCommercialAbTestRouteDeps,
} from './commercial-ab-test-types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

export function registerAgentSkillCommercialAbTestRoute(
  router: Router,
  { ensureAdmin }: AgentSkillCommercialAbTestRouteDeps,
): void {
  router.post('/ab-test', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    const parsed = RunCommercialAbTestBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }

    try {
      const result = await runCommercialPackAbTest(parsed.data);
      res.json(result);
    } catch (err) {
      const message = safeErrorMessage(err, String(err));
      res.status(500).json({ error: `A/B test failed: ${message}` });
    }
  });
}
