export type RealNameVerificationProviderId = 'basic_submission' | 'mock_identity' | 'http_bridge';

export const ALL_REAL_NAME_VERIFICATION_PROVIDERS = [
  'basic_submission',
  'mock_identity',
  'http_bridge',
] as const satisfies readonly RealNameVerificationProviderId[];

export type RealNameProviderResult = {
  provider: RealNameVerificationProviderId;
  passed: boolean;
  detail: string;
};

export type RealNameProviderPayload = {
  realName: string;
  idNumber: string;
  phoneNumber: string;
};

export type RealNameHttpProviderConfig = {
  httpUrl: string;
  httpToken: string;
  httpTimeoutMs: number;
  httpHeaders: string;
};
