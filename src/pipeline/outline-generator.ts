import type { AgentOutput, AgentRole, AgentContext } from '../agents/types.js';
import type { NovelMetadata, CharacterProfile, OutlineData, ChapterOutline, Foreshadowing } from '../novel/types.js';
import { buildScenePlanFromOutline } from './chapter-enhancement.js';
import { buildOutlineContract, type OutlineContract } from './outline-gate.js';
import { auditUserDirectionAnchors, buildUserDirectionAnchorRepairInstruction } from './user-direction-anchor.js';
import { getAdaptiveTemperature } from './context-builders.js';
import { readBoolEnv } from './pipeline-constants.js';

export interface OutlineGenerationOptions {
  novelId: string;
  chapterNumber: number;
  novel: NovelMetadata;
  characters: CharacterProfile[];
  chapterOutline?: ChapterOutline;
  baseContext: AgentContext;
  characterLightContext?: string;
  userDirection: string;
  runAgent: (role: AgentRole, ctx: AgentContext) => Promise<AgentOutput>;
  agents: Map<AgentRole, unknown>;
  hasOpeningSupervisor?: boolean;
  enablePatternRotationCache?: boolean;
  enableAntiClicheDetection?: boolean;
  outlineMaxRequired?: number;
  unresolvedForeshadowing?: Foreshadowing[];
  combinedPrevContext?: string;
  patternRotationCache?: { buildHints: (novelId: string) => { openingHint?: string; hookHint?: string } };
  novelsDir?: string;
  collectOnStageCharacterIds: (params: {
    chapterOutline?: ChapterOutline;
    outlineText: string;
    characters: CharacterProfile[];
  }) => Set<string>;
  buildCharacterContext: (characters: CharacterProfile[], options: {
    identityRuleFocusCharacterIds?: string[];
    relevantCharacterIds?: Set<string>;
  }) => string | undefined;
  characterFileContext?: string;
  loadPatternDB?: (novelsDir: string, novelId: string) => unknown;
  detectClichePatterns?: (text: string, patternDB: unknown) => { writerHints: string[] };
}

export interface OutlineGenerationResult {
  outlineOutput: AgentOutput;
  scenePlan: unknown;
  outlineContract: ReturnType<typeof buildOutlineContract>;
  contextWithOutline: AgentContext;
  anchorAudit: ReturnType<typeof auditUserDirectionAnchors>;
}

export async function generateOutline(
  options: OutlineGenerationOptions,
): Promise<OutlineGenerationResult> {
  const {
    novelId,
    chapterNumber,
    novel,
    characters,
    chapterOutline,
    baseContext,
    characterLightContext,
    userDirection,
    runAgent,
    agents,
    hasOpeningSupervisor,
    enablePatternRotationCache,
    enableAntiClicheDetection,
    outlineMaxRequired = 5,
    unresolvedForeshadowing,
    combinedPrevContext,
    patternRotationCache,
    novelsDir,
    collectOnStageCharacterIds,
    buildCharacterContext: buildCharContext,
    characterFileContext,
    loadPatternDB,
    detectClichePatterns,
  } = options;

  let outlineOutput = await runAgent('outline', {
    ...baseContext,
    characterContext: characterLightContext || undefined,
    temperatureOverride: getAdaptiveTemperature('outline', false),
  });

  const outlineAnchorAudit = auditUserDirectionAnchors({
    direction: userDirection,
    content: outlineOutput.content,
    stage: 'outline',
  });

  if (outlineAnchorAudit.shouldRepair) {
    const repairInstruction = buildUserDirectionAnchorRepairInstruction(outlineAnchorAudit);
    outlineOutput = await runAgent('outline', {
      ...baseContext,
      userDirection: [baseContext.userDirection as string, repairInstruction].filter(Boolean).join('\n\n'),
      characterContext: characterLightContext || undefined,
      temperatureOverride: getAdaptiveTemperature('outline', true),
    });
  }

  const scenePlan = buildScenePlanFromOutline(outlineOutput.content, chapterNumber);
  const outlineContract = buildOutlineContract({
    chapterNumber,
    chapterOutline,
    outlineText: outlineOutput.content,
    unresolvedForeshadowing,
    maxRequired: outlineMaxRequired,
  });

  const contextWithOutline: AgentContext = {
    ...baseContext,
    outlineContext: outlineOutput.content,
    scenePlan,
    outlineContract: outlineContract.prompt || undefined,
  };

  const onStageCharacterIds = collectOnStageCharacterIds({
    chapterOutline,
    outlineText: outlineOutput.content,
    characters,
  });

  const scopedCharacterFileContext = onStageCharacterIds.size > 0
    ? buildCharContext(characters, {
        identityRuleFocusCharacterIds: [...onStageCharacterIds],
        relevantCharacterIds: onStageCharacterIds,
      })
    : characterFileContext;
  contextWithOutline.characterContext = scopedCharacterFileContext || undefined;

  const openingSupervisorEnabled = readBoolEnv(process.env.OPENING_SUPERVISOR_ENABLED, true);
  if (openingSupervisorEnabled && chapterNumber <= 3 && hasOpeningSupervisor) {
    try {
      const openingSupervisorOutput = await runAgent('opening-supervisor', {
        ...contextWithOutline,
        previousChapterSummary: combinedPrevContext || undefined,
        temperatureOverride: 0.35,
      });
      if (openingSupervisorOutput.content.trim()) {
        contextWithOutline.chapterOpeningHints = [
          contextWithOutline.chapterOpeningHints as string | undefined,
          '开篇三章总监执行要点\n' + openingSupervisorOutput.content.trim(),
        ].filter(Boolean).join('\n\n');
      }
    } catch {
      // 开篇总监失败不阻塞
    }
  }

  if (enablePatternRotationCache && patternRotationCache) {
    const rotationHints = patternRotationCache.buildHints(novelId);
    if (rotationHints.openingHint) {
      contextWithOutline.chapterOpeningHints = [
        contextWithOutline.chapterOpeningHints as string | undefined,
        `章节开头轮换缓存提示\n- ${rotationHints.openingHint}`,
      ].filter(Boolean).join('\n');
    }
    if (rotationHints.hookHint) {
      contextWithOutline.payoffDensityHints = [
        contextWithOutline.payoffDensityHints as string | undefined,
        `章末钩子轮换缓存提示\n- ${rotationHints.hookHint}`,
      ].filter(Boolean).join('\n');
    }
  }

  if (enableAntiClicheDetection && loadPatternDB && detectClichePatterns && novelsDir) {
    try {
      const patternDB = loadPatternDB(novelsDir, novelId);
      const hints: string[] = [];
      if ((patternDB as { totalChapters: number }).totalChapters >= 2) {
        const clicheReport = detectClichePatterns('', patternDB);
        if (clicheReport.writerHints.length > 0) {
          hints.push(...clicheReport.writerHints);
        }
      }
      if (hints.length > 0) {
        contextWithOutline.antiClicheHints = hints.join('\n');
      }
    } catch {
      // 反俗套检测失败不阻塞
    }
  }

  return {
    outlineOutput,
    scenePlan,
    outlineContract,
    contextWithOutline,
    anchorAudit: outlineAnchorAudit,
  };
}
