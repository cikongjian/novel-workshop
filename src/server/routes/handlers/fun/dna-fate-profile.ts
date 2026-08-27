import type { Router } from 'express';
import type { ModelClient } from '../../../../models/types.js';
import { FateProfileAgent } from '../../../../agents/fate-profile-agent.js';
import { DnaFateProfileBodySchema } from './dna-schemas.js';

export function registerDnaFateProfileRoute(router: Router, deps: { modelClient: ModelClient }): void {
  router.post('/dna/fate-profile', async (req, res) => {
    const parsed = DnaFateProfileBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数有误' });
      return;
    }

    try {
      const fateProfile = await new FateProfileAgent().generate(parsed.data, deps.modelClient);
      res.json({ fateProfile });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : '命运画像生成失败' });
    }
  });
}
