/**
 * Fact graph auditor.
 *
 * Detects contradictions against a prefix graph built from earlier chapters only.
 * The detector prefers explicit state changes and on-stage mentions, and keeps
 * sentence-level evidence so the UI can be reviewed by a human quickly.
 */
import { randomUUID } from 'node:crypto';
import type { Contradiction, ContradictionEvidence, FactGraph } from '../novel/fact-graph-types.js';
import type { ExtractedFacts } from '../novel/fact-graph-builder.js';

const COMBAT_ACTIONS = /战斗|厮杀|出手|攻击|挥剑|施法|对决|交手|搏斗/;
const TRAVEL_ACTIONS = /赶路|奔行|飞行|疾驰|跋涉|远行|启程|出发|赶往|动身/;
const RESOLVING_STATES = new Set(['alive', 'healed'] as const);
/** 抽象/非物理性"地点"，不应参与瞬移检测 */
const ABSTRACT_LOCATIONS = /^(虚空|虚无|空中|半空|天空|脑海|梦境|意识|心中|记忆|回忆|幻境|冥想)$/;

function isActiveMentionType(mentionType: ExtractedFacts['characterAppearances'][number]['mentionType']): boolean {
  return mentionType === 'onstage' || mentionType === 'dialogue';
}

export function detectContradictions(
  graph: FactGraph,
  newFacts: ExtractedFacts,
  chapterNumber: number,
): Contradiction[] {
  return [
    ...detectCharacterResurrection(graph, newFacts, chapterNumber),
    ...detectItemReuseAfterDestroy(graph, newFacts, chapterNumber),
    ...detectLocationTeleport(graph, newFacts, chapterNumber),
    ...detectTimelineRegression(graph, newFacts, chapterNumber),
    ...detectStateContradiction(graph, newFacts, chapterNumber),
  ];
}

function createContradiction(params: {
  type: Contradiction['type'];
  severity: Contradiction['severity'];
  chapterNumbers: number[];
  description: string;
  evidence: string[];
  evidenceDetails: ContradictionEvidence[];
  suggestion: string;
  confidence: number;
  entityName?: string;
  anchorChapterNumber?: number;
}): Contradiction {
  return {
    id: randomUUID(),
    type: params.type,
    severity: params.severity,
    chapterNumbers: [...new Set(params.chapterNumbers)].sort((a, b) => a - b),
    description: params.description,
    evidence: params.evidence,
    evidenceDetails: params.evidenceDetails,
    suggestion: params.suggestion,
    resolved: false,
    confidence: Math.max(0, Math.min(1, params.confidence)),
    entityName: params.entityName ?? '',
    anchorChapterNumber: params.anchorChapterNumber,
  };
}

function latestPriorState(graph: FactGraph, characterName: string) {
  return graph.characterStateChanges
    .filter(change => change.characterName === characterName)
    .sort((a, b) => b.chapterNumber - a.chapterNumber || b.sentenceIndex - a.sentenceIndex)[0];
}

function hasResolutionAfter(graph: FactGraph, characterName: string, afterChapter: number): boolean {
  return graph.characterStateChanges.some(change => (
    change.characterName === characterName
    && change.chapterNumber > afterChapter
    && RESOLVING_STATES.has(change.newState as 'alive' | 'healed')
    && change.certainty !== 'rumored'
  ));
}

function detectCharacterResurrection(
  graph: FactGraph,
  newFacts: ExtractedFacts,
  chapterNumber: number,
): Contradiction[] {
  const results: Contradiction[] = [];

  for (const appearance of newFacts.characterAppearances) {
    if (!isActiveMentionType(appearance.mentionType)) continue;

    const lastState = latestPriorState(graph, appearance.characterName);
    if (!lastState) continue;
    if (lastState.newState !== 'dead' || lastState.certainty !== 'confirmed') continue;
    if (hasResolutionAfter(graph, appearance.characterName, lastState.chapterNumber)) continue;

    const severity = appearance.confidence >= 0.88 ? 'critical' : 'warning';
    results.push(createContradiction({
      type: 'character-resurrection',
      severity,
      chapterNumbers: [lastState.chapterNumber, chapterNumber],
      description: `角色「${appearance.characterName}」在第${lastState.chapterNumber}章已明确死亡，但在第${chapterNumber}章再次以在场形态出现`,
      evidence: [
        `死亡证据：${lastState.detail}`,
        `再次出现：${appearance.evidence}`,
      ],
      evidenceDetails: [
        {
          chapterNumber: lastState.chapterNumber,
          label: '死亡记录',
          text: lastState.evidence || lastState.detail,
          sourceType: 'state-change',
        },
        {
          chapterNumber,
          label: '在场出现',
          text: appearance.evidence,
          sourceType: 'appearance',
        },
      ],
      suggestion: `请确认「${appearance.characterName}」是否假死、被救活，或将当前段落改为回忆/提及而非在场出场`,
      confidence: 0.72 + appearance.confidence * 0.2,
      entityName: appearance.characterName,
      anchorChapterNumber: lastState.chapterNumber,
    }));
  }

  return results;
}

