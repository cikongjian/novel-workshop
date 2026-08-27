import type { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getNovelsDir } from '../../../../config/index.js';
import { SkillEffectsTracker } from '../../../../agent-skills/skill-effects-tracker.js';
import { UserFeedback } from '../../../../agent-skills/skill-effects-types.js';

const SkillFeedbackBody = z.object({
  feedback: z.enum(['helpful', 'neutral', 'unhelpful']),
});

type EnsureNovelAccess = (req: Request, res: Response, novelId: string) => Promise<boolean>;

type AgentSkillEffectRouteDeps = {
  ensureNovelAccess: EnsureNovelAccess;
};

function parseNovelChapterParams(
  res: Response,
  { novelId, chapterNumber }: { novelId: string; chapterNumber: string },
): { novelId: string; chapterNumber: number } | null {
  const parsedChapterNumber = Number.parseInt(chapterNumber, 10);
  if (!z.string().uuid().safeParse(novelId).success) {
    res.status(400).json({ error: 'novelId 格式不合法' });
    return null;
  }
  if (!Number.isInteger(parsedChapterNumber) || parsedChapterNumber <= 0) {
    res.status(400).json({ error: 'chapterNumber 必须是正整数' });
    return null;
  }
  return {
    novelId,
    chapterNumber: parsedChapterNumber,
  };
}

export function registerAgentSkillEffectRoutes(
  router: Router,
  { ensureNovelAccess }: AgentSkillEffectRouteDeps,
): void {
  router.post('/novels/:novelId/chapters/:chapterNumber/skill-feedback', async (req, res) => {
    const params = parseNovelChapterParams(res, {
      novelId: req.params.novelId,
      chapterNumber: req.params.chapterNumber,
    });
    if (!params) {
      return;
    }
    if (!(await ensureNovelAccess(req, res, params.novelId))) {
      return;
    }

    const parsed = SkillFeedbackBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数不合法' });
      return;
    }

    try {
      const tracker = new SkillEffectsTracker(getNovelsDir());
      const record = await tracker.updateUserFeedback({
        novelId: params.novelId,
        chapterNumber: params.chapterNumber,
        feedback: parsed.data.feedback as UserFeedback,
      });

      if (!record) {
        res.status(404).json({ error: '未找到该章节的技能效果记录' });
        return;
      }

      res.json({ message: '反馈已记录', record });
    } catch (err) {
      res.status(500).json({ error: '记录反馈失败', detail: String(err) });
    }
  });

  router.get('/novels/:novelId/chapters/:chapterNumber/skill-effects', async (req, res) => {
    const params = parseNovelChapterParams(res, {
      novelId: req.params.novelId,
      chapterNumber: req.params.chapterNumber,
    });
    if (!params) {
      return;
    }
    if (!(await ensureNovelAccess(req, res, params.novelId))) {
      return;
    }

    try {
      const tracker = new SkillEffectsTracker(getNovelsDir());
      const effects = await tracker.getChapterEffects(params.novelId, params.chapterNumber);
      res.json({ effects });
    } catch (err) {
      res.status(500).json({ error: '读取技能效果失败', detail: String(err) });
    }
  });

  router.get('/novels/:novelId/skill-effects/stats', async (_req, res) => {
    res.status(410).json({
      error: 'This skill-effects stats endpoint has been deprecated.',
      code: 'AGENT_SKILL_EFFECTS_STATS_DEPRECATED',
    });
  });
}
