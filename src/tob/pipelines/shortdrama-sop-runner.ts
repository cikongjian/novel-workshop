import fs from 'node:fs/promises';
import path from 'node:path';
import type { TobPipelineRunner, TobPipelineRunContext } from './types.js';
import { createAdaptationOutputDir, prepareAdaptationContext } from './adapt-shared.js';
import type { SceneCard } from '../../novel/types.js';
import {
  evaluateShortDramaCommercialQuality,
  type ShortDramaCommercialQAReport,
  type ShortDramaQualityProfile,
} from './shortdrama-commercial-qa.js';
import { polishShortDramaPayloadForCommercial } from './shortdrama-hook-polisher.js';
import { refineShortDramaPayloadForPremium } from './shortdrama-premium-refiner.js';
import { buildShortDramaDeliveryPack } from './shortdrama-delivery-pack.js';

function resolveSourceNovelId(context: TobPipelineRunContext): string {
  const payload = context.job.payload;
  const sourceNovelId = 'sourceNovelId' in payload
    ? payload.sourceNovelId || context.project.sourceNovelId
    : context.project.sourceNovelId;
  if (!sourceNovelId) {
    throw new Error('SOURCE_NOVEL_ID_REQUIRED');
  }
  return sourceNovelId;
}

function summarizeSceneCards(sceneCardsByChapter: Record<number, SceneCard[]>): {
  chapterCount: number;
  sceneCount: number;
} {
  const chapterNumbers = Object.keys(sceneCardsByChapter);
  const sceneCount = Object.values(sceneCardsByChapter).reduce((sum, cards) => sum + cards.length, 0);
  return {
    chapterCount: chapterNumbers.length,
    sceneCount,
  };
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as unknown;
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

function paidTierRank(tier: ShortDramaCommercialQAReport['paidTier']): number {
  if (tier === 'premium') return 3;
  if (tier === 'standard') return 2;
  return 1;
}

function shouldAdoptCandidateQa(
  baseline: ShortDramaCommercialQAReport,
  candidate: ShortDramaCommercialQAReport,
): boolean {
  if (candidate.overallScore > baseline.overallScore) {
    return true;
  }
  if (candidate.overallScore < baseline.overallScore) {
    return false;
  }
  return paidTierRank(candidate.paidTier) > paidTierRank(baseline.paidTier);
}

type AutoPolishRoundSummary = {
  name: string;
  applied: boolean;
  changedScenes: number;
  changedFields: number;
  strategy: string;
  scoreDelta: number;
  tierDelta: string;
};

function buildSopMarkdown(params: {
  projectName: string;
  sourceNovelId: string;
  targetNovelId: string;
  chapterStart: number;
  chapterEnd: number;
  packageId: string;
  payloadPath: string;
  sceneCount: number;
  chapterCount: number;
  businessGoal?: string;
  qualityProfile: ShortDramaQualityProfile;
  qa: ShortDramaCommercialQAReport;
  baselineQa?: ShortDramaCommercialQAReport;
  autoPolish?: {
    applied: boolean;
    changedScenes: number;
    changedFields: number;
    strategy: string;
    rounds?: AutoPolishRoundSummary[];
  };
  qaReportPath: string;
  deliveryPackPath: string;
}): string {
  const verdictLabel = params.qa.verdict === 'ready-for-paid'
    ? '可付费交付'
    : params.qa.verdict === 'needs-polish'
      ? '需打磨'
      : '暂不可交付';
  const tierLabel = params.qa.paidTier === 'premium'
    ? '高级版'
    : params.qa.paidTier === 'standard'
      ? '标准版'
      : '测试版';
  const qualityProfileLabel = params.qualityProfile === 'hook-first' ? '钩子优先' : '均衡';

  return [
    `# ${params.projectName} - 短剧SOP交付包`,
    '',
    `- 源小说ID: ${params.sourceNovelId}`,
    `- ToB小说ID: ${params.targetNovelId}`,
    `- 章节范围: ${params.chapterStart}-${params.chapterEnd}`,
    `- 包ID: ${params.packageId}`,
    `- 产物路径: ${params.payloadPath}`,
    `- 评估报告: ${params.qaReportPath}`,
    `- 交付包: ${params.deliveryPackPath}`,
    params.businessGoal ? `- SOP目标: ${params.businessGoal}` : '',
    '',
    '## 生成档位',
    `- 质量档位: ${qualityProfileLabel}`,
    `- Quality Profile: ${params.qualityProfile}`,
    '',
    '## SOP步骤',
    '1. 故事架构师：同步源小说并锁定章节范围',
    '2. 场景策划：按章提取并保存场景卡',
    '3. 提示词导演：生成短剧制作产物',
    '4. 商业评估：评估可付费交付能力并筛选短片候选',
    '5. 交付打包：生成客户可直接使用的交付包JSON',
    '',
    '## 商业评估',
    `- 总分: ${params.qa.overallScore}/100`,
    `- Overall Score: ${params.qa.overallScore}/100`,
    `- 评估结论: ${verdictLabel}`,
    `- Verdict: ${verdictLabel}`,
    `- 付费档位: ${tierLabel}`,
    `- Paid Tier: ${params.qa.paidTier.toUpperCase()}`,
    `- 场景平均分: ${params.qa.dimensions.averageSceneScore}/100`,
    `- 覆盖度: ${params.qa.dimensions.coverageScore}/100`,
    `- 稳定性: ${params.qa.dimensions.consistencyScore}/100`,
    `- 钩子强度: ${params.qa.dimensions.hookStrengthScore}/100`,
    `- 候选多样性: ${params.qa.dimensions.candidateDiversityScore}/100`,
    `- 覆盖章节数: ${params.chapterCount}`,
    `- 提取场景数: ${params.sceneCount}`,
    '',
    '## 自动打磨',
    `- 是否生效: ${params.autoPolish?.applied ? '是' : '否'}`,
    `- Auto Polish Applied: ${params.autoPolish?.applied ? 'YES' : 'NO'}`,
    params.autoPolish ? `- 打磨策略: ${params.autoPolish.strategy}` : '',
    params.autoPolish ? `- 改写场景数: ${params.autoPolish.changedScenes}` : '',
    params.autoPolish ? `- 改写字段数: ${params.autoPolish.changedFields}` : '',
    params.baselineQa ? `- 分数变化: ${params.qa.overallScore - params.baselineQa.overallScore >= 0 ? '+' : ''}${params.qa.overallScore - params.baselineQa.overallScore}` : '',
    params.baselineQa ? `- Score Delta: ${params.qa.overallScore - params.baselineQa.overallScore >= 0 ? '+' : ''}${params.qa.overallScore - params.baselineQa.overallScore}` : '',
    params.baselineQa ? `- 档位变化: ${params.baselineQa.paidTier.toUpperCase()} -> ${params.qa.paidTier.toUpperCase()}` : '',
    ...(params.autoPolish?.rounds ?? []).flatMap((round, index) => ([
      `- 第${index + 1}轮（${round.name}）: ${round.applied ? '已采用' : '未采用'} | 场景=${round.changedScenes} 字段=${round.changedFields}`,
      `  - 变化: ${round.scoreDelta >= 0 ? '+' : ''}${round.scoreDelta} | ${round.tierDelta}`,
      `  - 策略: ${round.strategy}`,
    ])),
    '',
    '## 两条短片候选',
    ...params.qa.clipCandidates.slice(0, 2).flatMap((clip, index) => ([
      `### 候选 ${index + 1}: C${clip.chapterNumber}-S${clip.sceneNo} (${clip.score}/100)`,
      `- 标题: ${clip.title}`,
      `- Hook: ${clip.hook3s || 'N/A'}`,
      `- Conflict: ${clip.conflict15s || 'N/A'}`,
      `- Twist: ${clip.twist45s || 'N/A'}`,
      `- CTA: ${clip.cta || 'N/A'}`,
      `- 入选原因: ${clip.reasons.join('; ')}`,
      '',
    ])),
    '## 优势',
    ...params.qa.strengths.map((item) => `- ${item}`),
    '',
    '## 风险',
    ...params.qa.risks.map((item) => `- ${item}`),
  ]
    .filter(Boolean)
    .join('\n');
}

export const shortDramaSopRunner: TobPipelineRunner = {
  summary: {
    key: 'shortdrama-sop',
    name: 'Short Drama SOP',
    description: 'Multi-step SOP for short-drama delivery: sync, scene cards, package, QA.',
    supportsIntervention: false,
  },

  async runGenerate(context: TobPipelineRunContext) {
    const payload = context.job.payload;
    const sourceNovelId = resolveSourceNovelId(context);
    const businessGoal = 'prompt' in payload ? payload.prompt?.trim() : undefined;
    const qualityProfile = (
      'qualityProfile' in payload
      && (payload.qualityProfile === 'balanced' || payload.qualityProfile === 'hook-first')
    )
      ? payload.qualityProfile
      : 'balanced';

    const prepared = await prepareAdaptationContext({
      context,
      sourceNovelId,
      sourceChapterStart: 'sourceChapterStart' in payload ? payload.sourceChapterStart : undefined,
      sourceChapterEnd: 'sourceChapterEnd' in payload ? payload.sourceChapterEnd : undefined,
    });

    const outputDirRelative = createAdaptationOutputDir({
      mode: 'short-drama',
      range: prepared.range,
      runLabel: 'sop',
    });

    const result = await context.runtime.shortDramaAdapter.generate({
      novelId: prepared.targetNovelId,
      chapterNumberStart: prepared.range.start,
      chapterNumberEnd: prepared.range.end,
      outputDirRelative,
      sceneCardsByChapter: prepared.sceneCardsByChapter,
      characterProfiles: prepared.characters.map((character) => ({
        id: character.id,
        name: character.name,
        aliases: character.aliases,
        appearance: character.appearance,
        personality: character.personality,
        speechStyle: character.speechStyle,
      })),
    });

    const packageRecord = await context.runtime.adaptationManager.createPackage({
      novelId: prepared.targetNovelId,
      chapterNumberStart: prepared.range.start,
      chapterNumberEnd: prepared.range.end,
      mode: 'short-drama',
      payloadPath: result.payloadPath,
    });

    const payloadAbsolutePath = path.join(
      context.runtime.novelsDir,
      prepared.targetNovelId,
      path.normalize(result.payloadPath),
    );
    const payloadJson = await readJsonFile(payloadAbsolutePath);

    const summary = summarizeSceneCards(prepared.sceneCardsByChapter);
    const baselineQa = evaluateShortDramaCommercialQuality({
      payload: payloadJson,
      chapterCount: summary.chapterCount,
      qualityProfile,
      candidateCount: 2,
    });
    let finalPayload = payloadJson;
    let commercialQa = baselineQa;
    let autoPolishSummary: {
      applied: boolean;
      changedScenes: number;
      changedFields: number;
      strategy: string;
      rounds?: AutoPolishRoundSummary[];
    } | undefined;
    const rounds: AutoPolishRoundSummary[] = [];
    let totalChangedScenes = 0;
    let totalChangedFields = 0;

    const needsPolish = baselineQa.verdict !== 'ready-for-paid' || baselineQa.paidTier === 'test-only';
    if (needsPolish) {
      const polished = polishShortDramaPayloadForCommercial({
        payload: finalPayload,
        qualityProfile,
      });
      if (polished.changedScenes > 0) {
        const candidateQa = evaluateShortDramaCommercialQuality({
          payload: polished.payload,
          chapterCount: summary.chapterCount,
          qualityProfile,
          candidateCount: 2,
        });
        const adopted = shouldAdoptCandidateQa(baselineQa, candidateQa);
        rounds.push({
          name: 'hook-polish',
          applied: adopted,
          changedScenes: polished.changedScenes,
          changedFields: polished.changedFields,
          strategy: polished.strategy,
          scoreDelta: candidateQa.overallScore - commercialQa.overallScore,
          tierDelta: `${commercialQa.paidTier.toUpperCase()} -> ${candidateQa.paidTier.toUpperCase()}`,
        });
        if (adopted) {
          finalPayload = polished.payload;
          commercialQa = candidateQa;
          totalChangedScenes += polished.changedScenes;
          totalChangedFields += polished.changedFields;
          await writeJsonFile(payloadAbsolutePath, finalPayload);
        }
      }
    }

    const needsPremiumBoost = commercialQa.paidTier !== 'premium' || commercialQa.overallScore < 88;
    if (needsPremiumBoost) {
      const premiumRefined = refineShortDramaPayloadForPremium({ payload: finalPayload });
      if (premiumRefined.changedScenes > 0) {
        const premiumQa = evaluateShortDramaCommercialQuality({
          payload: premiumRefined.payload,
          chapterCount: summary.chapterCount,
          qualityProfile,
          candidateCount: 2,
        });
        const adopted = shouldAdoptCandidateQa(commercialQa, premiumQa);
        rounds.push({
          name: 'premium-boost',
          applied: adopted,
          changedScenes: premiumRefined.changedScenes,
          changedFields: premiumRefined.changedFields,
          strategy: premiumRefined.strategy,
          scoreDelta: premiumQa.overallScore - commercialQa.overallScore,
          tierDelta: `${commercialQa.paidTier.toUpperCase()} -> ${premiumQa.paidTier.toUpperCase()}`,
        });
        if (adopted) {
          finalPayload = premiumRefined.payload;
          commercialQa = premiumQa;
          totalChangedScenes += premiumRefined.changedScenes;
          totalChangedFields += premiumRefined.changedFields;
          await writeJsonFile(payloadAbsolutePath, finalPayload);
        }
      }
    }

    autoPolishSummary = {
      applied: rounds.some((round) => round.applied),
      changedScenes: totalChangedScenes,
      changedFields: totalChangedFields,
      strategy: rounds.length > 0 ? rounds.map((round) => round.strategy).join(' + ') : 'auto-hook-polish-v1',
      rounds,
    };

    const qaReportPayload = {
      ...commercialQa,
      baselineQa,
      autoPolish: autoPolishSummary,
      deliveryPackPath: `adaptations/reports/${packageRecord.id}.delivery.json`,
    };
    const qaReportPath = await context.runtime.adaptationManager.saveQAReport(
      prepared.targetNovelId,
      packageRecord.id,
      qaReportPayload,
    );
    const deliveryPackPath = `adaptations/reports/${packageRecord.id}.delivery.json`;
    const deliveryPackPayload = buildShortDramaDeliveryPack({
      projectId: context.project.id,
      projectName: context.project.name,
      sourceNovelId: prepared.sourceNovelId,
      targetNovelId: prepared.targetNovelId,
      chapterStart: prepared.range.start,
      chapterEnd: prepared.range.end,
      packageId: packageRecord.id,
      payloadPath: result.payloadPath,
      qaReportPath,
      deliveryPackPath,
      payload: finalPayload,
      qa: commercialQa,
    });
    const deliveryPackAbsolutePath = path.join(
      context.runtime.novelsDir,
      prepared.targetNovelId,
      path.normalize(deliveryPackPath),
    );
    await writeJsonFile(deliveryPackAbsolutePath, deliveryPackPayload);
    await context.runtime.adaptationManager.updatePackageStatus(
      prepared.targetNovelId,
      packageRecord.id,
      {
        status: commercialQa.verdict === 'ready-for-paid' && commercialQa.paidTier !== 'test-only'
          ? 'passed'
          : 'failed',
        qaReportPath,
      },
    );

    return {
      markdown: buildSopMarkdown({
        projectName: context.project.name,
        sourceNovelId: prepared.sourceNovelId,
        targetNovelId: prepared.targetNovelId,
        chapterStart: prepared.range.start,
        chapterEnd: prepared.range.end,
        packageId: packageRecord.id,
        payloadPath: result.payloadPath,
        sceneCount: summary.sceneCount,
        chapterCount: summary.chapterCount,
        businessGoal,
        qualityProfile,
        qa: commercialQa,
        baselineQa,
        autoPolish: autoPolishSummary,
        qaReportPath,
        deliveryPackPath,
      }),
      model: 'adapter/short-drama-sop',
      pipeline: {
        pipelineKey: 'shortdrama-sop',
        novelId: prepared.targetNovelId,
        chapterNumber: prepared.range.end,
        mode: 'sop-short-drama',
      },
    };
  },
};
