/**
 * 角色认知边界构建器（Character Knowledge Boundary Builder）
 *
 * 基于 CharacterEvent + ChapterFact + firstAppearance 构建角色的
 * "认知时间线"，用于约束角色聊天/信件/朋友圈时的回复范围——
 * 角色只知道自己亲历过的事件，不知道未出场章节的剧情，
 * 不知道其他角色的秘密，不知道未来会发生什么。
 *
 * 设计目标：
 * - 纯本地推理，无 LLM 调用
 * - 输出为 LLM prompt 可读的结构化文本
 * - 向后兼容：无事件数据时优雅降级
 * - 记忆衰减：越近的事件越详细，越远的越简略
 */

import type { CharacterEvent, ChapterFact, CharacterProfile } from './types.js';

/**
 * 角色认知范围
 */
export interface CharacterKnowledgeScope {
  /** 角色首次出场章节 */
  firstAppearance: number;
  /** 角色亲历过的章节数（有事件记录的） */
  experiencedChapters: number;
  /** 角色知道的角色ID列表（有过 interaction/relationship 事件的） */
  knownCharacterIds: string[];
  /** 角色去过的地点 */
  visitedLocations: string[];
  /** 角色认知边界的上限章节（角色只知道 ≤ 这个章节的事） */
  knowledgeUpToChapter: number;
}

/**
 * 构建角色认知范围（纯数据，不做 prompt 渲染）
 *
 * @param character 角色档案
 * @param events 该角色的事件列表（按章节升序）
 * @param facts  各章节的事实快照（用于提取地点）
 * @param latestFinalizedChapter 最新已定稿章节（认知上限）
 */
export function buildKnowledgeScope(
  character: CharacterProfile,
  events: CharacterEvent[],
  facts: Array<{ chapterNumber: number; fact: ChapterFact }>,
  latestFinalizedChapter: number,
): CharacterKnowledgeScope {
  const firstAppearance = character.firstAppearance ?? events[0]?.chapterNumber ?? 1;

  const experiencedChapters = new Set<number>();
  const knownCharacterIds = new Set<string>();
  const visitedLocations = new Set<string>();

  for (const event of events) {
    if (event.chapterNumber > latestFinalizedChapter) continue;
    experiencedChapters.add(event.chapterNumber);
    for (const otherId of event.relatedCharacterIds) {
      if (otherId !== character.id) {
        knownCharacterIds.add(otherId);
      }
    }
  }

  // 从章节事实中提取角色去过的地点
  for (const { chapterNumber, fact } of facts) {
    if (chapterNumber > latestFinalizedChapter) continue;
    if (chapterNumber < firstAppearance) continue;
    const pos = fact.characterPositions?.find(
      p => p.characterId === character.id,
    );
    if (pos?.location) {
      visitedLocations.add(pos.location);
    }
    // 如果角色在该章有事件，默认他知道该章出现的地点
    if (experiencedChapters.has(chapterNumber)) {
      for (const loc of fact.locations ?? []) {
        visitedLocations.add(loc);
      }
    }
  }

  return {
    firstAppearance,
    experiencedChapters: experiencedChapters.size,
    knownCharacterIds: Array.from(knownCharacterIds),
    visitedLocations: Array.from(visitedLocations),
    knowledgeUpToChapter: latestFinalizedChapter,
  };
}

// ─── Prompt 渲染 ──────────────────────────────────────────────────────

/**
 * 把角色认知边界渲染为 LLM prompt 可读的文本。
 *
 * 输出格式：
 * - 第 X 章才出场，在此之前的事你不知道
 * - 你亲历过 X 个章节的事件
 * - 你认识的人：XX、YY
 * - 你去过的地方：AA、BB
 * - 你不知道的事：第X章之后的剧情、你没出场的章节、其他角色的秘密
 *
 * 记忆衰减策略：
 * - 最近 3 章：列出所有事件（高细节）
 * - 3-10 章：按类型聚合（中细节）
 * - 10 章以上：只列重大发现/成就（低细节，importance≥4）
 */
