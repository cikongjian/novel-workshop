import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthDb } from '../../../../auth/types.js';
import type { AgentEvent, NovelAgent } from '../../../../agents/types.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { UniverseManager } from '../../../../novel/universe-manager.js';
import { checkNovelAccess } from '../../../middleware/novel-access.js';

export const BranchDraftSchema = z.object({
  title: z.string().trim().min(1, '分支标题不能为空'),
  description: z.string().trim().min(1, '分支描述不能为空'),
  impactPrediction: z.string().optional(),
  characterImpacts: z.array(z.object({
    name: z.string().trim().min(1, '角色名不能为空'),
    impact: z.string().trim().min(1, '角色影响不能为空'),
  })).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
});

export const AddBranchNodesBody = z.object({
  parentId: z.string().uuid().nullable().optional(),
  chapterNumber: z.number().int().positive(),
  branches: z.array(BranchDraftSchema).min(1, '至少新增一个分支'),
});

export const BranchNodeBody = z.object({
  nodeId: z.string().uuid('缺少合法 nodeId 参数'),
});

export const ExploreBranchBody = BranchNodeBody.extend({
  previewContent: z.string().optional(),
});

export const ForkBranchBody = BranchNodeBody.extend({
  newTitle: z.string().trim().optional(),
});

export type PlotBranchRouterDeps = {
  novelManager: NovelManager;
  modelClient?: ModelClient;
  agents?: Map<string, NovelAgent>;
  broadcast?: (event: AgentEvent) => void;
  authDb?: AuthDb;
  universeManager?: UniverseManager;
};

export async function ensureNovelAccess(
  req: Request,
  res: Response,
  novelManager: NovelManager,
  novelId: string,
): Promise<boolean> {
  const access = await checkNovelAccess(req, novelManager, novelId);
  if (!access.allowed) {
    res.status(access.status).json({ error: access.error });
    return false;
  }
  return true;
}

export async function tryAttachForkToUniverse(
  universeManager: UniverseManager | undefined,
  sourceNovelId: string,
  sourceNovelTitle: string,
  forkedNovel: Awaited<ReturnType<NovelManager['forkNovel']>>,
  fromChapter: number,
): Promise<void> {
  if (!universeManager) return;
  const universe = await universeManager.findUniverseByNovel(sourceNovelId);
  if (!universe) return;

  await universeManager.addNovel(universe.id, {
    novelId: forkedNovel.id,
    title: forkedNovel.title,
    genre: forkedNovel.genre,
    status: forkedNovel.status,
    notes: `从《${sourceNovelTitle}》第${fromChapter}章剧情分支创建`,
  });
  await universeManager.addRelation(universe.id, {
    fromNovelId: sourceNovelId,
    toNovelId: forkedNovel.id,
    type: 'alt-branch',
    anchorChapterNumber: fromChapter,
    timelineSpan: `从第${fromChapter}章分歧`,
    notes: '由剧情分支树 fork 自动补录到宇宙关系',
  });
}
