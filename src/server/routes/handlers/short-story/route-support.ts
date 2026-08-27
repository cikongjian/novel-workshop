import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthDb } from '../../../../auth/types.js';
import type { BillingService } from '../../../../billing/billing-service.js';
import { getConfig } from '../../../../config/index.js';
import type { ModelClient } from '../../../../models/types.js';
import { createModelClient } from '../../../../models/provider.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import {
  listShortStoryTemplatePresets,
  shortStoryTemplateIds,
} from '../../../../novel/short-story-template-catalog.js';
import {
  createShortStoryBlueprint,
  getShortStoryTemplate,
} from '../../../../novel/short-story-templates.js';
import type { ShortStoryBlueprint } from '../../../../novel/short-story-types.js';
import type { ReferralService } from '../../../../referral/referral-service.js';
import { createLogger } from '../../../../utils/logger.js';
import { checkNovelAccess } from '../../../middleware/novel-access.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';

export const logger = createLogger('ShortStoryRoutes');

export type ShortStoryRouterDeps = {
  novelManager: NovelManager;
  billingService?: BillingService;
  authDb?: AuthDb;
  referralService?: ReferralService;
};

export type ShortStoryBillingSession = {
  billingUserId: string;
  freezeId: string;
  ruleCode: string;
};

export const CreateShortStorySchema = z.object({
  title: z.string().min(1).max(100),
  template: z.enum(shortStoryTemplateIds),
  targetWordCount: z.number().int().min(15000).max(35000).default(25000),
  targetChapters: z.number().int().min(5).max(20).default(18),
  chapterWordCount: z.number().int().min(1000).max(3500).optional(),
  paywall: z.object({
    enabled: z.boolean().default(true),
    type: z.enum(['chapter', 'percentage', 'wordCount']).default('chapter'),
    freeChapters: z.number().int().min(0).max(10).optional(),
    freePercentage: z.number().min(0).max(100).optional(),
    freeWordCount: z.number().int().min(0).optional(),
    paywallMessage: z.string().optional(),
  }).optional(),
  customConfig: z.object({
    protagonist: z.object({
      name: z.string().min(1),
      startState: z.string().min(5),
      endState: z.string().min(5),
      goldFinger: z.string().min(3),
      coreGoal: z.string().optional(),
    }),
    hook: z.object({
      openingPunch: z.string().min(10),
      coreLoop: z.string().min(10),
      climaxChain: z.string().min(20),
      chapterEndStrategy: z.string().optional(),
    }),
    antagonists: z.array(z.object({
      name: z.string().min(1),
      role: z.string().min(2),
      defeatChapter: z.number().int().min(1),
      defeatMethod: z.string().optional(),
    })).optional(),
    styleGuide: z.string().optional(),
    forbidden: z.array(z.string()).optional(),
  }).optional(),
});

export const GenerateShortChapterSchema = z.object({
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().min(1).max(20),
  direction: z.string().optional(),
});

export const BatchGenerateShortStorySchema = z.object({
  novelId: z.string().uuid(),
  startChapter: z.number().int().min(1).default(1),
  endChapter: z.number().int().min(1).max(20).optional(),
});

export function getCurrentUserId(req: Request): string {
  return req.auth?.id ?? 'dev';
}

export function isBillingEnabledUser(userId: string): boolean {
  return Boolean(userId) && userId !== 'dev';
}

export function normalizeBlueprint(raw: unknown): ShortStoryBlueprint {
  return raw as ShortStoryBlueprint;
}

export function resolveBlueprintPayload(body: z.infer<typeof CreateShortStorySchema>): ShortStoryBlueprint {
  if (body.template === 'custom') {
    if (!body.customConfig) {
      throw new Error('自定义模板需要提供 customConfig');
    }
    return createShortStoryBlueprint('custom', {
      targetWordCount: body.targetWordCount,
      targetChapters: body.targetChapters,
      chapterWordCount: body.chapterWordCount,
      paywall: body.paywall ? {
        ...body.paywall,
        paywallMessage: body.paywall.paywallMessage || '精彩内容，解锁继续阅读',
      } : undefined,
      ...body.customConfig,
      hook: body.customConfig.hook ? {
        ...body.customConfig.hook,
        chapterEndStrategy: body.customConfig.hook.chapterEndStrategy || '悬念型为主，危机型为辅',
      } : undefined,
    } as never);
  }

  const templateConfig = getShortStoryTemplate(body.template);
  if (!templateConfig) {
    throw new Error(`未知的模板类型: ${body.template}`);
  }

  return createShortStoryBlueprint(body.template, {
    targetWordCount: body.targetWordCount,
    targetChapters: body.targetChapters,
    chapterWordCount: body.chapterWordCount,
    paywall: body.paywall ? {
      ...body.paywall,
      paywallMessage: body.paywall.paywallMessage || '精彩内容，解锁继续阅读',
    } : undefined,
  });
}

