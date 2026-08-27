import { z } from 'zod';
import { PowerCorrelationAnalystAgent } from '../../../agents/power-correlation-analyst.js';
import { PowerGradientDesignerAgent } from '../../../agents/power-gradient-designer.js';
import { PowerWorldIntegratorAgent } from '../../../agents/power-world-integrator.js';
import type { ModelClient } from '../../../models/types.js';
import type { WorldEntry } from '../../../novel/types.js';
import { chunkArray, replaceWorldCategoryEntries } from '../../../utils/curate-shared.js';
import {
  parseCuratePowerOutput,
  sanitizeCuratedPowerEntries,
  worldEntryToCuratedPowerSeed,
} from '../../../utils/curate-power-utils.js';
import {
  CuratePowerResult,
  CuratedPowerItem,
} from './world-schemas.js';
import type { GenerateDeps } from './types.js';

export const CURATE_POWER_STAGE_ROLES = [
  'power-gradient-designer',
  'power-correlation-analyst',
  'power-world-integrator',
] as const;

export type CuratePowerStageRole = typeof CURATE_POWER_STAGE_ROLES[number];

export type CuratePowerStageReport = {
  role: CuratePowerStageRole;
  summary: string;
  producedCount: number;
};

type CuratedPowerSeed = z.infer<typeof CuratedPowerItem>;

type CuratePowerStage = {
  role: CuratePowerStageRole;
  agent: PowerGradientDesignerAgent | PowerCorrelationAnalystAgent | PowerWorldIntegratorAgent;
  task: string;
};

function createCuratePowerStages(): CuratePowerStage[] {
  return [
    {
      role: 'power-gradient-designer',
      agent: new PowerGradientDesignerAgent(),
      task: '细化力量梯度层级，补齐突破门槛/消耗/风险/冷却规则。',
    },
    {
      role: 'power-correlation-analyst',
      agent: new PowerCorrelationAnalystAgent(),
      task: '分析力量维度间的协同、克制和冲突触发链。',
    },
    {
      role: 'power-world-integrator',
      agent: new PowerWorldIntegratorAgent(),
      task: '将力量体系嵌入势力、规则、历史与剧情后果链。',
    },
  ];
}

export function buildCuratePowerStageInput(params: {
  stageTask: string;
  chunkIndex: number;
  chunkCount: number;
  powerChunk: CuratedPowerSeed[];
  indexChunk: Array<{ id: string; name: string; category: string }>;
  totalPowerEntries: number;
  recentChapterSnippets: string[];
}): string {
  const { chunkCount, chunkIndex, indexChunk, powerChunk, recentChapterSnippets, stageTask, totalPowerEntries } = params;
  return [
    '## 协同梳理任务',
    `- 当前阶段：${stageTask}`,
    '- 仅处理 category=power 的条目。',
    '',
    '## 当前分片进度',
    `- 分片：${chunkIndex + 1}/${chunkCount}`,
    `- 分片力量条目数：${powerChunk.length}`,
    `- 参考索引数：${indexChunk.length}`,
    '',
    '## 输入力量候选分片（JSON）',
    JSON.stringify(powerChunk, null, 2),
    '',
    '## 世界观参考索引分片（JSON）',
    JSON.stringify(indexChunk, null, 2),
    '',
    '## 当前统计',
    `- 力量条目总数：${totalPowerEntries}`,
    '',
    '## 近期章节片段',
    recentChapterSnippets.length > 0 ? recentChapterSnippets.join('\n\n') : '（暂无章节正文）',
  ].join('\n');
}

function buildStageAggregateResult(params: {
  role: CuratePowerStageRole;
  summaryParts: string[];
  mergedCuratedEntries: CuratedPowerSeed[];
}): {
  role: CuratePowerStageRole;
  parsed: z.infer<typeof CuratePowerResult>;
} {
  const parsed = CuratePowerResult.parse({
    summary: params.summaryParts.join('；').slice(0, 800),
    entries: params.mergedCuratedEntries,
  });
  return {
    role: params.role,
    parsed,
  };
}

export function buildCuratePowerFinalResult(params: {
  stageReports: CuratePowerStageReport[];
  stageInputEntries: CuratedPowerSeed[];
}): z.infer<typeof CuratePowerResult> {
  return CuratePowerResult.parse({
    summary: params.stageReports.map(item => item.summary).filter(Boolean).join('；').slice(0, 1000),
    entries: params.stageInputEntries,
  });
}

