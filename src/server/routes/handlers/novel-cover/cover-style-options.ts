import {
  COVER_ERA_RULES,
  COVER_FORMAT_RULES,
  COVER_MOOD_RULES,
  COVER_VISUAL_STYLE_RULES,
  type CoverEraKey,
  type CoverEraOption,
  type CoverFormatKey,
  type CoverFormatOption,
  type CoverMoodKey,
  type CoverMoodOption,
  type CoverStyleOption,
  type CoverVisualStyleKey,
  type CoverVisualStyleOption,
} from './cover-style-rules.js';

export type CoverStyleOverrides = {
  visualStyleKey?: CoverVisualStyleKey;
  formatKey?: CoverFormatKey;
  eraKey?: CoverEraKey;
  moodKey?: CoverMoodKey;
};

export type CoverStyleOptions = {
  visualStyleOptions: Array<CoverStyleOption & { key: CoverVisualStyleKey; summary: string }>;
  formatOptions: Array<CoverStyleOption & { key: CoverFormatKey; summary: string }>;
  eraOptions: Array<CoverStyleOption & { key: CoverEraKey }>;
  moodOptions: Array<CoverStyleOption & { key: CoverMoodKey }>;
};

export function getCoverStyleOptions(): CoverStyleOptions {
  return {
    visualStyleOptions: COVER_VISUAL_STYLE_RULES.map(rule => ({
      key: rule.key,
      label: rule.label,
      summary: rule.anchor,
    })),
    formatOptions: COVER_FORMAT_RULES.map(rule => ({
      key: rule.key,
      label: rule.label,
      summary: rule.anchor,
    })),
    eraOptions: COVER_ERA_RULES.map(rule => ({
      key: rule.key,
      label: rule.label,
    })),
    moodOptions: COVER_MOOD_RULES.map(rule => ({
      key: rule.key,
      label: rule.label,
    })),
  };
}

export function findCoverVisualStyle(key?: CoverVisualStyleKey): CoverVisualStyleOption | undefined {
  return COVER_VISUAL_STYLE_RULES.find(rule => rule.key === key);
}

export function findCoverFormat(key?: CoverFormatKey): CoverFormatOption | undefined {
  return COVER_FORMAT_RULES.find(rule => rule.key === key);
}

export function findCoverEra(key?: CoverEraKey): CoverEraOption | undefined {
  return COVER_ERA_RULES.find(rule => rule.key === key);
}

export function findCoverMood(key?: CoverMoodKey): CoverMoodOption | undefined {
  return COVER_MOOD_RULES.find(rule => rule.key === key);
}

export function normalizeCoverStyleOverrides(raw?: Record<string, unknown>): CoverStyleOverrides | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const result: CoverStyleOverrides = {};
  const typed = raw as Record<string, unknown>;

  if (typed.visualStyleKey && typeof typed.visualStyleKey === 'string' && findCoverVisualStyle(typed.visualStyleKey as CoverVisualStyleKey)) {
    result.visualStyleKey = typed.visualStyleKey as CoverVisualStyleKey;
  }
  if (typed.formatKey && typeof typed.formatKey === 'string' && findCoverFormat(typed.formatKey as CoverFormatKey)) {
    result.formatKey = typed.formatKey as CoverFormatKey;
  }
  if (typed.eraKey && typeof typed.eraKey === 'string' && findCoverEra(typed.eraKey as CoverEraKey)) {
    result.eraKey = typed.eraKey as CoverEraKey;
  }
  if (typed.moodKey && typeof typed.moodKey === 'string' && findCoverMood(typed.moodKey as CoverMoodKey)) {
    result.moodKey = typed.moodKey as CoverMoodKey;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
