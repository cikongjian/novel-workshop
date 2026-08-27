import type { Request, Response } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { UniverseAnchorManager } from '../../../../novel/universe-anchor.js';
import type { NovelAgent } from '../../../../agents/types.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../../ai/usage-context.js';
import { parseJsonWithRepair } from '../../../../utils/json-repair.js';
import { createLogger } from '../../../../utils/logger.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { checkNovelAccess } from '../../../middleware/novel-access.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';

export const log = createLogger('route:anchor');

export type AnchorRouteDeps = {
  anchorManager: UniverseAnchorManager;
  novelManager: NovelManager;
  modelClient?: ModelClient;
  agents?: Map<string, NovelAgent>;
  broadcastJson: (data: Record<string, unknown>) => void;
  authDb?: AuthDb;
};

export function sendDeprecated(res: Response, code: string) {
  return res.status(410).json({
    error: '该宇宙锚点接口已下线，请改用锚点列表和关联接口。',
    code,
  });
}

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

export async function loadAccessibleAnchor(
  req: Request,
  res: Response,
  deps: AnchorRouteDeps,
  anchorId: string,
) {
  const anchor = await deps.anchorManager.getAnchor(anchorId);
  if (!anchor) {
    res.status(404).json({ error: '锚点不存在' });
    return null;
  }
  if (!(await ensureNovelAccess(req, res, deps.novelManager, anchor.sourceNovelId))) {
    return null;
  }
  return anchor;
}

export async function startAnchorGeneration(
  req: Request,
  res: Response,
  deps: AnchorRouteDeps,
): Promise<void> {
  const novelId = req.params.novelId as string;
  const agent = deps.agents?.get('anchor-curator');
  if (!agent) {
    res.status(503).json({ error: 'AI 模型未就绪' });
    return;
  }

  try {
    if (!(await ensureNovelAccess(req, res, deps.novelManager, novelId))) {
      return;
    }
    const novel = await deps.novelManager.getNovel(novelId);
    if (!novel) {
      res.status(404).json({ error: '小说不存在' });
      return;
    }
    const modelAccess = await resolveUserModelAccess({
      authDb: deps.authDb,
      userId: req.auth?.id,
      headers: req.headers,
      novel,
    });
    if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
      res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
      return;
    }

    const activeModelClient = modelAccess.client ?? deps.modelClient;
    if (!activeModelClient) {
      res.status(503).json({ error: 'AI 模型未就绪' });
      return;
    }
    if (novel.status !== 'completed') {
      res.status(400).json({ error: '仅完结小说可生成锚点' });
      return;
    }

    const existing = await deps.anchorManager.findAnchorByNovel(novelId);
    if (existing) {
      res.status(409).json({ error: '该小说已有锚点', anchorId: existing.id });
      return;
    }

    const aiUsageContext = getAiUsageContext();
    res.status(202).json({ message: '锚点生成已启动' });

    void runWithAiUsageContextAsync(
      aiUsageContext ?? {
        scope: 'http',
        operationKey: 'anchors.generate',
        operationLabel: 'Generate anchors',
        operationRegistered: true,
        novelId,
      },
      async () => {
        await generateAnchorAsync(deps, novelId, novel, agent, activeModelClient);
      },
    ).catch((err) => {
      log.error('锚点生成失败', { novelId, error: err });
      deps.broadcastJson({
        type: 'anchor:error',
        novelId,
        error: safeErrorMessage(err, '锚点生成失败'),
      });
    });
  } catch (err) {
    log.error('启动锚点生成失败', { error: err });
    if (!res.headersSent) {
      res.status(500).json({ error: '启动锚点生成失败' });
    }
  }
}

async function generateAnchorAsync(
  deps: AnchorRouteDeps,
  novelId: string,
  novel: any,
  agent: NovelAgent,
  modelClient: ModelClient,
) {
  deps.broadcastJson({ type: 'anchor:start', novelId });

  const [world, characters, outline, chapters] = await Promise.all([
    deps.novelManager.getWorldEntries(novelId),
    deps.novelManager.getCharacters(novelId),
    deps.novelManager.getOutline(novelId),
    deps.novelManager.listChapters(novelId),
  ]);

  const chapterSummaries = (chapters as any[])
    .filter((chapter: any) => chapter.summary)
    .map((chapter: any) => `第${chapter.chapterNumber}章「${chapter.title}」：${chapter.summary}`)
    .join('\n');

  const worldText = (world as any[])
    .map((entry: any) => `[${entry.category}] ${entry.name}：${entry.description}`)
    .join('\n');

  const characterText = (characters as any[])
    .map((character: any) => {
      const parts = [`${character.name}（${character.role}）`];
      if (character.abilities?.length) parts.push(`能力：${character.abilities.join('、')}`);
      if (character.backstory) parts.push(`背景：${character.backstory.slice(0, 200)}`);
      if (character.currentState) parts.push(`当前状态：${character.currentState}`);
      if (character.status) parts.push(`存活：${character.status}`);
      parts.push(`ID：${character.id}`);
      return parts.join('｜');
    })
    .join('\n');

  const outlineText = (outline as any)?.plotThreads
    ?.map((thread: any) => `[${thread.status}] ${thread.name}：${thread.description}`)
    .join('\n') ?? '';

  const context = {
    novelId,
    genre: novel.genre,
    novelTitle: novel.title,
    novelSynopsis: novel.synopsis || novel.description || '',
    worldContext: worldText,
    characterContext: characterText,
    outlineContext: outlineText,
    previousChapterSummary: chapterSummaries,
  };

  deps.broadcastJson({ type: 'anchor:progress', novelId, stage: 'AI 策展中...' });
  const output = await agent.execute(context, modelClient);

  let parsed: any;
  try {
    const jsonStr = output.content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    parsed = parseJsonWithRepair(jsonStr);
    if (!parsed) throw new Error('parse returned null');
  } catch {
    throw new Error('AI 输出解析失败');
  }

  const worldSnapshot = {
    entries: (world as any[]).map((entry: any) => ({
      id: entry.id,
      category: entry.category,
      name: entry.name,
      description: entry.description,
      aliases: entry.aliases ?? [],
      constraints: entry.constraints ?? [],
      details: entry.details ?? {},
      tags: entry.tags ?? [],
    })),
    factionEndStates: [] as any[],
    timelineEndMarker: '',
  };

  const anchor = await deps.anchorManager.createAnchor({
    sourceNovelId: novelId,
    sourceNovelTitle: novel.title,
    world: worldSnapshot,
    characterPool: parsed.characterPool ?? [],
    foreshadowing: parsed.foreshadowing ?? [],
    storySummary: parsed.storySummary ?? '',
  });

  deps.broadcastJson({
    type: 'anchor:complete',
    novelId,
    anchorId: anchor.id,
  });
  log.info('锚点生成完成', { novelId, anchorId: anchor.id });
}
