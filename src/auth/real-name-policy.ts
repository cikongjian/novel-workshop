import { getConfig } from '../config/index.js';

export type RealNameScene = 'comment' | 'creatorApplication' | 'bookPublishing' | 'billing';

export type RealNamePolicy = {
  enabled: boolean;
  provider: 'basic_submission' | 'mock_identity' | 'http_bridge';
  requiredForComment: boolean;
  requiredForCreatorApplication: boolean;
  requiredForBookPublishing: boolean;
  requiredForBilling: boolean;
  maxFailedAttempts: number;
  cooldownMinutes: number;
};

export function getRealNamePolicy(): RealNamePolicy {
  const config = getConfig();
  return {
    enabled: config.realNameVerification.enabled,
    provider: config.realNameVerification.provider,
    requiredForComment: config.realNameVerification.requiredForComment,
    requiredForCreatorApplication: config.realNameVerification.requiredForCreatorApplication,
    requiredForBookPublishing: config.realNameVerification.requiredForBookPublishing,
    requiredForBilling: config.realNameVerification.requiredForBilling,
    maxFailedAttempts: config.realNameVerification.maxFailedAttempts,
    cooldownMinutes: config.realNameVerification.cooldownMinutes,
  };
}

export function isRealNameRequired(scene: RealNameScene): boolean {
  const policy = getRealNamePolicy();
  if (!policy.enabled) return false;

  switch (scene) {
    case 'comment':
      return policy.requiredForComment;
    case 'creatorApplication':
      return policy.requiredForCreatorApplication;
    case 'bookPublishing':
      return policy.requiredForBookPublishing;
    case 'billing':
      return policy.requiredForBilling;
    default:
      return false;
  }
}
