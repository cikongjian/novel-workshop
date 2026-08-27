import type { CharacterProfile, ChapterOutline, NovelMetadata, OutlineData } from '../novel/types.js';
import type { StoryState } from '../novel/story-state-types.js';
import type { PipelineNovelManager } from './types.js';
import type { ForeshadowingAnalysis } from './foreshadowing-tracker.js';
import type { ThreadGraphAnalysis } from './plot-thread-graph.js';
import { buildIdentitySpeechRuleLine } from './character-identity-rules.js';

export type SuperLongModeHints = {
  layeredMemoryHint?: string;
  characterLedgerHint?: string;
  timelineEngineHint?: string;
  foreshadowDebtHint?: string;
  antiAiRadarHint?: string;
  povLockHint?: string;
  chapterGoalBudgetHint?: string;
  hookPlannerHint?: string;
};

type ChapterDigest = {
  chapterNumber: number;
  title: string;
  summary: string;
};

const DEFAULT_RECENT_CHAPTERS = 20;
const AI_TEXTURE_PATTERNS = [
  '指节发白',
  '眸色一沉',
  '空气仿佛凝固',
  '嘴角勾起一抹',
  '喉结滚动',
  '心头一紧',
  '瞳孔骤缩',
  '呼吸一滞',
];

function buildChapterSummaryFromContent(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.slice(0, 140);
}

async function loadChapterDigests(
  novelManager: PipelineNovelManager,
  novelId: string,
  chapterNumbers: number[],
): Promise<ChapterDigest[]> {
  if (chapterNumbers.length === 0) return [];
  const chapters = await Promise.all(
    chapterNumbers.map(async (chapterNumber) => {
      const chapter = await novelManager.getChapter(novelId, chapterNumber).catch(() => null);
      if (!chapter) return null;
      const summary = (chapter.summary || '').trim() || buildChapterSummaryFromContent(chapter.content || '');
      return {
        chapterNumber,
        title: chapter.title || '',
        summary,
      };
    }),
  );
  return chapters.filter((item): item is ChapterDigest => Boolean(item?.summary));
}

function resolveVolumeSize(totalPlannedChapters: number): number {
  if (totalPlannedChapters >= 300) return 30;
  if (totalPlannedChapters >= 160) return 24;
  if (totalPlannedChapters >= 100) return 20;
  return 15;
}

async function buildLayeredMemoryHint(params: {
  novelManager: PipelineNovelManager;
  novelId: string;
  novel: NovelMetadata;
  storyState?: StoryState | null;
  chapterNumber: number;
}): Promise<string> {
  const { novelManager, novelId, novel, storyState, chapterNumber } = params;
  const chapterMetas = await novelManager.listChapters(novelId).catch(() => []);
  const history = chapterMetas
    .filter(item => item.chapterNumber > 0 && item.chapterNumber < chapterNumber)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
  if (history.length === 0) return '';

  const recentNumbers = history.slice(-DEFAULT_RECENT_CHAPTERS).map(item => item.chapterNumber);
  const recentDigests = await loadChapterDigests(novelManager, novelId, recentNumbers);

  const totalPlanned = Math.max(novel.targetChapters ?? chapterNumber, history.length + 1);
  const volumeSize = resolveVolumeSize(totalPlanned);
  const currentVolume = Math.max(1, Math.ceil(chapterNumber / volumeSize));
  const previousVolume = Math.max(1, currentVolume - 1);
  const prevVolumeStart = (previousVolume - 1) * volumeSize + 1;
  const prevVolumeEnd = previousVolume * volumeSize;
  const prevVolumeNumbers = history
    .map(item => item.chapterNumber)
    .filter(num => num >= prevVolumeStart && num <= prevVolumeEnd)
    .slice(-6);
  const prevVolumeDigests = await loadChapterDigests(novelManager, novelId, prevVolumeNumbers);

  const lines: string[] = ['【分层记忆（全书/分卷/近章）】'];
  const arcSummaries = storyState?.compressedArcs?.slice(-3) ?? [];
  if (arcSummaries.length > 0) {
    lines.push('全书层（压缩弧线）：');
    for (const arc of arcSummaries) {
      lines.push(`- 第${arc.chapterRange.start}-${arc.chapterRange.end}章：${arc.summary}`);
    }
  }

  if (prevVolumeDigests.length > 0) {
    lines.push(`分卷层（上一卷核心，卷区间约第${prevVolumeStart}-${prevVolumeEnd}章）：`);
    for (const item of prevVolumeDigests) {
      lines.push(`- 第${item.chapterNumber}章${item.title ? `《${item.title}》` : ''}：${item.summary}`);
    }
  }

  if (recentDigests.length > 0) {
    lines.push('近20章层（优先衔接）：');
    for (const item of recentDigests.slice(-12)) {
      lines.push(`- 第${item.chapterNumber}章：${item.summary}`);
    }
  }

  lines.push('写作优先级：近20章 > 分卷层 > 全书层，冲突时以近章信息为准。');
  return lines.join('\n');
}

