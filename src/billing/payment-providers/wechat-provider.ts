import {
  createDecipheriv,
  createSign,
  createVerify,
  randomBytes,
} from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { BillingPaymentConfig, BillingWechatMode } from '../payment-config.js';
import {
  buildBillingCallbackUrl,
  buildBillingReturnUrl,
  getBillingWechatMerchantPrivateKey,
  getBillingWechatPlatformPublicKey,
  requireBillingWechatConfig,
} from '../payment-config.js';
import type { BillingPaymentAction } from '../payment-types.js';
import type { BillingOrder } from '../types.js';

type WechatUnifiedCallback = {
  id: string;
  create_time: string;
  event_type: string;
  resource_type: string;
  summary: string;
  resource: {
    algorithm: string;
    ciphertext: string;
    associated_data?: string;
    nonce: string;
  };
};

type WechatPaymentCallbackResource = {
  out_trade_no: string;
  transaction_id: string;
  trade_state: string;
  trade_state_desc?: string;
  amount?: {
    total?: number;
  };
};

function buildSignatureMessage(
  method: string,
  pathnameWithQuery: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  return `${method}\n${pathnameWithQuery}\n${timestamp}\n${nonce}\n${body}\n`;
}

function buildAuthorizationHeader(
  config: BillingPaymentConfig,
  method: string,
  pathnameWithQuery: string,
  body: string,
): string {
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const nonce = randomBytes(16).toString('hex');
  const sign = createSign('RSA-SHA256');
  sign.update(buildSignatureMessage(method, pathnameWithQuery, timestamp, nonce, body), 'utf8');
  const signature = sign.sign(getBillingWechatMerchantPrivateKey(config), 'base64');
  const channelConfig = requireBillingWechatConfig(config);

  return `WECHATPAY2-SHA256-RSA2048 mchid="${channelConfig.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${channelConfig.merchantSerialNo}"`;
}

async function requestWechatPay<TResponse>(
  config: BillingPaymentConfig,
  method: 'POST' | 'GET',
  pathnameWithQuery: string,
  body: Record<string, unknown> | null,
): Promise<TResponse> {
  const payload = body ? JSON.stringify(body) : '';
  const url = `${requireBillingWechatConfig(config).gatewayUrl}${pathnameWithQuery}`;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: buildAuthorizationHeader(config, method, pathnameWithQuery, payload),
      'User-Agent': 'novel-workshop-billing/1.0',
    },
    body: payload || undefined,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`WeChat Pay request failed (${response.status}): ${raw || response.statusText}`);
  }
  return JSON.parse(raw) as TResponse;
}

function buildQrCodeImageUrl(providerUrl: string, codeUrl: string): string | undefined {
  const normalized = providerUrl.trim();
  if (!normalized) return undefined;
  const query = new URLSearchParams({
    size: '240x240',
    data: codeUrl,
  });
  return `${normalized}?${query.toString()}`;
}

export async function createWechatPaymentAction(
  config: BillingPaymentConfig,
  order: BillingOrder,
  mode: BillingWechatMode,
  clientIp: string,
): Promise<BillingPaymentAction> {
  const channelConfig = requireBillingWechatConfig(config);
  const commonPayload = {
    appid: channelConfig.appId,
    mchid: channelConfig.mchId,
    description: order.title,
    out_trade_no: order.id,
    notify_url: buildBillingCallbackUrl(config, 'wechat'),
    time_expire: order.expiresAt,
    amount: {
      total: Math.round(order.amountCny * 100),
      currency: 'CNY',
    },
    attach: order.userId,
  };

  if (mode === 'native') {
    const response = await requestWechatPay<{ code_url: string }>(
      config,
      'POST',
      '/v3/pay/transactions/native',
      commonPayload,
    );
    return {
      type: 'qrcode',
      channel: 'wechat',
      scene: 'wechat.native',
      codeUrl: response.code_url,
      qrCodeImageUrl: buildQrCodeImageUrl(config.qrCodeProvider, response.code_url),
      expiresAt: order.expiresAt,
    };
  }

  const response = await requestWechatPay<{ h5_url: string }>(
    config,
    'POST',
    '/v3/pay/transactions/h5',
    {
      ...commonPayload,
      scene_info: {
        payer_client_ip: clientIp,
        h5_info: {
          type: 'Wap',
          app_name: channelConfig.h5AppName,
        },
      },
    },
  );
  return {
    type: 'redirect',
    channel: 'wechat',
    scene: 'wechat.h5',
    url: buildWechatReturnUrl(config, order.id, response.h5_url),
    expiresAt: order.expiresAt,
  };
}

export function verifyWechatCallback(
  config: BillingPaymentConfig,
  headers: IncomingHttpHeaders,
  rawBody: string,
): boolean {
  const timestamp = headers['wechatpay-timestamp'];
  const nonce = headers['wechatpay-nonce'];
  const signature = headers['wechatpay-signature'];
  const serial = headers['wechatpay-serial'];
  if (
    typeof timestamp !== 'string'
    || typeof nonce !== 'string'
    || typeof signature !== 'string'
    || typeof serial !== 'string'
  ) {
    return false;
  }

  const channelConfig = requireBillingWechatConfig(config);
  if (channelConfig.platformSerialNo && channelConfig.platformSerialNo !== serial) {
    return false;
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${timestamp}\n${nonce}\n${rawBody}\n`, 'utf8');
  return verifier.verify(getBillingWechatPlatformPublicKey(config), signature, 'base64');
}

export function decryptWechatCallbackResource(
  config: BillingPaymentConfig,
  payload: WechatUnifiedCallback,
): WechatPaymentCallbackResource {
  const channelConfig = requireBillingWechatConfig(config);
  const cipherBuffer = Buffer.from(payload.resource.ciphertext, 'base64');
  const authTag = cipherBuffer.subarray(cipherBuffer.length - 16);
  const encrypted = cipherBuffer.subarray(0, cipherBuffer.length - 16);
  const aes = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(channelConfig.apiV3Key, 'utf8'),
    Buffer.from(payload.resource.nonce, 'utf8'),
  );
  aes.setAuthTag(authTag);
  aes.setAAD(Buffer.from(payload.resource.associated_data ?? '', 'utf8'));
  const decrypted = Buffer.concat([aes.update(encrypted), aes.final()]).toString('utf8');
  return JSON.parse(decrypted) as WechatPaymentCallbackResource;
}

export function parseWechatCallback(rawBody: string): WechatUnifiedCallback {
  return JSON.parse(rawBody) as WechatUnifiedCallback;
}

function buildWechatReturnUrl(config: BillingPaymentConfig, orderId: string, h5Url: string): string {
  const redirectUrl = buildBillingReturnUrl(config, orderId);
  const target = new URL(h5Url);
  target.searchParams.set('redirect_url', redirectUrl);
  return target.toString();
}