export function calculateTargetWordCount(blueprint: ShortStoryBlueprint): number {
  if (blueprint.chapterWordCount) {
    return blueprint.chapterWordCount;
  }
  return Math.floor(blueprint.targetWordCount / blueprint.targetChapters);
}

export function buildNoopMemory() {
  return {
    searchChapterContext: async () => '',
    searchWorldContext: async () => '',
    searchCharacterContext: async () => '',
  };
}

export async function beginShortStoryBilling(
  req: Request,
  res: Response,
  billingService: BillingService | undefined,
  bypassBilling: boolean,
  estimatedChars: number,
  bizId: string,
): Promise<{ blocked: boolean; session: ShortStoryBillingSession | null }> {
  const billingUserId = req.auth?.id;
  if (bypassBilling || !billingService || !billingUserId || billingUserId === 'dev') {
    return { blocked: false, session: null };
  }

  const ruleCode = await billingService.getOperationRuleCode('generateChapter');
  const estimate = await billingService.estimate({ ruleCode, charCount: Math.max(estimatedChars, 1) });
  const account = await billingService.getAccount(billingUserId);
  if (account.balancePoints < estimate.estimatedPoints) {
    res.status(402).json({
      error: '积分不足，请先充值',
      code: 'INSUFFICIENT_BALANCE',
      required: estimate.estimatedPoints,
      balance: account.balancePoints,
      ruleCode,
    });
    return { blocked: true, session: null };
  }

  const freezeId = await billingService.freezePoints(
    billingUserId,
    estimate.estimatedPoints,
    'gen.chapter',
    bizId,
  );

  return {
    blocked: false,
    session: {
      billingUserId,
      freezeId,
      ruleCode,
    },
  };
}

export async function settleShortStoryBilling(
  billingService: BillingService | undefined,
  session: ShortStoryBillingSession | null,
  actualChars: number,
): Promise<void> {
  if (!billingService || !session) return;
  if (actualChars <= 0) {
    await billingService.settleFreeze(session.billingUserId, session.freezeId, 0);
    return;
  }

  const actualEstimate = await billingService.estimate({
    ruleCode: session.ruleCode,
    charCount: Math.max(actualChars, 1),
  });
  await billingService.settleFreeze(session.billingUserId, session.freezeId, actualEstimate.estimatedPoints);
}

export async function resolveShortStoryContext(
  req: Request,
  novel: Awaited<ReturnType<NovelManager['getNovel']>>,
  deps: ShortStoryRouterDeps,
): Promise<{
  modelClient: ModelClient;
  billingBypass: boolean;
}> {
  const userId = getCurrentUserId(req);
  const modelAccess = await resolveUserModelAccess({
    authDb: deps.authDb,
    userId,
    headers: req.headers,
    novel,
  });
  if (modelAccess.error) {
    throw new Error(modelAccess.error);
  }

  const modelClient = modelAccess.client ?? createModelClient(getConfig());
  return {
    modelClient,
    billingBypass: modelAccess.billingBypass,
  };
}

export async function loadAccessibleShortStoryNovel(
  req: Request,
  res: Response,
  deps: ShortStoryRouterDeps,
  novelId: string,
) {
  const access = await checkNovelAccess(req, deps.novelManager, novelId);
  if (!access.allowed) {
    res.status(access.status).json({ error: access.error });
    return null;
  }

  const novel = await deps.novelManager.getNovel(novelId);
  if (!novel) {
    res.status(404).json({ error: '小说不存在' });
    return null;
  }

  return novel;
}

export function listShortStoryTemplates() {
  return listShortStoryTemplatePresets().map(({ blueprint, ...template }) => template);
}
