import { randomUUID } from 'node:crypto';
import type { ExtractedFacts } from './fact-graph-builder-types.js';
import type { FactEvent } from './fact-graph-types.js';

function stateConfidence(certainty: 'confirmed' | 'suspected' | 'rumored'): number {
  if (certainty === 'confirmed') return 0.92;
  if (certainty === 'suspected') return 0.68;
  return 0.42;
}

function itemConfidence(status: FactEvent['itemStatus']): number {
  switch (status) {
    case 'destroyed':
      return 0.84;
    case 'used':
    case 'obtained':
      return 0.76;
    case 'lost':
    case 'transferred':
      return 0.72;
    default:
      return 0.56;
  }
}

export function buildFactEvents(facts: ExtractedFacts): FactEvent[] {
  const events: FactEvent[] = [];

  for (const appearance of facts.characterAppearances) {
    events.push({
      id: randomUUID(),
      chapterNumber: appearance.chapterNumber,
      sentenceIndex: appearance.sentenceIndex,
      eventType: 'character-mention',
      entityType: 'character',
      entityName: appearance.characterName,
      detail: appearance.action || appearance.location || appearance.mentionType,
      evidence: appearance.evidence,
      confidence: appearance.confidence,
      relatedCharacterNames: [appearance.characterName],
      mentionType: appearance.mentionType,
      location: appearance.location,
      timeMarker: '',
      isFlashback: false,
    });
  }

  for (const item of facts.itemTimeline) {
    events.push({
      id: randomUUID(),
      chapterNumber: item.chapterNumber,
      sentenceIndex: 0,
      eventType: 'item-status',
      entityType: 'item',
      entityName: item.itemName,
      detail: item.detail,
      evidence: item.detail,
      confidence: itemConfidence(item.status),
      relatedCharacterNames: item.holderName ? [item.holderName] : [],
      itemStatus: item.status,
      location: '',
      timeMarker: '',
      isFlashback: false,
    });
  }

  for (const visit of facts.locationVisits) {
    events.push({
      id: randomUUID(),
      chapterNumber: visit.chapterNumber,
      sentenceIndex: 0,
      eventType: 'location-visit',
      entityType: 'location',
      entityName: visit.location,
      detail: `${visit.characterName}${visit.arrivalMethod ? `:${visit.arrivalMethod}` : ''}`,
      evidence: `${visit.characterName}${visit.arrivalMethod ? visit.arrivalMethod : '在'}${visit.location}`,
      confidence: visit.arrivalMethod ? 0.82 : 0.66,
      relatedCharacterNames: visit.characterName ? [visit.characterName] : [],
      location: visit.location,
      timeMarker: '',
      isFlashback: false,
    });
  }

  for (const timeline of facts.timelineEvents) {
    events.push({
      id: randomUUID(),
      chapterNumber: timeline.chapterNumber,
      sentenceIndex: timeline.sentenceIndex,
      eventType: 'timeline-marker',
      entityType: 'timeline',
      entityName: timeline.timeMarker || timeline.summary,
      detail: timeline.summary,
      evidence: timeline.evidence || timeline.summary,
      confidence: timeline.isFlashback ? 0.62 : 0.86,
      relatedCharacterNames: timeline.involvedCharacterNames,
      timeMarker: timeline.timeMarker,
      isFlashback: timeline.isFlashback,
      location: timeline.location,
    });
  }

  for (const state of facts.characterStateChanges) {
    events.push({
      id: randomUUID(),
      chapterNumber: state.chapterNumber,
      sentenceIndex: state.sentenceIndex,
      eventType: 'state-change',
      entityType: 'character',
      entityName: state.characterName,
      detail: `${state.newState}:${state.detail}`,
      evidence: state.evidence || state.detail,
      confidence: stateConfidence(state.certainty),
      relatedCharacterNames: [state.characterName],
      state: state.newState,
      location: '',
      timeMarker: '',
      isFlashback: state.sourceType === 'memory' || state.sourceType === 'dream',
    });
  }

  return events.sort((a, b) => {
    if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
    return a.sentenceIndex - b.sentenceIndex;
  });
}
