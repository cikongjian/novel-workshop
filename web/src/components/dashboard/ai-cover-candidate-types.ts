import type { CoverTextOverlayStyle } from '../../utils/cover-text-overlay';
import type { CoverLayoutTemplate } from '../../utils/cover-text-overlay';

export type CoverPreset = {
  key: CoverTextOverlayStyle;
  label: string;
  promptSuffix: string;
  hint: string;
};

export type CoverCandidate = {
  id: string;
  preset: CoverPreset;
  template: CoverLayoutTemplate;
  previewUrl: string;
  file: File;
  requestedSize: string;
  actualSize: string;
  usedFallbackSize: boolean;
  basePositivePrompt: string;
  positivePrompt: string;
  negativePrompt: string;
  pinnedAt?: number | null;
};