export function renderKnowledgeBoundaryPrompt(params: {
  character: CharacterProfile;
  events: CharacterEvent[];
  scope: CharacterKnowledgeScope;
  /** 是否输出详细事件记忆（聊天用详细，朋友圈可简略） */
  detailLevel?: 'full' | 'summary' | 'brief';
}): string {
  const { character, events, scope } = params;
  const detail = params.detailLevel ?? 'full';

  if (detail === 'brief') {
    return renderBriefBoundary(character, scope);
  }

  if (detail === 'summary') {
    return renderSummaryBoundary(character, events, scope);
  }

  return renderFullBoundary(character, events, scope);
}

function renderBriefBoundary(
  character: CharacterProfile,
  scope: CharacterKnowledgeScope,
): string {
  const lines: string[] = [];
  lines.push(`【认知边界】你是「${character.name}」，你只知道自己亲历过的事。`);
  lines.push(`- 你在第 ${scope.firstAppearance} 章出场，此前的剧情你不知道`);
  lines.push(`- 你最多只知道第 ${scope.knowledgeUpToChapter} 章为止的事（未来的剧情你不可能知道）`);
  if (scope.knownCharacterIds.length > 0) {
    lines.push(`- 你认识 ${scope.knownCharacterIds.length} 个角色`);
  }
  return lines.join('\n');
}

function renderSummaryBoundary(
  character: CharacterProfile,
  events: CharacterEvent[],
  scope: CharacterKnowledgeScope,
): string {
  const lines: string[] = [];
  lines.push('【认知边界】你是「' + character.name + '」，严格遵守以下认知限制：');
  lines.push('');
  lines.push(`1. 你在第 ${scope.firstAppearance} 章才出场，之前的剧情你不知道`);
  lines.push(`2. 你最多只知道第 ${scope.knowledgeUpToChapter} 章为止的已发生剧情，未来的事你绝不可能知道`);
  lines.push(`3. 你亲历过 ${scope.experiencedChapters} 个章节的事件，没出场的章节你不知道详细内容`);
  if (scope.visitedLocations.length > 0) {
    lines.push(`4. 你去过的地方：${scope.visitedLocations.slice(0, 8).join('、')}${scope.visitedLocations.length > 8 ? '等' : ''}`);
  }

  // 聚合事件类型统计
  const typeCount: Record<string, number> = {};
  for (const e of events) {
    typeCount[e.type] = (typeCount[e.type] || 0) + 1;
  }
  const typeLabels: Record<string, string> = {
    action: '行动',
    encounter: '遭遇',
    relationship: '关系变化',
    revelation: '发现/认知',
    achievement: '成就',
    loss: '失去',
  };
  const typeSummary = Object.entries(typeCount)
    .map(([t, c]) => `${typeLabels[t] ?? t}×${c}`)
    .join('、');
  if (typeSummary) {
    lines.push(`5. 你的经历类型：${typeSummary}`);
  }

  lines.push('');
  lines.push('⚠️ 绝对规则：');
  lines.push('- 如果读者问的事情你不知道，不要猜测，不要编造，用你的方式困惑、回避或反问');
  lines.push('- 不要透露任何你作为角色不可能知道的信息（上帝视角、作者设定、未来剧情）');
  lines.push('- 其他角色的秘密/真实身份/隐藏动机，除非你亲历了揭示过程，否则你不知道');

  return lines.join('\n');
}

