import { createPublicKey, createPrivateKey, type KeyObject } from 'node:crypto';

export type BillingPaymentChannel = 'alipay' | 'wechat';
export type BillingWechatMode = 'native' | 'h5';

export type BillingAlipayConfig = {
  enabled: boolean;
  appId: string;
  gatewayUrl: string;
  privateKey: string;
  alipayPublicKey: string;
};

export type BillingWechatConfig = {
  enabled: boolean;
  appId: string;
  mchId: string;
  gatewayUrl: string;
  merchantSerialNo: string;
  merchantPrivateKey: string;
  apiV3Key: string;
  platformPublicKey: string;
  platformSerialNo: string;
  h5AppName: string;
};

export type BillingPaymentConfig = {
  apiBaseUrl: string;
  frontendBaseUrl: string;
  orderExpireMinutes: number;
  qrCodeProvider: string;
  alipay: BillingAlipayConfig;
  wechat: BillingWechatConfig;
};

function normalizePem(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.includes('-----BEGIN')
    ? trimmed.replace(/\\n/g, '\n')
    : trimmed;
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

export function getBillingPaymentConfig(): BillingPaymentConfig {
  const apiBaseUrl = normalizeBaseUrl(process.env.BILLING_PAYMENT_API_BASE_URL ?? process.env.PUBLIC_API_BASE_URL);
  const frontendBaseUrl = normalizeBaseUrl(process.env.BILLING_PAYMENT_FRONTEND_BASE_URL ?? process.env.PUBLIC_WEB_BASE_URL);
  const orderExpireMinutesRaw = Number.parseInt(process.env.BILLING_PAYMENT_ORDER_EXPIRE_MINUTES ?? '30', 10);

  return {
    apiBaseUrl,
    frontendBaseUrl,
    orderExpireMinutes: Number.isFinite(orderExpireMinutesRaw) && orderExpireMinutesRaw > 0 ? orderExpireMinutesRaw : 30,
    qrCodeProvider: (process.env.BILLING_PAYMENT_QR_CODE_PROVIDER ?? '').trim(),
    alipay: {
      enabled: process.env.BILLING_ALIPAY_ENABLED === 'true',
      appId: (process.env.BILLING_ALIPAY_APP_ID ?? '').trim(),
      gatewayUrl: normalizeBaseUrl(process.env.BILLING_ALIPAY_GATEWAY_URL ?? 'https://openapi.alipay.com/gateway.do'),
      privateKey: normalizePem(process.env.BILLING_ALIPAY_PRIVATE_KEY ?? ''),
      alipayPublicKey: normalizePem(process.env.BILLING_ALIPAY_PUBLIC_KEY ?? ''),
    },
    wechat: {
      enabled: process.env.BILLING_WECHAT_ENABLED === 'true',
      appId: (process.env.BILLING_WECHAT_APP_ID ?? '').trim(),
      mchId: (process.env.BILLING_WECHAT_MCH_ID ?? '').trim(),
      gatewayUrl: normalizeBaseUrl(process.env.BILLING_WECHAT_GATEWAY_URL ?? 'https://api.mch.weixin.qq.com'),
      merchantSerialNo: (process.env.BILLING_WECHAT_MERCHANT_SERIAL_NO ?? '').trim(),
      merchantPrivateKey: normalizePem(process.env.BILLING_WECHAT_MERCHANT_PRIVATE_KEY ?? ''),
      apiV3Key: (process.env.BILLING_WECHAT_API_V3_KEY ?? '').trim(),
      platformPublicKey: normalizePem(process.env.BILLING_WECHAT_PLATFORM_PUBLIC_KEY ?? ''),
      platformSerialNo: (process.env.BILLING_WECHAT_PLATFORM_SERIAL_NO ?? '').trim(),
      h5AppName: (process.env.BILLING_WECHAT_H5_APP_NAME ?? 'Novel Workshop').trim() || 'Novel Workshop',
    },
  };
}

export function buildBillingCallbackUrl(config: BillingPaymentConfig, channel: BillingPaymentChannel): string {
  if (!config.apiBaseUrl) {
    throw new Error('BILLING_PAYMENT_API_BASE_URL is required for payment callbacks');
  }
  return `${config.apiBaseUrl}/api/billing/payments/callback/${channel}`;
}

export function buildBillingReturnUrl(config: BillingPaymentConfig, orderId: string): string {
  if (!config.frontendBaseUrl) {
    throw new Error('BILLING_PAYMENT_FRONTEND_BASE_URL is required for payment return');
  }
  return `${config.frontendBaseUrl}/billing?topupOrder=${encodeURIComponent(orderId)}`;
}

export function requireBillingAlipayConfig(config: BillingPaymentConfig): BillingAlipayConfig {
  if (!config.alipay.enabled) {
    throw new Error('Alipay channel is disabled');
  }
  const missing = [
    ['BILLING_ALIPAY_APP_ID', config.alipay.appId],
    ['BILLING_ALIPAY_PRIVATE_KEY', config.alipay.privateKey],
    ['BILLING_ALIPAY_PUBLIC_KEY', config.alipay.alipayPublicKey],
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Alipay config is incomplete: ${missing.join(', ')}`);
  }
  return config.alipay;
}

export function requireBillingWechatConfig(config: BillingPaymentConfig): BillingWechatConfig {
  if (!config.wechat.enabled) {
    throw new Error('WeChat channel is disabled');
  }
  const missing = [
    ['BILLING_WECHAT_APP_ID', config.wechat.appId],
    ['BILLING_WECHAT_MCH_ID', config.wechat.mchId],
    ['BILLING_WECHAT_MERCHANT_SERIAL_NO', config.wechat.merchantSerialNo],
    ['BILLING_WECHAT_MERCHANT_PRIVATE_KEY', config.wechat.merchantPrivateKey],
    ['BILLING_WECHAT_API_V3_KEY', config.wechat.apiV3Key],
    ['BILLING_WECHAT_PLATFORM_PUBLIC_KEY', config.wechat.platformPublicKey],
    ['BILLING_WECHAT_PLATFORM_SERIAL_NO', config.wechat.platformSerialNo],
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`WeChat config is incomplete: ${missing.join(', ')}`);
  }
  return config.wechat;
}

export function getBillingAlipayPrivateKey(config: BillingPaymentConfig): KeyObject {
  return createPrivateKey(requireBillingAlipayConfig(config).privateKey);
}

export function getBillingAlipayPublicKey(config: BillingPaymentConfig): KeyObject {
  return createPublicKey(requireBillingAlipayConfig(config).alipayPublicKey);
}

export function getBillingWechatMerchantPrivateKey(config: BillingPaymentConfig): KeyObject {
  return createPrivateKey(requireBillingWechatConfig(config).merchantPrivateKey);
}

export function getBillingWechatPlatformPublicKey(config: BillingPaymentConfig): KeyObject {
  return createPublicKey(requireBillingWechatConfig(config).platformPublicKey);
}
