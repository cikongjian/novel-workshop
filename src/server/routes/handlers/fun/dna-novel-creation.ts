import type { Router } from 'express';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { FateProfileAgent } from '../../../../agents/fate-profile-agent.js';
import { StoryDesignAgent } from '../../../../agents/story-design-agent.js';
import { DnaCreateNovelBodySchema } from './dna-schemas.js';
import {
  buildDnaBlueprint,
  buildDnaCharacter,
  buildDnaEnhancedOutline,
  buildDnaWorldEntries,
} from './dna-novel-mapper.js';

export function registerDnaNovelCreationRoute(
  router: Router,
  deps: { modelClient: ModelClient; novelManager: NovelManager },
): void {
  router.post('/dna/create-novel', async (req, res) => {
    const parsed = DnaCreateNovelBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数有误' });
      return;
    }

    try {
      const body = parsed.data;
      const ownerId = (req as unknown as { auth?: { id: string } }).auth?.id ?? 'dev';
      const fateProfile = body.fateProfile ?? await new FateProfileAgent().generate(body, deps.modelClient);
      const design = await new StoryDesignAgent().generate(body, fateProfile, deps.modelClient);

      const created = await deps.novelManager.createNovel({
        title: design.title,
        genre: body.genre,
        synopsis: design.synopsis,
        description: design.sellingPoint,
        constitutionTags: body.constitutionTags,
        ownerId,
      });

      await deps.novelManager.saveCharacter(created.id, buildDnaCharacter(body, fateProfile, design));
      await deps.novelManager.saveOutline(created.id, buildDnaEnhancedOutline(design));
      await Promise.all(
        buildDnaWorldEntries(body, fateProfile, design).map(entry => deps.novelManager.saveWorldEntry(created.id, entry)),
      );
      await deps.novelManager.updateNovel(created.id, {
        shuangwenBlueprint: buildDnaBlueprint(body, fateProfile, design),
      } as Record<string, unknown>);

      res.json({ novelId: created.id, fateProfile, storyBlueprint: design.storyBlueprint, status: 'done' });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : '创建小说失败' });
    }
  });
}
