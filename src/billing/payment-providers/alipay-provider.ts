import { createSign, createVerify } from 'node:crypto';
import { URLSearchParams } from 'node:url';
import type { BillingPaymentConfig } from '../payment-config.js';
import {
  buildBillingCallbackUrl,
  buildBillingReturnUrl,
  getBillingAlipayPrivateKey,
  getBillingAlipayPublicKey,
  requireBillingAlipayConfig,
} from '../payment-config.js';
import type { BillingPaymentAction } from '../payment-types.js';
import type { BillingOrder } from '../types.js';

type AlipayCallbackPayload = Record<string, string | string[] | undefined>;

function buildSignedContent(params: Record<string, string>): string {
  return Object.keys(params)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}

function flattenCallbackValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function createAlipayPageAction(config: BillingPaymentConfig, order: BillingOrder): BillingPaymentAction {
  const channelConfig = requireBillingAlipayConfig(config);
  const params: Record<string, string> = {
    app_id: channelConfig.appId,
    method: 'alipay.trade.page.pay',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    version: '1.0',
    notify_url: buildBillingCallbackUrl(config, 'alipay'),
    return_url: buildBillingReturnUrl(config, order.id),
    biz_content: JSON.stringify({
      out_trade_no: order.id,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: order.amountCny.toFixed(2),
      subject: order.title,
      body: order.remark || order.title,
      timeout_express: `${Math.max(1, Math.ceil((Date.parse(order.expiresAt ?? order.createdAt) - Date.now()) / 60000))}m`,
    }),
  };

  const signer = createSign('RSA-SHA256');
  signer.update(buildSignedContent(params), 'utf8');
  const sign = signer.sign(getBillingAlipayPrivateKey(config), 'base64');

  const search = new URLSearchParams({ ...params, sign });
  return {
    type: 'redirect',
    channel: 'alipay',
    scene: 'alipay.page',
    url: `${channelConfig.gatewayUrl}?${search.toString()}`,
    expiresAt: order.expiresAt,
  };
}

export function verifyAlipayCallback(config: BillingPaymentConfig, payload: AlipayCallbackPayload): boolean {
  const sign = flattenCallbackValue(payload.sign);
  if (!sign) return false;

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'sign' || key === 'sign_type') continue;
    if (typeof value === 'undefined') continue;
    normalized[key] = flattenCallbackValue(value);
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(buildSignedContent(normalized), 'utf8');
  return verifier.verify(getBillingAlipayPublicKey(config), sign, 'base64');
}

export function readAlipayCallbackValue(payload: AlipayCallbackPayload, key: string): string {
  return flattenCallbackValue(payload[key]);
}
