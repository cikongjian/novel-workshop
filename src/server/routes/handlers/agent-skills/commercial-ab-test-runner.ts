import { getAgentSkillService } from '../../../../agent-skills/service.js';
import { WriterAgent } from '../../../../agents/writer.js';
import { getConfig, getNovelsDir } from '../../../../config/index.js';
import { createModelClient } from '../../../../models/provider.js';
import { NovelManager } from '../../../../novel/novel-manager.js';
import { evaluateQualityGate } from '../../../../pipeline/quality-gate.js';
import {
  buildAbComparisons,
  buildWriterContext,
  computeAverageDelta,
  pickAbSamples,
  toAbScore,
} from './commercial-ab-test-support.js';
import type {
  AgentSkillAbSample,
  AgentSkillAbScore,
  RunCommercialAbTestInput,
} from './commercial-ab-test-types.js';

type AbScoreRow = {
  sample: AgentSkillAbSample;
  score: AgentSkillAbScore;
  skillCount: number;
};

async function runAbPass(params: {
  samples: AgentSkillAbSample[];
  novelManager: NovelManager;
  service: ReturnType<typeof getAgentSkillService>;
  writer: WriterAgent;
  model: ReturnType<typeof createModelClient>;
  config: ReturnType<typeof getConfig>;
}): Promise<AbScoreRow[]> {
  const { config, model, novelManager, samples, service, writer } = params;
  const rows: AbScoreRow[] = [];

  for (const sample of samples) {
    const built = await buildWriterContext(novelManager, sample);
    const resolved = await service.resolveSkills({
      novelId: sample.novelId,
      genre: built.genre,
      role: 'writer',
    });
    const output = await writer.execute(built.context, model);
    const report = evaluateQualityGate({
      chapterContent: output.content,
      scenePlan: built.scenePlan,
      gateMode: config.qualityFeatures.gateMode,
      thresholds: {
        passScore: config.qualityFeatures.passScore,
        minStructureScore: config.qualityFeatures.minStructureScore,
        minStyleScore: config.qualityFeatures.minStyleScore,
        minEmotionScore: config.qualityFeatures.minEmotionScore,
      },
    });
    rows.push({
      sample,
      score: toAbScore(report),
      skillCount: resolved.selectedSkills.length,
    });
  }

  return rows;
}

export async function runCommercialPackAbTest(
  params: RunCommercialAbTestInput,
): Promise<{
  testedAt: string;
  durationMs: number;
  seedMode: 'classic' | 'genre-layered';
  sampleCount: number;
  seedResult: {
    createdCount: number;
    updatedCount: number;
    reusedCount: number;
  };
  comparisons: ReturnType<typeof buildAbComparisons>;
  averageDelta: ReturnType<typeof computeAverageDelta>;
}> {
  const startedAt = Date.now();
  const config = getConfig();
  const model = createModelClient(config);
  const novelManager = new NovelManager(getNovelsDir());
  const writer = new WriterAgent();
  const service = getAgentSkillService();
  const sampleCount = params.sampleCount ?? 2;
  const seedMode = params.seedMode ?? 'genre-layered';
  const refreshExisting = params.refreshExisting ?? true;
  const samples = await pickAbSamples(novelManager, sampleCount);
  if (samples.length === 0) {
    throw new Error('未找到可用于复测的章节样本，请先确保有可用章节。');
  }

  const originalGlobalPolicy = await service.getGlobalPolicy();
  const originalNovelPolicies = new Map<string, Awaited<ReturnType<typeof service.getNovelPolicy>>>();

  try {
    for (const sample of samples) {
      originalNovelPolicies.set(sample.novelId, await service.getNovelPolicy(sample.novelId));
    }

    await service.updateGlobalPolicy({});
    for (const sample of samples) {
      await service.updateNovelPolicy(sample.novelId, {});
    }

    const baselineRows = await runAbPass({
      samples,
      novelManager,
      service,
      writer,
      model,
      config,
    });

    const seedResult = await service.seedCommercialPack({
      enableByDefault: true,
      refreshExisting,
      mode: seedMode,
      createdBy: 'ui-ab-test',
    });

    const enhancedRows = await runAbPass({
      samples,
      novelManager,
      service,
      writer,
      model,
      config,
    });

    const comparisons = buildAbComparisons(baselineRows, enhancedRows);

    return {
      testedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      seedMode,
      sampleCount: samples.length,
      seedResult: {
        createdCount: seedResult.created.length,
        updatedCount: seedResult.updated.length,
        reusedCount: seedResult.reused.length,
      },
      comparisons,
      averageDelta: computeAverageDelta(comparisons),
    };
  } finally {
    await service.updateGlobalPolicy(originalGlobalPolicy);
    for (const sample of samples) {
      await service.updateNovelPolicy(sample.novelId, originalNovelPolicies.get(sample.novelId) ?? {});
    }
  }
}
