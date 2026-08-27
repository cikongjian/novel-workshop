import type { TruthFileBundle } from '../memory/truth-files/index.js';

export type TruthContextPreviewResult = {
  enabled: boolean;
  text: string;
  chars: number;
  sections: string[];
};

const DEFAULT_MAX_CHARS = 1800;
const MAX_CHARACTERS = 5;
const MAX_ITEMS_PER_CHARACTER = 3;
const MAX_CONSTRAINTS = 6;
const MAX_HOOKS = 5;
const MAX_RELATIONS = 5;

function oneLine(value: unknown, maxChars = 160): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}...`;
}

function pushLine(lines: string[], label: string, value: unknown, maxChars?: number): void {
  const rendered = oneLine(value, maxChars);
  if (rendered) lines.push(`${label}: ${rendered}`);
}

function trimToBudget(text: string, maxChars: number): string {
  const normalizedBudget = Math.max(200, maxChars);
  if (text.length <= normalizedBudget) return text;
  return `${text.slice(0, normalizedBudget - 24).trimEnd()}\n[trimmed for budget]`;
}

export function isTruthContextPreviewEnabled(env = process.env): boolean {
  const raw = env.ENABLE_TRUTH_CONTEXT_PREVIEW?.trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw ?? '');
}

export function buildTruthContextPreview(params: {
  bundle: TruthFileBundle;
  currentChapter: number;
  enabled?: boolean;
  maxChars?: number;
}): TruthContextPreviewResult {
  const enabled = params.enabled ?? isTruthContextPreviewEnabled();
  if (!enabled) {
    return { enabled: false, text: '', chars: 0, sections: [] };
  }

  const { bundle, currentChapter } = params;
  const sections: Array<{ key: string; lines: string[] }> = [];

  if (bundle.currentState && Math.abs(bundle.currentState.chapterNumber - currentChapter) <= 2) {
    const lines: string[] = [
      `[Truth current-state after chapter ${bundle.currentState.chapterNumber}]`,
    ];
    pushLine(lines, 'Timeline', bundle.currentState.world.timelineMarker, 140);
    pushLine(lines, 'Environment', bundle.currentState.world.environment, 140);

    const activeCharacters = bundle.currentState.characters
      .filter(character => character.alive && character.present)
      .slice(0, MAX_CHARACTERS);
    if (activeCharacters.length > 0) {
      lines.push('Characters:');
      for (const character of activeCharacters) {
        const parts = [character.name];
        const location = oneLine(character.location, 80);
        const emotion = oneLine(character.emotionalState, 90);
        const condition = oneLine(character.physicalCondition, 70);
        const goal = oneLine(character.goal, 90);
        if (location) parts.push(`at ${location}`);
        if (emotion) parts.push(`emotion ${emotion}`);
        if (condition) parts.push(`condition ${condition}`);
        if (goal) parts.push(`goal ${goal}`);
        if (character.keyItems.length > 0) {
          parts.push(`items ${character.keyItems.slice(0, MAX_ITEMS_PER_CHARACTER).map(item => oneLine(item, 40)).filter(Boolean).join(' / ')}`);
        }
        lines.push(`- ${parts.join(' | ')}`);
      }
    }

    const constraints = bundle.currentState.nextChapterConstraints
      .map(item => oneLine(item, 150))
      .filter(Boolean)
      .slice(0, MAX_CONSTRAINTS);
    if (constraints.length > 0) {
      lines.push('Must respect next:');
      lines.push(...constraints.map(item => `- ${item}`));
    }

    sections.push({ key: 'currentState', lines });
  }

  if (bundle.pendingHooks && bundle.pendingHooks.hooks.length > 0) {
    const hooks = bundle.pendingHooks.hooks.slice(0, MAX_HOOKS);
    const lines = [
      `[Truth pending hooks at chapter ${bundle.pendingHooks.currentChapter}]`,
      ...hooks.map(hook => `- ${hook.urgency} ch${hook.plantedInChapter}: ${oneLine(hook.hint, 150)}`),
    ];
    sections.push({ key: 'pendingHooks', lines });
  }

  if (bundle.characterMatrix) {
    const lines: string[] = ['[Truth character knowledge boundaries]'];
    for (const entry of bundle.characterMatrix.revealedSecrets.slice(0, MAX_RELATIONS)) {
      const secrets = entry.secrets.map(item => oneLine(item, 80)).filter(Boolean).slice(0, 2);
      if (secrets.length > 0) lines.push(`- ${entry.characterName} revealed: ${secrets.join(' / ')}`);
    }
    for (const edge of bundle.characterMatrix.infoEdges.slice(0, MAX_RELATIONS)) {
      const shared = edge.sharedKnowledge.map(item => oneLine(item, 60)).filter(Boolean).slice(0, 2);
      const asymmetric = edge.asymmetricKnowledge.map(item => oneLine(item, 60)).filter(Boolean).slice(0, 2);
      if (shared.length > 0 || asymmetric.length > 0) {
        lines.push(`- ${edge.from} -> ${edge.to}: shared ${shared.join(' / ') || 'none'}; hidden ${asymmetric.join(' / ') || 'none'}`);
      }
    }
    if (lines.length > 1) {
      sections.push({ key: 'characterMatrix', lines });
    }
  }

  const text = trimToBudget(
    sections.map(section => section.lines.join('\n')).join('\n\n'),
    params.maxChars ?? DEFAULT_MAX_CHARS,
  );

  return {
    enabled: true,
    text,
    chars: text.length,
    sections: sections.map(section => section.key),
  };
}