async function replacePowerEntries(params: {
  novelId: string;
  novelManager: GenerateDeps['novelManager'];
  nextPowerEntries: WorldEntry[];
  existingWorldEntries: WorldEntry[];
}): Promise<void> {
  const { existingWorldEntries, nextPowerEntries, novelId, novelManager } = params;
  await replaceWorldCategoryEntries({
    novelId,
    novelManager,
    category: 'power',
    nextCategoryEntries: nextPowerEntries,
    existingWorldEntries,
  });
}

async function indexPowerEntries(params: {
  novelId: string;
  novelMemory: GenerateDeps['novelMemory'];
  entries: WorldEntry[];
}): Promise<void> {
  const { entries, novelId, novelMemory } = params;
  if (!novelMemory) return;
  await Promise.all(entries.map(entry =>
    novelMemory.indexWorldEntry(novelId, entry).catch(() => {}),
  ));
}

export async function applyCuratedPowerEntries(params: {
  novelId: string;
  novelManager: GenerateDeps['novelManager'];
  novelMemory: GenerateDeps['novelMemory'];
  worldEntries: WorldEntry[];
  entries: CuratedPowerSeed[];
  maxItems: number;
  summary: string;
}): Promise<{
  applied: true;
  summary: string;
  beforeCount: number;
  afterCount: number;
  entries: WorldEntry[];
}> {
  const { entries, maxItems, novelId, novelManager, novelMemory, summary, worldEntries } = params;
  const powerEntries = worldEntries.filter(item => item.category === 'power');
  const sanitizedEntries = sanitizeCuratedPowerEntries({
    curated: entries,
    existingPower: powerEntries,
    allEntries: worldEntries,
    maxItems,
  });
  if (sanitizedEntries.length === 0) {
    throw new Error('力量体系梳理结果为空，已拒绝覆盖原数据');
  }

  await replacePowerEntries({
    novelId,
    novelManager,
    nextPowerEntries: sanitizedEntries,
    existingWorldEntries: worldEntries,
  });
  await indexPowerEntries({
    novelId,
    novelMemory,
    entries: sanitizedEntries,
  });

  return {
    applied: true,
    summary,
    beforeCount: powerEntries.length,
    afterCount: sanitizedEntries.length,
    entries: sanitizedEntries,
  };
}

