import type { RoleAttireEntry } from './portrait-role-attire-index.js';
import type { PortraitVisualStyleKey } from './portrait-visual-style.js';
import type { PortraitFormatKey } from './portrait-format.js';

export type PortraitEraKey =
  | 'cn-imperial'
  | 'cn-fantasy'
  | 'modern-urban'
  | 'sci-fi'
  | 'western-medieval'
  | 'western-antiquity'
  | 'ancient-myth'
  | 'japanese-feudal'
  | 'post-apocalyptic'
  | 'generic-novel';

export type PortraitStyleOverrides = {
  eraKey?: PortraitEraKey;
  roleAttireId?: string;
  visualStyleKey?: PortraitVisualStyleKey;
  formatKey?: PortraitFormatKey;
};

export type PortraitStyleOptions = {
  eraOptions: Array<{
    key: PortraitEraKey;
    label: string;
  }>;
  roleAttireOptions: Array<{
    id: string;
    label: string;
    category: string;
  }>;
  visualStyleOptions: Array<{
    key: PortraitVisualStyleKey;
    label: string;
    summary: string;
  }>;
  formatOptions: Array<{
    key: PortraitFormatKey;
    label: string;
    summary: string;
  }>;
};

export const ERA_SIGNAL_HINTS: Record<PortraitEraKey, string> = {
  'cn-imperial': 'imperial dynasty court hanfu official royal',
  'cn-fantasy': 'xianxia cultivation sect daoist jianghu',
  'modern-urban': 'modern urban office campus profession',
  'sci-fi': 'science fiction cyberpunk future space federation',
  'western-medieval': 'medieval european knight lord castle gothic renaissance',
  'western-antiquity': 'ancient greek roman egyptian classical antiquity toga laurel',
  'ancient-myth': 'primordial mythic ancient tribal shamanic prehistoric deity',
  'japanese-feudal': 'edo sengoku samurai daimyo ronin kimono shogunate',
  'post-apocalyptic': 'post apocalyptic wasteland survival ruins fallout',
  'generic-novel': 'novel role visual design',
};

export function buildRoleAttireSignal(signal: string, eraKey?: PortraitEraKey): string {
  if (!eraKey) return signal;
  const hint = ERA_SIGNAL_HINTS[eraKey];
  if (!hint) return signal;
  return `${signal} ${hint}`;
}

export function findRoleAttireEntryById(
  roleAttireIndex: RoleAttireEntry[],
  roleAttireId?: string,
) {
  if (!roleAttireId) return null;
  return roleAttireIndex.find(entry => entry.id === roleAttireId) ?? null;
}