function buildCharacterLedgerHint(params: {
  characters: CharacterProfile[];
  storyState?: StoryState | null;
}): string {
  const { characters, storyState } = params;
  if (characters.length === 0) return '';
  const latestSnapshot = storyState?.snapshots?.[storyState.snapshots.length - 1];
  const liveStateByName = new Map(
    (latestSnapshot?.characters ?? []).map(item => [item.name, item]),
  );

  const lines: string[] = ['【角色状态账本（身份/称谓/关系）】'];
  for (const character of characters.slice(0, 12)) {
    const state = liveStateByName.get(character.name);
    const identityRule = buildIdentitySpeechRuleLine(character);
    const relationBrief = character.relationships.slice(0, 2)
      .map(item => `${item.targetId}:${item.type}`)
      .join('；');

    const parts: string[] = [];
    if (character.position) parts.push(`身份=${character.position}`);
    if (identityRule) parts.push(`称谓约束=${identityRule}`);
    if (state?.currentGoal) parts.push(`当前目标=${state.currentGoal}`);
    if (state?.emotionalState) parts.push(`情绪=${state.emotionalState}`);
    if (relationBrief) parts.push(`关系=${relationBrief}`);
    if (state?.alive === false || state?.present === false) {
      parts.push(`在场状态=${state.alive === false ? '死亡' : '离场'}`);
    }
    if (parts.length === 0) continue;
    lines.push(`- ${character.name}：${parts.join(' | ')}`);
  }
  lines.push('对话前先校验身份和称谓，禁止跨身份自称。');
  return lines.length > 2 ? lines.join('\n') : '';
}

function buildTimelineEngineHint(storyState?: StoryState | null): string {
  if (!storyState || storyState.snapshots.length === 0) return '';
  const recentSnapshots = storyState.snapshots.slice(-6);
  const latestSnapshot = recentSnapshots[recentSnapshots.length - 1];
  const lines: string[] = ['【时间线与因果引擎】'];

  const markers = recentSnapshots
    .map(item => item.world?.timelineMarker?.trim())
    .filter(Boolean);
  if (markers.length > 0) {
    lines.push(`最近时间锚：${markers.join(' → ')}`);
  }

  const pendingEffects = (latestSnapshot.causalChains ?? [])
    .flatMap(item => item.pendingEffects.map(effect => `由「${item.cause}」引发：${effect}`))
    .slice(0, 5);
  if (pendingEffects.length > 0) {
    lines.push('待兑现因果：');
    for (const effect of pendingEffects) {
      lines.push(`- ${effect}`);
    }
  }

  const nextConstraints = latestSnapshot.nextChapterConstraints?.slice(0, 6) ?? [];
  if (nextConstraints.length > 0) {
    lines.push('下一章硬约束：');
    for (const item of nextConstraints) {
      lines.push(`- ${item}`);
    }
  }

  lines.push('不得打乱先后顺序；跨时段跳转必须给出明确时间标记。');
  return lines.join('\n');
}

function resolveForeshadowDueThreshold(scope: 'scene' | 'arc' | 'saga', priority: 'high' | 'medium' | 'low'): number {
  if (scope === 'scene') {
    if (priority === 'high') return 1;
    if (priority === 'medium') return 2;
    return 3;
  }
  if (scope === 'saga') {
    if (priority === 'high') return 15;
    if (priority === 'medium') return 25;
    return 40;
  }
  if (priority === 'high') return 5;
  if (priority === 'medium') return 8;
  return 12;
}

