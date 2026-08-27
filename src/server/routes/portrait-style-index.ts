import type { CharacterProfile } from '../../novel/types.js';
import { getDefaultRoleAttireEntry, matchRoleAttireEntryWithIndex } from './portrait-role-attire-index.js';
import { getMergedRoleAttireEntries } from './portrait-role-attire-catalog.js';
import {
  buildPortraitStyleOptions,
  buildSignalText,
  deriveAttirePrompt,
  deriveExpressionPrompt,
  deriveFacialPrompt,
  inferCulture,
  pickIdentityRule,
  resolveEraRule,
} from './portrait-style-rules.js';
import { buildRoleAttireSignal, findRoleAttireEntryById } from './portrait-style-shared.js';
import type {
  PortraitEraKey,
  PortraitStyleIndex,
  PortraitStyleOptions,
  PortraitStyleOverrides,
} from './portrait-style-types.js';
import { getVisualStyleRule } from './portrait-visual-style.js';
import { getFormatRule } from './portrait-format.js';

export type {
  PortraitCultureProfile,
  PortraitEraKey,
  PortraitLayerHit,
  PortraitStyleIndex,
  PortraitStyleOptions,
  PortraitStyleOverrides,
} from './portrait-style-types.js';
export type { PortraitVisualStyleKey } from './portrait-visual-style.js';
export type { PortraitFormatKey } from './portrait-format.js';

export function getPortraitStyleOptions(): PortraitStyleOptions {
  const roleAttireIndex = getMergedRoleAttireEntries();
  return buildPortraitStyleOptions(
    roleAttireIndex.map(entry => ({
      id: entry.id,
      label: entry.label,
      category: entry.category,
    })),
  );
}