function detectItemReuseAfterDestroy(
  graph: FactGraph,
  newFacts: ExtractedFacts,
  chapterNumber: number,
): Contradiction[] {
  const results: Contradiction[] = [];

  for (const newItem of newFacts.itemTimeline) {
    if (newItem.status !== 'used' && newItem.status !== 'obtained') continue;

    const itemHistory = graph.itemTimeline
      .filter(item => item.itemName === newItem.itemName)
      .sort((a, b) => b.chapterNumber - a.chapterNumber);
    const lastStatus = itemHistory[0];
    if (!lastStatus || lastStatus.status !== 'destroyed') continue;

    results.push(createContradiction({
      type: 'item-reuse-after-destroy',
      severity: newItem.status === 'used' ? 'critical' : 'warning',
      chapterNumbers: [lastStatus.chapterNumber, chapterNumber],
      description: `物品「${newItem.itemName}」在第${lastStatus.chapterNumber}章已被毁坏，但在第${chapterNumber}章再次${newItem.status === 'used' ? '使用' : '取得'}`,
      evidence: [
        `销毁证据：${lastStatus.detail}`,
        `当前记录：${newItem.detail}`,
      ],
      evidenceDetails: [
        {
          chapterNumber: lastStatus.chapterNumber,
          label: '销毁记录',
          text: lastStatus.detail,
          sourceType: 'state-change',
        },
        {
          chapterNumber,
          label: '复用记录',
          text: newItem.detail,
          sourceType: 'appearance',
        },
      ],
      suggestion: `请补充修复、替代品来源，或避免沿用同名物品造成误判`,
      confidence: newItem.status === 'used' ? 0.86 : 0.64,
      entityName: newItem.itemName,
      anchorChapterNumber: lastStatus.chapterNumber,
    }));
  }

  return results;
}

function detectLocationTeleport(
  graph: FactGraph,
  newFacts: ExtractedFacts,
  chapterNumber: number,
): Contradiction[] {
  const results: Contradiction[] = [];

  // 按角色聚合本章地点，只检测同一章内出现在多个不同地点的情况
  // 跨章换地点是正常叙事推进，不应报警
  const characterLocations = new Map<string, Array<{ location: string; evidence: string }>>();
  for (const visit of newFacts.locationVisits) {
    if (!visit.characterName) continue;
    // 过滤抽象/非物理性地点（如"虚空""脑海"等修饰性描写）
    if (ABSTRACT_LOCATIONS.test(visit.location)) continue;

    const relatedAppearance = newFacts.characterAppearances.find(appearance => (
      appearance.characterName === visit.characterName
      && isActiveMentionType(appearance.mentionType)
    ));
    if (!relatedAppearance) continue;

    const existing = characterLocations.get(visit.characterName) ?? [];
    // 跳过已有同名地点
    if (!existing.some(entry => entry.location === visit.location)) {
      // 跳过证据文本完全相同的条目（同一句话被提取出多个"地点"）
      if (!existing.some(entry => entry.evidence === relatedAppearance.evidence)) {
        existing.push({ location: visit.location, evidence: relatedAppearance.evidence });
      }
    }
    characterLocations.set(visit.characterName, existing);
  }

  for (const [characterName, locations] of characterLocations) {
    if (locations.length < 2) continue;
    // 同一章内出现在 2 个以上不同地点，且没有 arrivalMethod 衔接
    const hasArrival = newFacts.locationVisits.some(v =>
      v.characterName === characterName && v.arrivalMethod,
    );
    if (hasArrival) continue;

    results.push(createContradiction({
      type: 'location-teleport',
      severity: 'warning',
      chapterNumbers: [chapterNumber],
      description: `角色「${characterName}」在第${chapterNumber}章同时出现在多个地点（${locations.map(l => `「${l.location}」`).join('、')}），缺少移动描写`,
      evidence: locations.map(l => `地点：${l.location}`),
      evidenceDetails: locations.map(l => ({
        chapterNumber,
        label: l.location,
        text: l.evidence,
        sourceType: 'appearance' as const,
      })),
      suggestion: '若有场景转换，请补充移动/转场描写；若为闪回或远程视角，请明确标注',
      confidence: 0.72,
      entityName: characterName,
      anchorChapterNumber: chapterNumber,
    }));
  }

  return results;
}