function renderFullBoundary(
  character: CharacterProfile,
  events: CharacterEvent[],
  scope: CharacterKnowledgeScope,
): string {
  const lines: string[] = [];
  lines.push('【认知边界·完整】你是「' + character.name + '」，你只知道自己亲历过的事情。');
  lines.push('');
  lines.push(`▶ 你在第 ${scope.firstAppearance} 章出场，此前的剧情你完全不知道`);
  lines.push(`▶ 你的认知上限：第 ${scope.knowledgeUpToChapter} 章（之后的剧情你不可能知道）`);
  lines.push(`▶ 你亲历过 ${scope.experiencedChapters} 个章节的事件`);

  if (scope.visitedLocations.length > 0) {
    lines.push(`▶ 你去过的地方：${scope.visitedLocations.slice(0, 10).join('、')}${scope.visitedLocations.length > 10 ? '等' : ''}`);
  }

  // 最近事件（最近 3 章详细列）
  const recentChapters = scope.knowledgeUpToChapter;
  const recentEvents = events.filter(e => e.chapterNumber > recentChapters - 3 && e.chapterNumber <= recentChapters);
  if (recentEvents.length > 0) {
    lines.push('');
    lines.push('▶ 最近 3 章你亲历的事件（印象最深）：');
    const byChapter = new Map<number, CharacterEvent[]>();
    for (const e of recentEvents) {
      const list = byChapter.get(e.chapterNumber) ?? [];
      list.push(e);
      byChapter.set(e.chapterNumber, list);
    }
    const sorted = [...byChapter.entries()].sort((a, b) => b[0] - a[0]);
    for (const [ch, evts] of sorted) {
      lines.push(`  第 ${ch} 章：`);
      for (const e of evts.slice(0, 5)) {
        const typeLabel = getEventLabel(e.type);
        lines.push(`    - [${typeLabel}] ${e.summary}`);
      }
    }
  }

  // 更早的重大事件
  const earlierMajor = events
    .filter(e => e.chapterNumber <= recentChapters - 3 && e.importance >= 4)
    .slice(-8);
  if (earlierMajor.length > 0) {
    lines.push('');
    lines.push('▶ 更早的重大事件（你印象深刻）：');
    for (const e of earlierMajor) {
      const typeLabel = getEventLabel(e.type);
      lines.push(`  - 第${e.chapterNumber}章 [${typeLabel}] ${e.summary}`);
    }
  }

  lines.push('');
  lines.push('⚠️ 严格遵守以下规则，违反即为出戏：');
  lines.push('1. 不知道的事就说不知道，不要猜测、不要编造、不要从上帝视角回答');
  lines.push('2. 第 ' + scope.firstAppearance + ' 章之前的剧情你不可能知道（你还没出场）');
  lines.push('3. 第 ' + scope.knowledgeUpToChapter + ' 章之后的剧情你不可能知道（未来尚未发生）');
  lines.push('4. 其他角色的秘密、隐藏身份、内心想法，除非你亲历了揭示过程，否则你不知道');
  lines.push('5. 你没出场的章节，你只可能通过他人转述知道部分信息，不可能知道细节');
  lines.push('6. 如果读者问你不知道的事，用符合你性格的方式困惑、回避、转移话题或反问，不要暴露你是AI');

  return lines.join('\n');
}

function getEventLabel(type: string): string {
  const map: Record<string, string> = {
    action: '行动',
    encounter: '遭遇',
    relationship: '关系',
    revelation: '发现',
    achievement: '成就',
    loss: '失去',
  };
  return map[type] ?? type;
}

// ─── 认知过滤辅助 ──────────────────────────────────────────────────────

/**
 * 过滤章节摘要——只保留角色亲历过的章节摘要。
 * 用于替换原来"整段注入最新章节摘要"的做法。
 *
 * @returns 角色视角下的章节摘要（如果角色没出场则返回空）
 */
export function filterChapterSummaryForCharacter(
  character: CharacterProfile,
  chapterNumber: number,
  chapterTitle: string,
  chapterSummary: string,
  events: CharacterEvent[],
): string {
  const firstAppear = character.firstAppearance ?? 1;
  if (chapterNumber < firstAppear) {
    return ''; // 角色还没出场，完全不知道
  }

  const charEvents = events.filter(
    e => e.chapterNumber === chapterNumber && e.characterId === character.id,
  );

  if (charEvents.length === 0) {
    // 角色本章没出场，只说"本章你没有出场"而不是整段摘要
    return `第 ${chapterNumber} 章「${chapterTitle || ''}」：本章你没有出场，具体情况你不清楚`;
  }

  // 有事件 → 可以透露摘要（但标注"你亲历了本章"）
  return `第 ${chapterNumber} 章「${chapterTitle || ''}」（你亲历了本章）: ${chapterSummary}`;
}
