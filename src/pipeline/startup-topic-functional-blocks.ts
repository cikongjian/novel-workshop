import type { ChapterPromiseCard } from './chapter-promise-card.js';
import {
  getTopicProfileById,
  getTopicProfilesByFocus,
  type TopicFunctionalBlockTemplate,
  type TopicProfile,
} from './topic-profiles.js';

type FunctionalBlockBlueprint = {
  title: string;
  summary: string;
  location: string;
  tension: number;
  notes?: string;
};

function buildAnchorHint(anchor: string | undefined): string {
  return anchor ? `重点参考节点：${anchor}。` : '';
}

function resolveCardTopicProfile(card: ChapterPromiseCard): TopicProfile | undefined {
  const fromIds = (card.topicIds ?? [])
    .map(id => getTopicProfileById(id))
    .find(profile => profile?.genreFocus === card.genreFocus);
  return fromIds ?? getTopicProfilesByFocus(card.genreFocus)[0];
}

function renderTopicBlockTemplate(
  template: TopicFunctionalBlockTemplate,
  anchors: string[],
  card: ChapterPromiseCard,
  index: number,
): FunctionalBlockBlueprint {
  const values: Record<string, string> = {
    anchor0: buildAnchorHint(anchors[0]),
    anchor1: buildAnchorHint(anchors[1]),
    anchor2: buildAnchorHint(anchors[2]),
    anchor: buildAnchorHint(anchors[index]),
    sceneLabel: card.requiredScene.label,
    payoffLabel: card.requiredPayoff.label,
    endingFocus: card.preferredEndingFocus[0] ?? '下一步结果',
  };
  const summary = template.summaryTemplate.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');
  return {
    title: template.title,
    summary: summary.trim(),
    location: template.location,
    tension: template.tension,
    notes: template.notes,
  };
}

export function buildTopicProfileBlocks(
  anchors: string[],
  card: ChapterPromiseCard,
  sceneCount: number,
): FunctionalBlockBlueprint[] | null {
  const profile = resolveCardTopicProfile(card);
  if (!profile?.startupBlocks?.length) return null;
  return profile.startupBlocks
    .slice(0, sceneCount)
    .map((template, index) => renderTopicBlockTemplate(template, anchors, card, index));
}