function detectTimelineRegression(
  graph: FactGraph,
  newFacts: ExtractedFacts,
  chapterNumber: number,
): Contradiction[] {
  const results: Contradiction[] = [];
  const existingEvents = graph.timelineEvents
    .filter(event => event.dayNumber !== undefined && !event.isFlashback)
    .sort((a, b) => (b.dayNumber ?? 0) - (a.dayNumber ?? 0));

  if (existingEvents.length === 0) return results;
  const latestDayEvent = existingEvents[0];

  for (const event of newFacts.timelineEvents) {
    if (event.dayNumber === undefined || event.isFlashback) continue;
    if (event.dayNumber >= (latestDayEvent.dayNumber ?? 0)) continue;

    results.push(createContradiction({
      type: 'timeline-regression',
      severity: 'warning',
      chapterNumbers: [latestDayEvent.chapterNumber, chapterNumber],
      description: `第${chapterNumber}章的显式时间「${event.timeMarker}」早于此前最新的第${latestDayEvent.dayNumber}天，存在时间线倒退风险`,
      evidence: [
        `此前最新时间：${latestDayEvent.timeMarker}（第${latestDayEvent.chapterNumber}章）`,
        `当前时间：${event.timeMarker}（第${chapterNumber}章）`,
      ],
      evidenceDetails: [
        {
          chapterNumber: latestDayEvent.chapterNumber,
          label: '此前时间',
          text: latestDayEvent.evidence || latestDayEvent.summary,
          sourceType: 'timeline-event',
        },
        {
          chapterNumber,
          label: '当前时间',
          text: event.evidence || event.summary,
          sourceType: 'timeline-event',
        },
      ],
      suggestion: '如果这是回忆或插叙，请明确标识；否则请统一显式日期',
      confidence: 0.68,
      anchorChapterNumber: latestDayEvent.chapterNumber,
    }));
  }

  return results;
}

function detectStateContradiction(
  graph: FactGraph,
  newFacts: ExtractedFacts,
  chapterNumber: number,
): Contradiction[] {
  const results: Contradiction[] = [];

  for (const appearance of newFacts.characterAppearances) {
    if (!isActiveMentionType(appearance.mentionType)) continue;

    const actionText = appearance.action || appearance.evidence;
    const isCombat = COMBAT_ACTIONS.test(actionText);
    const isTravel = TRAVEL_ACTIONS.test(actionText);
    if (!isCombat && !isTravel) continue;

    const lastState = latestPriorState(graph, appearance.characterName);
    if (!lastState) continue;
    if (!['injured', 'imprisoned'].includes(lastState.newState)) continue;
    if (lastState.certainty === 'rumored') continue;
    if (hasResolutionAfter(graph, appearance.characterName, lastState.chapterNumber)) continue;

    const stateLabel = lastState.newState === 'injured' ? '受伤' : '被囚禁';
    const actionLabel = isCombat ? '战斗' : '远距离行动';
    results.push(createContradiction({
      type: 'state-contradiction',
      severity: 'warning',
      chapterNumbers: [lastState.chapterNumber, chapterNumber],
      description: `角色「${appearance.characterName}」在第${lastState.chapterNumber}章仍为${stateLabel}状态，但第${chapterNumber}章直接进行${actionLabel}`,
      evidence: [
        `状态记录：${lastState.detail}`,
        `当前表现：${appearance.evidence}`,
      ],
      evidenceDetails: [
        {
          chapterNumber: lastState.chapterNumber,
          label: '状态记录',
          text: lastState.evidence || lastState.detail,
          sourceType: 'state-change',
        },
        {
          chapterNumber,
          label: '当前行为',
          text: appearance.evidence,
          sourceType: 'appearance',
        },
      ],
      suggestion: `请补足「${appearance.characterName}」${lastState.newState === 'injured' ? '恢复' : '脱困'}的过渡`,
      confidence: 0.66,
      entityName: appearance.characterName,
      anchorChapterNumber: lastState.chapterNumber,
    }));
  }

  return results;
}
