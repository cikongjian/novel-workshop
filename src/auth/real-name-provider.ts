import { getConfig } from '../config/index.js';
import {
  verifyRealNameWithHttpProvider,
} from './real-name-http-provider.js';
import {
  ALL_REAL_NAME_VERIFICATION_PROVIDERS,
  type RealNameHttpProviderConfig,
  type RealNameProviderPayload,
  type RealNameProviderResult,
  type RealNameVerificationProviderId,
} from './real-name-provider-types.js';
export {
  ALL_REAL_NAME_VERIFICATION_PROVIDERS,
  type RealNameProviderPayload,
  type RealNameProviderResult,
  type RealNameVerificationProviderId,
} from './real-name-provider-types.js';

interface RealNameVerificationProvider {
  verify(payload: RealNameProviderPayload): Promise<RealNameProviderResult>;
}

class BasicSubmissionProvider implements RealNameVerificationProvider {
  async verify(): Promise<RealNameProviderResult> {
    return {
      provider: 'basic_submission',
      passed: true,
      detail: '基础资料提交模式，未接入外部实名核验',
    };
  }
}

class MockIdentityProvider implements RealNameVerificationProvider {
  async verify(payload: RealNameProviderPayload): Promise<RealNameProviderResult> {
    const idTail = payload.idNumber.slice(-4);
    const phoneTail = payload.phoneNumber.slice(-4);
    const passed = idTail === phoneTail;

    return {
      provider: 'mock_identity',
      passed,
      detail: passed
        ? '模拟实名核验通过'
        : '模拟实名核验未通过：身份证后四位需与手机号后四位一致',
    };
  }
}

class HttpBridgeProvider implements RealNameVerificationProvider {
  constructor(private readonly override?: Partial<RealNameHttpProviderConfig>) {}

  async verify(payload: RealNameProviderPayload): Promise<RealNameProviderResult> {
    return verifyRealNameWithHttpProvider(payload, this.override);
  }
}

export function getRealNameVerificationProviderId(): RealNameVerificationProviderId {
  return getConfig().realNameVerification.provider;
}

export function getAllowedRealNameVerificationProviders(): RealNameVerificationProviderId[] {
  if (process.env.NODE_ENV === 'production') {
    return ['basic_submission', 'http_bridge'];
  }
  return [...ALL_REAL_NAME_VERIFICATION_PROVIDERS];
}

function createProvider(): RealNameVerificationProvider {
  const provider = getRealNameVerificationProviderId();
  return createProviderById(provider);
}

export function createProviderById(
  provider: RealNameVerificationProviderId,
  options?: { httpConfig?: Partial<RealNameHttpProviderConfig> },
): RealNameVerificationProvider {
  if (provider === 'http_bridge') {
    return new HttpBridgeProvider(options?.httpConfig);
  }
  if (provider === 'mock_identity') {
    return new MockIdentityProvider();
  }
  return new BasicSubmissionProvider();
}

export async function verifyRealNameWithProvider(
  payload: RealNameProviderPayload,
): Promise<RealNameProviderResult> {
  return createProvider().verify(payload);
}

export async function verifyRealNameWithSelectedProvider(
  provider: RealNameVerificationProviderId,
  payload: RealNameProviderPayload,
  options?: { httpConfig?: Partial<RealNameHttpProviderConfig> },
): Promise<RealNameProviderResult> {
  return createProviderById(provider, options).verify(payload);
}