export async function runCuratePowerWorkflow(params: {
  deps: GenerateDeps;
  novelId: string;
  maxItems: number;
  apply: boolean;
  activeModelClient: ModelClient;
}): Promise<{
  applied: boolean;
  summary: string;
  beforeCount: number;
  afterCount: number;
  entries: WorldEntry[];
  degraded?: boolean;
  stageReports: CuratePowerStageReport[];
}> {
  const { activeModelClient, apply, deps, maxItems, novelId } = params;
  const { broadcast, novelManager } = deps;
  const timestamp = new Date().toISOString();

  const [novel, worldEntries, chapterMetas] = await Promise.all([
    novelManager.getNovel(novelId),
    novelManager.getWorldEntries(novelId),
    novelManager.listChapters(novelId),
  ]);
  if (!novel) {
    throw new Error('小说不存在');
  }

  const powerEntries = worldEntries.filter(item => item.category === 'power');
  const nonPowerEntries = worldEntries.filter(item => item.category !== 'power');
  const writtenChapters = chapterMetas
    .filter(chapter => chapter.wordCount > 0 || chapter.status !== 'outlined')
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
  const chapterBase = writtenChapters.length > 0 ? writtenChapters : chapterMetas;
  const currentChapter = chapterBase.length > 0
    ? Math.max(...chapterBase.map(chapter => chapter.chapterNumber))
    : 0;
  const recentNumbers = chapterBase.slice(-8).map(item => item.chapterNumber);
  const recentChapters = await Promise.all(
    recentNumbers.map(num => novelManager.getChapter(novelId, num)),
  );
  const recentChapterSnippets = recentChapters
    .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter))
    .map(chapter => `### 第${chapter.chapterNumber}章\n${chapter.content.slice(0, 700)}`);

  const indexChunks = chunkArray(nonPowerEntries.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
  })), 120);
  const runIndexChunks = indexChunks.length > 0 ? indexChunks : [[]];

  let stageInputEntries = powerEntries.map(worldEntryToCuratedPowerSeed);
  const stageReports: CuratePowerStageReport[] = [];
  const stages = createCuratePowerStages();

  for (const stage of stages) {
    broadcast({
      type: 'agent:start',
      agentRole: stage.role,
      novelId,
      chapterNumber: currentChapter || undefined,
      data: '',
      timestamp,
    });

    const stageChunks = chunkArray(stageInputEntries, 20);
    const runStageChunks = stageChunks.length > 0 ? stageChunks : [[]];
    const mergedCuratedEntries: CuratedPowerSeed[] = [];
    const summaryParts: string[] = [];
    const rawOutputs: string[] = [];

    for (let idx = 0; idx < runStageChunks.length; idx += 1) {
      const powerChunk = runStageChunks[idx];
      const indexChunk = runIndexChunks[idx % runIndexChunks.length];
      let streamed = '';
      const output = await stage.agent.execute({
        novelId,
        genre: novel.genre,
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis,
        chapterNumber: currentChapter || undefined,
        inputText: buildCuratePowerStageInput({
          stageTask: stage.task,
          chunkIndex: idx,
          chunkCount: runStageChunks.length,
          powerChunk,
          indexChunk,
          totalPowerEntries: powerEntries.length,
          recentChapterSnippets,
        }),
      }, activeModelClient, (chunk) => {
        streamed += chunk;
        broadcast({
          type: 'agent:chunk',
          agentRole: stage.role,
          novelId,
          chapterNumber: currentChapter || undefined,
          data: chunk,
          timestamp: new Date().toISOString(),
        });
      });
      const rawContent = streamed || output.content;
      rawOutputs.push(rawContent);

      const parsedChunk = CuratePowerResult.safeParse(parseCuratePowerOutput(rawContent));
      if (parsedChunk.success) {
        mergedCuratedEntries.push(...parsedChunk.data.entries);
        if (parsedChunk.data.summary.trim()) {
          summaryParts.push(parsedChunk.data.summary.trim());
        }
      }
    }

    const rawContent = rawOutputs.join('\n\n---\n\n');
    broadcast({
      type: 'agent:complete',
      agentRole: stage.role,
      novelId,
      chapterNumber: currentChapter || undefined,
      data: rawContent,
      timestamp: new Date().toISOString(),
    });

    const stageResult = buildStageAggregateResult({
      role: stage.role,
      summaryParts,
      mergedCuratedEntries,
    });
    stageReports.push({
      role: stageResult.role,
      summary: stageResult.parsed.summary,
      producedCount: stageResult.parsed.entries.length,
    });
    if (stageResult.parsed.entries.length > 0) {
      stageInputEntries = stageResult.parsed.entries;
    }
  }

  const curatedParsed = buildCuratePowerFinalResult({
    stageReports,
    stageInputEntries,
  });
  const sanitizedEntries = sanitizeCuratedPowerEntries({
    curated: curatedParsed.entries,
    existingPower: powerEntries,
    allEntries: worldEntries,
    maxItems,
  });

  if (sanitizedEntries.length === 0) {
    if (apply) {
      throw new Error('力量体系梳理结果为空，已拒绝覆盖原数据');
    }
    return {
      applied: false,
      summary: curatedParsed.summary || '梳理器未产出可用结果，已回退为当前力量条目预览。',
      beforeCount: powerEntries.length,
      afterCount: powerEntries.length,
      entries: powerEntries,
      degraded: true,
      stageReports,
    };
  }

  if (apply) {
    await replacePowerEntries({
      novelId,
      novelManager,
      nextPowerEntries: sanitizedEntries,
      existingWorldEntries: worldEntries,
    });
    await indexPowerEntries({
      novelId,
      novelMemory: deps.novelMemory,
      entries: sanitizedEntries,
    });
  }

  return {
    applied: apply,
    summary: curatedParsed.summary,
    beforeCount: powerEntries.length,
    afterCount: sanitizedEntries.length,
    entries: sanitizedEntries,
    stageReports,
  };
}

export function broadcastCuratePowerError(params: {
  deps: GenerateDeps;
  novelId: string;
  message: string;
}): void {
  for (const role of CURATE_POWER_STAGE_ROLES) {
    params.deps.broadcast({
      type: 'agent:error',
      agentRole: role,
      novelId: params.novelId,
      chapterNumber: undefined,
      data: params.message,
      timestamp: new Date().toISOString(),
    });
  }
}