function buildForeshadowDebtHint(params: {
  chapterNumber: number;
  foreshadowingAnalysis: ForeshadowingAnalysis;
}): string {
  const { chapterNumber, foreshadowingAnalysis } = params;
  if (foreshadowingAnalysis.overdue.length === 0 && foreshadowingAnalysis.active.length === 0) return '';

  const lines: string[] = ['【伏笔债务看板】'];
  for (const overdue of foreshadowingAnalysis.overdue.slice(0, 4)) {
    lines.push(`- [逾期${overdue.chaptersElapsed}章] ${overdue.item.hint}`);
  }
  for (const active of foreshadowingAnalysis.active.slice(0, 3)) {
    const threshold = resolveForeshadowDueThreshold(active.scope, active.item.priority);
    const dueChapter = active.item.plantedInChapter + threshold;
    const remain = Math.max(0, dueChapter - chapterNumber);
    lines.push(`- [到期窗口 第${dueChapter}章，剩余${remain}章] ${active.item.hint}`);
  }
  lines.push('本章至少回收 1 条逾期伏笔，并推进 1 条即将到期伏笔。');
  return lines.join('\n');
}

function countPatternOccurrences(text: string, pattern: string): number {
  if (!text || !pattern) return 0;
  let count = 0;
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(pattern, from);
    if (index < 0) break;
    count += 1;
    from = index + pattern.length;
  }
  return count;
}

