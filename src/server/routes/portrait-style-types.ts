import type { PortraitEraKey, PortraitStyleOptions, PortraitStyleOverrides } from './portrait-style-shared.js';
import type { PortraitVisualStyleKey } from './portrait-visual-style.js';
import type { PortraitFormatKey } from './portrait-format.js';

export type { PortraitEraKey, PortraitStyleOptions, PortraitStyleOverrides };
export type { PortraitVisualStyleKey, PortraitFormatKey };

export type PortraitCultureProfile =
  | 'han-chinese'
  | 'east-asian'
  | 'western'
  | 'middle-eastern'
  | 'south-asian'
  | 'african'
  | 'latino'
  | 'unspecified';

export type PortraitLayerHit = {
  layer: 'era' | 'culture' | 'identity' | 'attire' | 'facial' | 'expression' | 'visualStyle' | 'format';
  key: string;
  summary: string;
};

export type PortraitStyleIndex = {
  cultureProfile: PortraitCultureProfile;
  culturePositive: string;
  cultureNegative: string[];
  identityKeywords: string;
  attireKeywords: string;
  facialKeywords: string;
  expressionKeywords: string;
  /** 视觉画风 */
  visualStyle: {
    key: PortraitVisualStyleKey;
    label: string;
    /** 正向提示词风格锚点（前置） */
    styleAnchor: string;
    /** 正向提示词风格锚点（后置） */
    tailAnchor: string;
    /** 画风专属负面提示词 */
    negativeKeywords: string[];
  };
  /** 立绘呈现形式 */
  format: {
    key: PortraitFormatKey;
    label: string;
    /** 正向提示词形式锚点 */
    formatAnchor: string;
    /** 形式专属负面提示词 */
    negativeKeywords: string[];
  };
  roleAttire: {
    id: string;
    label: string;
    category: string;
    matched: boolean;
    matchedKeywords: string[];
    score: number;
    priority: number;
    preferredEras: string[];
    resolutionReason: string;
    candidates: Array<{
      id: string;
      label: string;
      category: string;
      score: number;
      priority: number;
      eraMatched: boolean;
      matchedKeywords: string[];
    }>;
  };
  overrides: {
    eraManual: boolean;
    roleAttireManual: boolean;
    visualStyleManual: boolean;
    formatManual: boolean;
    eraKey?: PortraitEraKey;
    eraSummary?: string;
    roleAttireId?: string;
    roleAttireLabel?: string;
    visualStyleKey?: PortraitVisualStyleKey;
    visualStyleLabel?: string;
    formatKey?: PortraitFormatKey;
    formatLabel?: string;
  };
  layerHits: PortraitLayerHit[];
};
