import type { Chapter } from '../novel/types.js';

export type MemoryContextAuditSource =
  | 'previousChapter'
  | 'chapterVector'
  | 'enhancedPreviousSummary'
  | 'worldVector'
  | 'characterVector'
  | 'digestVector'
  | 'arcVector'
  | 'factVector'
  | 'threadVector'
  | 'characterStateVector'
  | 'storyState'
  | 'truthFiles';

export type MemoryContextAuditSourceReport = {
  source: MemoryContextAuditSource;
  chars: number;
  present: boolean;
  usedInPrompt: boolean;
  reusableAnchorCount?: number;
  reusableAnchorKinds?: StoryAnchorKind[];
  note?: string;
  sections?: string[];
};

export type StoryAnchorKind =
  | 'character'
  | 'place'
  | 'rule'
  | 'object'
  | 'goal'
  | 'conflict'
  | 'state'
  | 'thread';

export type MemoryContextAudit = {
  mode: 'observe';
  retriever: 'legacy' | 'orchestrator';
  totalChars: number;
  promptChars: number;
  reusableAnchorCount?: number;
  reusableAnchorDensity?: number;
  unusedPersistedSources: MemoryContextAuditSource[];
  emptyPromptSources: MemoryContextAuditSource[];
  warnings: string[];
  sources: MemoryContextAuditSourceReport[];
};

type AuditInput = {
  retriever: MemoryContextAudit['retriever'];
  previousChapterContext?: string;
  chapterVectorContext?: string;
  enhancedPreviousSummary?: string;
  worldVectorContext?: string;
  characterVectorContext?: string;
  digestVectorContext?: string;
  arcVectorContext?: string;
  factVectorContext?: string;
  threadVectorContext?: string;
  characterStateVectorContext?: string;
  storyStateContext?: string;
  truthFilesContext?: string;
  truthFilesPresent?: boolean;
  truthFilesUsedInPrompt?: boolean;
  truthFilesSections?: string[];
};

function chars(value: string | undefined): number {
  return value?.trim().length ?? 0;
}

const STORY_ANCHOR_PATTERNS: Record<StoryAnchorKind, RegExp[]> = {
  character: [/人物|角色|主角|队友|同事|客户|族人|族长|师父|名字|称呼|关系/u],
  place: [/地点|场景|会议室|球场|空间站|气闸|厨房|公寓|洞口|灶台|摊位|房间|城市/u],
  rule: [/规则|设定|限制|制度|契约|流程|口径|分工|参数|必须|不能|不得|只要/u],
  object: [/物品|道具|设备|合同|文件|清单|陶罐|骨棍|传感器|阀门|工单|球|钥匙/u],
  goal: [/目标|计划|任务|下一步|要把|得把|推进|签约|守洞|校准|防守|成交|修复/u],
  conflict: [/阻碍|冲突|压力|危机|失败|不够|断了|对手|拒绝|报警|神罚|代价|风险/u],
  state: [/状态|情绪|关系|信任|伤势|读数|进度|站队|余额|积分|位置|变化/u],
  thread: [/伏笔|线索|悬念|钩子|承接|回收|未回收|待办|pending|hook/i],
};

function countPatternHits(text: string, pattern: RegExp): number {
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  return [...text.matchAll(globalPattern)].length;
}

function collectStoryAnchorStats(value: string | undefined): {
  count: number;
  kinds: StoryAnchorKind[];
} {
  const text = value?.trim();
  if (!text) return { count: 0, kinds: [] };
  const kinds: StoryAnchorKind[] = [];
  let count = 0;
  for (const [kind, patterns] of Object.entries(STORY_ANCHOR_PATTERNS) as Array<[StoryAnchorKind, RegExp[]]>) {
    const kindHits = patterns.reduce((sum, pattern) => sum + countPatternHits(text, pattern), 0);
    if (kindHits > 0) {
      kinds.push(kind);
      count += Math.min(kindHits, 12);
    }
  }
  return { count, kinds };
}

function sourceReport(
  source: MemoryContextAuditSource,
  value: string | undefined,
  usedInPrompt: boolean,
  note?: string,
): MemoryContextAuditSourceReport {
  const length = chars(value);
  const anchors = collectStoryAnchorStats(value);
  return {
    source,
    chars: length,
    present: length > 0,
    usedInPrompt,
    reusableAnchorCount: anchors.count,
    reusableAnchorKinds: anchors.kinds,
    note,
  };
}