function normalizeSentencePattern(text: string): string {
  return text
    .replace(/[，。！？；、,.!?;:：\s"“”‘’'`()（）【】《》]/g, '')
    .replace(/\d+/g, '#');
}

function buildAntiAiRadarHint(textSamples: string[]): string {
  if (textSamples.length === 0) return '';
  const combined = textSamples.join('\n');
  const frequentTextures = AI_TEXTURE_PATTERNS
    .map(pattern => ({ pattern, count: countPatternOccurrences(combined, pattern) }))
    .filter(item => item.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const sentenceFreq = new Map<string, number>();
  for (const text of textSamples) {
    const sentences = text.split(/[。！？\n]/).map(item => item.trim()).filter(Boolean);
    for (const sentence of sentences) {
      if (sentence.length < 8 || sentence.length > 26) continue;
      const key = normalizeSentencePattern(sentence);
      if (!key) continue;
      sentenceFreq.set(key, (sentenceFreq.get(key) ?? 0) + 1);
    }
  }
  const repeatedSentenceCount = [...sentenceFreq.values()].filter(count => count >= 3).length;
  if (frequentTextures.length === 0 && repeatedSentenceCount === 0) return '';

  const lines: string[] = ['【重复表达雷达（跨章）】'];
  if (frequentTextures.length > 0) {
    lines.push('近期高频纹理：');
    for (const item of frequentTextures) {
      lines.push(`- ${item.pattern}（${item.count}次）`);
    }
  }
  if (repeatedSentenceCount > 0) {
    lines.push(`- 检测到 ${repeatedSentenceCount} 组句式重复（3次以上），本章需主动换骨重写。`);
  }
  lines.push('策略：同义替换 + 感官通道轮换 + 环境侧写，避免模板微动作堆叠。');
  return lines.join('\n');
}

function buildPovLockHint(textSamples: string[]): string {
  if (textSamples.length === 0) return '';
  const combined = textSamples.join('\n');
  const firstPerson = (combined.match(/(^|[^A-Za-z])(我|我们|咱|俺)([^A-Za-z]|$)/g) ?? []).length;
  const thirdPerson = (combined.match(/(^|[^A-Za-z])(他|她|他们|她们)([^A-Za-z]|$)/g) ?? []).length;
  const innerMonologue = (combined.match(/(心想|暗道|想着|念头一转)/g) ?? []).length;

  let perspective = '混合视角';
  if (firstPerson > thirdPerson * 1.5) perspective = '第一人称';
  else if (thirdPerson > firstPerson * 1.5) perspective = '第三人称';

  const distance = innerMonologue >= 6 ? '近景内心' : '中景叙述';
  return [
    '【视角与叙述锁】',
    `近8章主视角倾向：${perspective}；叙述距离：${distance}。`,
    '本章保持同一主视角，不要跨段突然切换叙述人称。',
  ].join('\n');
}

function buildChapterGoalBudgetHint(params: {
  chapterNumber: number;
  novel: NovelMetadata;
  chapterOutline?: ChapterOutline;
}): string {
  const { chapterNumber, novel, chapterOutline } = params;
  const planned = novel.targetChapters ?? Math.max(chapterNumber, 1);
  const progress = Math.min(1, chapterNumber / Math.max(1, planned));
  let budget = {
    plot: 40,
    character: 35,
    world: 15,
    hook: 10,
  };
  if (progress < 0.33) {
    budget = { plot: 45, character: 25, world: 20, hook: 10 };
  } else if (progress > 0.8) {
    budget = { plot: 35, character: 40, world: 10, hook: 15 };
  }

  const lines: string[] = [
    '【章节目标预算】',
    `- 剧情推进 ${budget.plot}%`,
    `- 角色成长 ${budget.character}%`,
    `- 世界信息 ${budget.world}%`,
    `- 章末钩子 ${budget.hook}%`,
  ];

  if (chapterOutline?.summary) {
    lines.push(`本章主任务：${chapterOutline.summary}`);
  }
  if ((chapterOutline?.keyEvents?.length ?? 0) > 0) {
    lines.push(`关键事件：${chapterOutline!.keyEvents.slice(0, 3).join('；')}`);
  }
  lines.push('写作时按预算分配篇幅，避免单一模块吞噬字数。');
  return lines.join('\n');
}

function buildHookPlannerHint(params: {
  chapterOutline?: ChapterOutline;
  threadGraphAnalysis: ThreadGraphAnalysis;
  foreshadowingAnalysis: ForeshadowingAnalysis;
}): string {
  const { chapterOutline, threadGraphAnalysis, foreshadowingAnalysis } = params;
  const overdue = foreshadowingAnalysis.overdue[0];
  const blocked = threadGraphAnalysis.blocked[0];
  const ready = threadGraphAnalysis.readyToAdvance[0];
  const seed = chapterOutline?.summary || '当前主线';

  const optionA = overdue
    ? `悬念型：章末揭示「${overdue.item.hint}」的新线索，但不解释来源。`
    : `悬念型：章末揭示「${seed}」背后隐藏信息，但暂不说明真相。`;
  const optionB = blocked
    ? `危机型：章末抛出「${blocked.threadName}」的新阻断，直接压迫下一章行动。`
    : `危机型：章末出现突发威胁，迫使主角立即改线。`;
  const optionC = ready
    ? `抉择型：章末让主角在推进「${ready.threadName}」与守住当前关系间做两难选择。`
    : '抉择型：章末给出二选一代价（保全目标/保全关系）。';

  return [
    '【断章钩子规划器】',
    `A. ${optionA}`,
    `B. ${optionB}`,
    `C. ${optionC}`,
    '建议：优先选择与本章主冲突同源的方案，避免“硬转场式”钩子。',
  ].join('\n');
}

export async function buildSuperLongModeHints(params: {
  enabled: boolean;
  novelManager: PipelineNovelManager;
  novelId: string;
  novel: NovelMetadata;
  chapterNumber: number;
  outline: OutlineData;
  chapterOutline?: ChapterOutline;
  characters: CharacterProfile[];
  storyState?: StoryState | null;
  foreshadowingAnalysis: ForeshadowingAnalysis;
  threadGraphAnalysis: ThreadGraphAnalysis;
}): Promise<SuperLongModeHints> {
  if (!params.enabled) return {};

  const chapterMetas = await params.novelManager.listChapters(params.novelId).catch(() => []);
  const recentNumbers = chapterMetas
    .filter(item => item.chapterNumber > 0 && item.chapterNumber < params.chapterNumber)
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .slice(-8)
    .map(item => item.chapterNumber);

  const recentTexts = await Promise.all(
    recentNumbers.map(async (num) => {
      const chapter = await params.novelManager.getChapter(params.novelId, num).catch(() => null);
      return chapter?.content || '';
    }),
  );
  const nonEmptyRecentTexts = recentTexts.filter(Boolean);

  return {
    layeredMemoryHint: await buildLayeredMemoryHint({
      novelManager: params.novelManager,
      novelId: params.novelId,
      novel: params.novel,
      storyState: params.storyState,
      chapterNumber: params.chapterNumber,
    }),
    characterLedgerHint: buildCharacterLedgerHint({
      characters: params.characters,
      storyState: params.storyState,
    }),
    timelineEngineHint: buildTimelineEngineHint(params.storyState),
    foreshadowDebtHint: buildForeshadowDebtHint({
      chapterNumber: params.chapterNumber,
      foreshadowingAnalysis: params.foreshadowingAnalysis,
    }),
    antiAiRadarHint: buildAntiAiRadarHint(nonEmptyRecentTexts),
    povLockHint: buildPovLockHint(nonEmptyRecentTexts),
    chapterGoalBudgetHint: buildChapterGoalBudgetHint({
      chapterNumber: params.chapterNumber,
      novel: params.novel,
      chapterOutline: params.chapterOutline,
    }),
    hookPlannerHint: buildHookPlannerHint({
      chapterOutline: params.chapterOutline,
      threadGraphAnalysis: params.threadGraphAnalysis,
      foreshadowingAnalysis: params.foreshadowingAnalysis,
    }),
  };
}
