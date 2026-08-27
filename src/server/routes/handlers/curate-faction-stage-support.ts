import type { OutlineData, WorldEntry } from '../../../novel/types.js';
import { FactionCultureArchitectAgent } from '../../../agents/faction-culture-architect.js';
import { FactionInheritanceDesignerAgent } from '../../../agents/faction-inheritance-designer.js';
import { FactionMotiveMissionPlannerAgent } from '../../../agents/faction-motive-mission-planner.js';
import type { GenerateDeps } from './types.js';

export const FACTION_STAGE_ROLES = [
  'faction-culture-architect',
  'faction-inheritance-designer',
  'faction-motive-mission-planner',
] as const;

export type FactionStageRole = typeof FACTION_STAGE_ROLES[number];

export type FactionStageReport = {
  role: FactionStageRole;
  summary: string;
  producedCount: number;
};

export type CurateFactionStage = {
  role: FactionStageRole;
  agent: FactionCultureArchitectAgent | FactionInheritanceDesignerAgent | FactionMotiveMissionPlannerAgent;
  task: string;
};

export function createCurateFactionStages(): CurateFactionStage[] {
  return [
    {
      role: 'faction-culture-architect',
      agent: new FactionCultureArchitectAgent(),
      task: '梳理势力文化锚点、禁忌、仪式和组织行为规范。',
    },
    {
      role: 'faction-inheritance-designer',
      agent: new FactionInheritanceDesignerAgent(),
      task: '梳理势力传承链、继任规则与权力交接成本。',
    },
    {
      role: 'faction-motive-mission-planner',
      agent: new FactionMotiveMissionPlannerAgent(),
      task: '梳理势力动机与核心任务链，形成剧情驱动动作。',
    },
  ];
}

export function buildFactionOutlineWindow(
  outline: OutlineData,
  currentChapter: number,
): string[] {
  return outline.chapters
    .filter((chapter) => {
      if (currentChapter <= 0) {
        return chapter.chapterNumber <= 6;
      }
      return Math.abs(chapter.chapterNumber - currentChapter) <= 3;
    })
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .slice(0, 8)
    .map((chapter) => {
      const title = chapter.title?.trim() || '未命名';
      const summary = chapter.summary?.trim() || '（无摘要）';
      const keyEvents = chapter.keyEvents?.slice(0, 3).join('；') || '（无）';
      const threads = chapter.plotThreadsAdvanced?.slice(0, 3).join('、') || '（无）';
      return `- 第${chapter.chapterNumber}章《${title}》\n  摘要：${summary.slice(0, 220)}\n  关键事件：${keyEvents}\n  推进主线：${threads}`;
    });
}

export function buildFactionPlotThreadHints(outline: OutlineData): string[] {
  return outline.plotThreads
    .slice(0, 12)
    .map((thread) => `- ${thread.name}（${thread.status}）：${thread.description.slice(0, 140)}`);
}

export function buildFactionForeshadowingHints(outline: OutlineData): string[] {
  return outline.foreshadowing
    .filter(item => !item.isResolved)
    .slice(0, 12)
    .map(item => `- ${item.hint}（埋设章：${item.plantedInChapter}）`);
}

export function buildFactionStageInput(params: {
  stageTask: string;
  chunkIndex: number;
  chunkCount: number;
  factionChunk: unknown[];
  indexChunk: Array<{ id: string; name: string; category: string }>;
  totalFactionEntries: number;
  outlineWindow: string[];
  plotThreadHints: string[];
  unresolvedForeshadowingHints: string[];
  recentChapterSnippets: string[];
}): string {
  return [
    '## 协同梳理任务',
    `- 当前阶段：${params.stageTask}`,
    '- 仅处理 category=faction 的条目。',
    '- 必须先对齐大纲，再进行势力设计；脱离大纲的设定不得新增。',
    '- 每条势力调整应至少能映射到一个"大纲章节/主线线程/未回收伏笔"。',
    '',
    '## 大纲强约束（必须遵守）',
    '- 势力文化/传承/任务必须服务当前已规划剧情，不得凭空扩写世界。',
    '- 若输入信息不足，优先保守补全，不要编造跨时代、跨主线的设定。',
    '',
    '## 章节大纲窗口',
    params.outlineWindow.length > 0 ? params.outlineWindow.join('\n') : '（暂无可用章节大纲）',
    '',
    '## 主线线程',
    params.plotThreadHints.length > 0 ? params.plotThreadHints.join('\n') : '（暂无主线线程）',
    '',
    '## 未回收伏笔',
    params.unresolvedForeshadowingHints.length > 0 ? params.unresolvedForeshadowingHints.join('\n') : '（暂无未回收伏笔）',
    '',
    '## 当前分片进度',
    `- 分片：${params.chunkIndex + 1}/${params.chunkCount}`,
    `- 分片势力条目数：${params.factionChunk.length}`,
    `- 参考索引数：${params.indexChunk.length}`,
    '',
    '## 输入势力候选分片（JSON）',
    JSON.stringify(params.factionChunk, null, 2),
    '',
    '## 世界观参考索引分片（JSON）',
    JSON.stringify(params.indexChunk, null, 2),
    '',
    '## 当前统计',
    `- 势力条目总数：${params.totalFactionEntries}`,
    '',
    '## 近期章节片段',
    params.recentChapterSnippets.length > 0 ? params.recentChapterSnippets.join('\n\n') : '（暂无章节正文）',
  ].join('\n');
}

export function buildFactionCuratedSummary(stageReports: FactionStageReport[]): string {
  return stageReports.map(item => item.summary).filter(Boolean).join('；').slice(0, 1000);
}

export function buildFactionFinalSummary(params: {
  factionEntries: WorldEntry[];
  sanitizedEntries: WorldEntry[];
  stageReports: FactionStageReport[];
  curatedSummary: string;
  fallbackApplied: boolean;
}): string {
  const stageCountSummary = params.stageReports.map(item => `${item.role}:${item.producedCount}`).join('，');
  const systemSummaryParts = [
    `势力协同梳理完成：${params.factionEntries.length} -> ${params.sanitizedEntries.length}`,
    `阶段产出：${stageCountSummary}`,
  ];
  if (params.fallbackApplied) {
    systemSummaryParts.push('检测到结果过度收缩，已自动回填原势力条目以防误删。');
  }
  if (params.curatedSummary.trim()) {
    systemSummaryParts.push(`AI摘要：${params.curatedSummary.trim()}`);
  }
  return systemSummaryParts.join('\n');
}

export function broadcastCurateFactionError(params: {
  deps: GenerateDeps;
  novelId: string;
  message: string;
}): void {
  for (const role of FACTION_STAGE_ROLES) {
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
