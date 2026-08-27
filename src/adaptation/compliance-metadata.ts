import type { AdaptationMode } from '../novel/types.js';

export type AigcComplianceMetadata = {
  enabled: true;
  label: string;
  provider: string;
  generatedAt: string;
};

export type RightsComplianceMetadata = {
  sourceNovelId: string;
  copyrightNotice: string;
  authorizingParty: string;
};

export type ShortDramaComplianceMetadata = {
  filingStatus: 'pending' | 'approved' | 'not-required';
  distributionQualification: 'pending' | 'approved';
  aiPerformerConsent: 'pending' | 'confirmed';
};

export type AdaptationComplianceMetadata = {
  aigc: AigcComplianceMetadata;
  rights: RightsComplianceMetadata;
  shortDrama?: ShortDramaComplianceMetadata;
};

type BuildComplianceInput = {
  novelId: string;
  mode: AdaptationMode;
  generatedAt: string;
};

export function buildDefaultComplianceMetadata(input: BuildComplianceInput): AdaptationComplianceMetadata {
  const base: AdaptationComplianceMetadata = {
    aigc: {
      enabled: true,
      label: 'AIGC生成内容，发布前请完成人工复核。',
      provider: `novel-workshop-${input.mode}-adapter`,
      generatedAt: input.generatedAt,
    },
    rights: {
      sourceNovelId: input.novelId,
      copyrightNotice: '本改编内容基于原小说自动生成，仅限版权方或被授权方在合规范围内使用。',
      authorizingParty: 'novel-owner',
    },
  };

  if (input.mode === 'short-drama') {
    base.shortDrama = {
      filingStatus: 'pending',
      distributionQualification: 'pending',
      aiPerformerConsent: 'pending',
    };
  }

  return base;
}