export function buildMemoryContextAudit(input: AuditInput): MemoryContextAudit {
  const sources: MemoryContextAuditSourceReport[] = [
    sourceReport('previousChapter', input.previousChapterContext, true),
    sourceReport('chapterVector', input.chapterVectorContext, true),
    sourceReport('enhancedPreviousSummary', input.enhancedPreviousSummary, true),
    sourceReport('worldVector', input.worldVectorContext, true),
    sourceReport('characterVector', input.characterVectorContext, true),
    sourceReport('digestVector', input.digestVectorContext, true),
    sourceReport('arcVector', input.arcVectorContext, true),
    sourceReport('factVector', input.factVectorContext, true),
    sourceReport('threadVector', input.threadVectorContext, true),
    sourceReport('characterStateVector', input.characterStateVectorContext, true),
    sourceReport('storyState', input.storyStateContext, true),
    {
      source: 'truthFiles',
      chars: chars(input.truthFilesContext),
      present: Boolean(input.truthFilesPresent) || chars(input.truthFilesContext) > 0,
      usedInPrompt: Boolean(input.truthFilesUsedInPrompt),
      reusableAnchorCount: collectStoryAnchorStats(input.truthFilesContext).count,
      reusableAnchorKinds: collectStoryAnchorStats(input.truthFilesContext).kinds,
      note: input.truthFilesPresent && !input.truthFilesUsedInPrompt
        ? 'persisted but not injected'
        : undefined,
      sections: input.truthFilesSections && input.truthFilesSections.length > 0
        ? [...input.truthFilesSections]
        : undefined,
    },
  ];

  const totalChars = sources.reduce((sum, item) => sum + item.chars, 0);
  const promptChars = sources
    .filter(item => item.usedInPrompt)
    .reduce((sum, item) => sum + item.chars, 0);
  const reusableAnchorCount = sources
    .filter(item => item.usedInPrompt)
    .reduce((sum, item) => sum + (item.reusableAnchorCount ?? 0), 0);
  const reusableAnchorDensity = promptChars > 0
    ? Math.round((reusableAnchorCount / promptChars) * 10000) / 10
    : 0;
  const unusedPersistedSources = sources
    .filter(item => item.present && !item.usedInPrompt)
    .map(item => item.source);
  const emptyPromptSources = sources
    .filter(item => item.usedInPrompt && !item.present)
    .map(item => item.source);

  const warnings: string[] = [];
  if (!chars(input.previousChapterContext) && !chars(input.chapterVectorContext)) {
    warnings.push('previous context is empty');
  }
  if (input.truthFilesPresent && !input.truthFilesUsedInPrompt) {
    warnings.push('truth files exist but are not used in prompt');
  }
  if (chars(input.storyStateContext) && !input.truthFilesPresent) {
    warnings.push('story state context exists but truth files are absent before prompt');
  }
  if (input.truthFilesUsedInPrompt) {
    const truthSections = new Set(input.truthFilesSections ?? []);
    if (!truthSections.has('currentState')) {
      warnings.push('truth files injected without currentState section');
    }
    if (!truthSections.has('pendingHooks')) {
      warnings.push('truth files injected without pendingHooks section');
    }
    if (!truthSections.has('characterMatrix')) {
      warnings.push('truth files injected without characterMatrix section');
    }
  }
  if (!chars(input.factVectorContext)) {
    warnings.push('fact memory context is empty');
  }
  if (!chars(input.characterStateVectorContext)) {
    warnings.push('character state memory context is empty');
  }
  if (promptChars >= 2000 && reusableAnchorCount < 6) {
    warnings.push('memory context has low reusable story anchors');
  }

  return {
    mode: 'observe',
    retriever: input.retriever,
    totalChars,
    promptChars,
    reusableAnchorCount,
    reusableAnchorDensity,
    unusedPersistedSources,
    emptyPromptSources,
    warnings,
    sources,
  };
}

export function buildMemoryContextForwardHints(chapter: Chapter | null | undefined): string {
  const audit = chapter?.diagnostics?.memoryContextAudit;
  if (!audit) return '';
  if (audit.warnings.includes('memory audit pending until final generation result')) return '';

  const lowReusableAnchors = audit.warnings.includes('memory context has low reusable story anchors')
    || (audit.promptChars >= 2000 && (audit.reusableAnchorCount ?? 0) < 6);
  const missingCoreSources = audit.emptyPromptSources.filter(source =>
    source === 'factVector'
    || source === 'threadVector'
    || source === 'characterStateVector'
    || source === 'truthFiles',
  );
  const truthFilesUnused = audit.unusedPersistedSources.includes('truthFiles');
  const truthFilesMissingSections = audit.warnings.filter(warning =>
    warning.startsWith('truth files injected without '),
  );

  if (!lowReusableAnchors && missingCoreSources.length === 0 && !truthFilesUnused && truthFilesMissingSections.length === 0) {
    return '';
  }

  const lines = [
    `上一章记忆上下文审计提示（第 ${chapter.chapterNumber} 章）：`,
  ];
  if (lowReusableAnchors) {
    lines.push(`- 记忆上下文可复用故事锚点偏少（${audit.reusableAnchorCount ?? 0} 个，密度 ${audit.reusableAnchorDensity ?? 0}/万字）；下一章不能只承接气氛和流程，必须显式承接具名人物/组织/地点、规则限制、当前目标、未回收伏笔或关系状态。`);
  }
  if (missingCoreSources.length > 0) {
    lines.push(`- 以下记忆源在提示中为空：${missingCoreSources.join('、')}；下一章必须从已有正文和大纲中补足人物状态、事实因果和未回收压力，避免只靠上一章场面惯性推进。`);
  }
  if (truthFilesUnused) {
    lines.push('- 真相文件已存在但未注入提示；下一章必须主动核对当前状态、待回收钩子和角色矩阵，不能新增与既有设定冲突的规则或关系。');
  }
  if (truthFilesMissingSections.length > 0) {
    lines.push('- 真相文件注入不完整；下一章写作时优先保持当前状态、待回收钩子、角色关系三类信息一致。');
  }
  lines.push('- 本章读者侧交付优先：记忆补强要转化为可读的行动、选择、代价和章尾压力，不要写成设定清单。');
  return lines.join('\n');
}
