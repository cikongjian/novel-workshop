import path from 'node:path';
import { z } from 'zod';
import type { AuthDb } from '../../../../auth/types.js';
import { AdaptationManager } from '../../../../adaptation/adaptation-manager.js';
import { AudioAdapter } from '../../../../adaptation/audio-adapter.js';
import { AdaptationComplianceChecker } from '../../../../adaptation/compliance-checker.js';
import { ComicAdapter } from '../../../../adaptation/comic-adapter.js';
import { AdaptationQAGate } from '../../../../adaptation/qa-gate.js';
import { SceneCardExtractor } from '../../../../adaptation/scene-card-extractor.js';
import { ShortDramaAdapter } from '../../../../adaptation/short-drama-adapter.js';
import { getNovelsDir } from '../../../../config/index.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { AdaptationMode, AdaptationPackageStatus, NovelGenre } from '../../../../novel/types.js';
import { checkNovelAccess } from '../../../middleware/novel-access.js';

export const GenerateAdaptationBody = z
  .object({
    chapterNumberStart: z.number().int().positive(),
    chapterNumberEnd: z.number().int().positive(),
    mode: AdaptationMode,
    payloadPath: z.string().min(1).optional(),
    qaReportPath: z.string().optional(),
    audioDialogueIntensity: z.enum(['low', 'medium', 'high']).optional(),
    audioRewriteLevel: z.enum(['conservative', 'balanced', 'dramatic']).optional(),
    audioNarrationMaxRatio: z.number().min(0.2).max(0.85).optional(),
    audioGenreOverride: NovelGenre.optional(),
    audioSynthesizeAudio: z.boolean().optional(),
  })
  .refine((payload) => payload.chapterNumberEnd >= payload.chapterNumberStart, {
    message: 'chapterNumberEnd 必须大于等于 chapterNumberStart',
    path: ['chapterNumberEnd'],
  });

export const ListAdaptationQuery = z.object({
  mode: AdaptationMode.optional(),
  status: AdaptationPackageStatus.optional(),
});

export const DeleteAdaptationQuery = z.object({
  removeArtifacts: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional(),
});

export const RunQABody = z.object({
  passed: z.boolean().optional(),
  qaReportPath: z.string().optional(),
});

export type AdaptationRouterDeps = {
  novelManager: NovelManager;
  adaptationManager: AdaptationManager;
  modelClient?: ModelClient;
  authDb?: AuthDb;
  sceneCardExtractor?: SceneCardExtractor;
  audioAdapter?: AudioAdapter;
  comicAdapter?: ComicAdapter;
  shortDramaAdapter?: ShortDramaAdapter;
  complianceChecker?: AdaptationComplianceChecker;
};

export type ResolvedAdaptationRouteDeps = AdaptationRouterDeps & {
  extractor: SceneCardExtractor;
  qaGate: AdaptationQAGate;
  audioAdapter: AudioAdapter;
  comicAdapter: ComicAdapter;
  shortDramaAdapter: ShortDramaAdapter;
  complianceChecker: AdaptationComplianceChecker;
};

export function resolveAdaptationRouteDeps(deps: AdaptationRouterDeps): ResolvedAdaptationRouteDeps {
  return {
    ...deps,
    extractor: deps.sceneCardExtractor ?? new SceneCardExtractor(),
    qaGate: new AdaptationQAGate(),
    audioAdapter: deps.audioAdapter ?? new AudioAdapter(deps.novelManager, getNovelsDir(), deps.modelClient),
    comicAdapter: deps.comicAdapter ?? new ComicAdapter(),
    shortDramaAdapter: deps.shortDramaAdapter ?? new ShortDramaAdapter(),
    complianceChecker: deps.complianceChecker ?? new AdaptationComplianceChecker(getNovelsDir()),
  };
}

export async function ensureNovelAccess(
  req: import('express').Request,
  res: import('express').Response,
  novelManager: NovelManager,
): Promise<string | null> {
  const novelId = (req.params as Record<string, string>).novelId;
  const access = await checkNovelAccess(req, novelManager, novelId);
  if (!access.allowed) {
    res.status(access.status).json({ error: access.error });
    return null;
  }
  return novelId;
}

export function ensureAdmin(
  req: import('express').Request,
  res: import('express').Response,
): boolean {
  if (req.auth?.role === 'admin') {
    return true;
  }
  res.status(403).json({ error: '需要管理员权限' });
  return false;
}

export function sendDeprecated(
  res: import('express').Response,
  code: string,
  detail?: string,
): void {
  res.status(410).json({
    error: detail ?? 'This adaptation endpoint has been deprecated.',
    code,
  });
}

export function sendSmokeDeprecated(
  res: import('express').Response,
  code: string,
  cli: string,
): void {
  res.status(410).json({
    error: 'Adaptation smoke HTTP endpoint has been deprecated. Use the CLI command instead.',
    code,
    cli,
  });
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