export function buildPortraitStyleIndex(
  char: CharacterProfile,
  overrides?: PortraitStyleOverrides,
): PortraitStyleIndex {
  const roleAttireIndex = getMergedRoleAttireEntries();
  const signal = buildSignalText(char);
  const eraSelection = resolveEraRule(signal, overrides?.eraKey);
  const eraRule = eraSelection.rule;
  const culture = inferCulture(signal, char);
  const identityRule = pickIdentityRule(signal);
  const roleAttireSignal = buildRoleAttireSignal(
    signal,
    eraSelection.manual ? (eraRule.key as PortraitEraKey) : undefined,
  );
  const roleAttire = matchRoleAttireEntryWithIndex(roleAttireSignal, roleAttireIndex);
  const manualRoleAttireEntry = findRoleAttireEntryById(roleAttireIndex, overrides?.roleAttireId);
  const defaultRoleAttire = getDefaultRoleAttireEntry();
  const expression = deriveExpressionPrompt(signal);

  // --- 视觉画风 ---
  const visualStyleOverride = overrides?.visualStyleKey;
  const visualStyleRule = getVisualStyleRule(visualStyleOverride ?? 'cinematic-realistic');
  const visualStyleManual = Boolean(visualStyleOverride);

  // --- 呈现形式 ---
  const formatOverride = overrides?.formatKey;
  const formatRule = getFormatRule(formatOverride ?? 'standard');
  const formatManual = Boolean(formatOverride);

  // --- 角色服饰 ---
  const roleAttireEntry = manualRoleAttireEntry ?? (roleAttire.matched ? roleAttire.entry : defaultRoleAttire);
  const roleAttireCandidates = manualRoleAttireEntry
    ? [
      {
        id: manualRoleAttireEntry.id,
        label: manualRoleAttireEntry.label,
        category: manualRoleAttireEntry.category,
        score: roleAttire.score + 999,
        priority: roleAttire.priority,
        eraMatched: true,
        matchedKeywords: [],
      },
      ...roleAttire.candidates.filter(candidate => candidate.id !== manualRoleAttireEntry.id),
    ].slice(0, 5)
    : roleAttire.candidates;
  const attirePrompt = manualRoleAttireEntry || roleAttire.matched
    ? [eraRule.prompt, roleAttireEntry.attirePrompt].join(', ')
    : [eraRule.prompt, deriveAttirePrompt(eraRule, identityRule)].join(', ');
  const roleResolutionReason = manualRoleAttireEntry
    ? `手动覆盖角色服饰词典：${manualRoleAttireEntry.label}`
    : roleAttire.resolutionReason;

  return {
    cultureProfile: culture.profile,
    culturePositive: culture.positive,
    cultureNegative: culture.negative,
    identityKeywords: [
      `identity title: ${char.position || 'N/A'}`,
      `story role: ${char.role}`,
      identityRule.prompt,
      roleAttireEntry.identityPrompt,
      char.socialIdentity?.socialClass ? `social class: ${char.socialIdentity.socialClass}` : '',
      char.socialIdentity?.faction ? `faction identity: ${char.socialIdentity.faction}` : '',
    ].filter(Boolean).join(', '),
    attireKeywords: attirePrompt,
    facialKeywords: deriveFacialPrompt(char, signal),
    expressionKeywords: expression.prompt,
    visualStyle: {
      key: visualStyleRule.key,
      label: visualStyleRule.label,
      styleAnchor: visualStyleRule.styleAnchor,
      tailAnchor: visualStyleRule.tailAnchor,
      negativeKeywords: visualStyleRule.negativeKeywords,
    },
    format: {
      key: formatRule.key,
      label: formatRule.label,
      formatAnchor: formatRule.formatAnchor,
      negativeKeywords: formatRule.negativeKeywords,
    },
    roleAttire: {
      id: roleAttireEntry.id,
      label: roleAttireEntry.label,
      category: roleAttireEntry.category,
      matched: manualRoleAttireEntry ? true : roleAttire.matched,
      matchedKeywords: manualRoleAttireEntry ? [] : roleAttire.matchedKeywords,
      score: roleAttire.score,
      priority: roleAttire.priority,
      preferredEras: roleAttire.preferredEras,
      resolutionReason: roleResolutionReason,
      candidates: roleAttireCandidates,
    },
    overrides: {
      eraManual: eraSelection.manual,
      roleAttireManual: Boolean(manualRoleAttireEntry),
      visualStyleManual,
      formatManual,
      eraKey: eraSelection.manual ? (eraRule.key as PortraitEraKey) : undefined,
      eraSummary: eraSelection.manual ? eraRule.summary : undefined,
      roleAttireId: manualRoleAttireEntry?.id,
      roleAttireLabel: manualRoleAttireEntry?.label,
      visualStyleKey: visualStyleOverride,
      visualStyleLabel: visualStyleManual ? visualStyleRule.label : undefined,
      formatKey: formatOverride,
      formatLabel: formatManual ? formatRule.label : undefined,
    },
    layerHits: [
      {
        layer: 'era',
        key: eraRule.key,
        summary: eraSelection.manual ? `${eraRule.summary}（手动覆盖）` : eraRule.summary,
      },
      { layer: 'culture', key: culture.profile, summary: culture.summary },
      { layer: 'identity', key: identityRule.key, summary: identityRule.summary },
      {
        layer: 'attire',
        key: roleAttireEntry.id,
        summary: manualRoleAttireEntry
          ? `服饰手动覆盖：${roleAttireEntry.label}`
          : roleAttire.matched
            ? `服饰命中词典：${roleAttireEntry.label}`
            : '服饰未命中词典，使用时代+身份推断',
      },
      { layer: 'facial', key: char.appearance?.trim() ? 'appearance-driven' : 'signal-inferred', summary: '面貌细节索引' },
      { layer: 'expression', key: expression.key, summary: expression.summary },
      {
        layer: 'visualStyle',
        key: visualStyleRule.key,
        summary: visualStyleManual ? `画风手动选择：${visualStyleRule.label}` : `画风默认：${visualStyleRule.label}`,
      },
      {
        layer: 'format',
        key: formatRule.key,
        summary: formatManual ? `呈现形式手动选择：${formatRule.label}` : `呈现形式默认：${formatRule.label}`,
      },
    ],
  };
}
