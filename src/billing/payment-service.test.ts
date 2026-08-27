import { generateKeyPairSync, createSign, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BillingService } from './billing-service.js';
import { BillingPaymentService } from './payment-service.js';
import type { BillingPaymentConfig } from './payment-config.js';

function createTestPaymentConfig(): BillingPaymentConfig {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    apiBaseUrl: 'http://127.0.0.1:3001',
    frontendBaseUrl: 'http://127.0.0.1:5173',
    orderExpireMinutes: 30,
    qrCodeProvider: 'https://example.com/qr',
    alipay: {
      enabled: true,
      appId: 'test-app',
      gatewayUrl: 'https://openapi.alipay.com/gateway.do',
      privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      alipayPublicKey: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    },
    wechat: {
      enabled: false,
      appId: '',
      mchId: '',
      gatewayUrl: 'https://api.mch.weixin.qq.com',
      merchantSerialNo: '',
      merchantPrivateKey: '',
      apiV3Key: '',
      platformPublicKey: '',
      platformSerialNo: '',
      h5AppName: 'Novel Workshop',
    },
  };
}

function signAlipayPayload(
  config: BillingPaymentConfig,
  payload: Record<string, string>,
): Record<string, string> {
  const content = Object.keys(payload)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${payload[key]}`)
    .join('&');
  const signer = createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  return {
    ...payload,
    sign: signer.sign(config.alipay.privateKey, 'base64'),
    sign_type: 'RSA2',
  };
}

async function createServices() {
  const dataDir = path.join(os.tmpdir(), `novel-workshop-payment-${randomUUID()}`);
  await fs.mkdir(dataDir, { recursive: true });
  const { initAppDb } = await import('../db/app-db.js');
  const db = initAppDb(dataDir);
  const billingService = new BillingService(dataDir, db);
  const paymentConfig = createTestPaymentConfig();
  const paymentService = new BillingPaymentService(dataDir, billingService, paymentConfig);
  return { dataDir, billingService, paymentService, paymentConfig };
}

async function removeDir(dirPath: string) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

describe('BillingPaymentService', () => {
  const tempDirs = new Set<string>();

  afterEach(async () => {
    const { closeAppDb } = await import('../db/app-db.js');
    closeAppDb();
    await Promise.all([...tempDirs].map(async (dirPath) => removeDir(dirPath)));
    tempDirs.clear();
  });

  it('rejects custom point orders when amountCny is lower than server pricing', async () => {
    const { dataDir, paymentService } = await createServices();
    tempDirs.add(dataDir);

    await expect(paymentService.createTopupOrder('user_001', {
      points: 1000,
      amountCny: 0.01,
      channel: 'alipay',
      client: {},
    })).rejects.toThrow('amountCny must match server pricing');
  });

  it('credits a paid order only once when the callback is delivered repeatedly', async () => {
    const {
      dataDir,
      billingService,
      paymentService,
      paymentConfig,
    } = await createServices();
    tempDirs.add(dataDir);

    const created = await paymentService.createTopupOrder('user_001', {
      points: 1200,
      channel: 'alipay',
      client: {},
    });

    const callbackPayload = signAlipayPayload(paymentConfig, {
      out_trade_no: created.order.id,
      trade_status: 'TRADE_SUCCESS',
      total_amount: created.order.amountCny.toFixed(2),
      trade_no: 'alipay-trade-001',
      buyer_id: 'buyer-001',
    });

    const first = await paymentService.handleAlipayCallback(callbackPayload);
    const second = await paymentService.handleAlipayCallback(callbackPayload);
    const account = await billingService.getAccount('user_001');
    const ledger = await billingService.getLedger('user_001', 20);

    expect(first?.order.status).toBe('paid');
    expect(second?.order.status).toBe('paid');
    expect(account.balancePoints).toBe(created.order.totalPoints);
    expect(account.lifetimeRechargePoints).toBe(created.order.totalPoints);
    expect(ledger.filter(item => item.bizType === 'billing.topup.order' && item.bizId === created.order.id)).toHaveLength(1);
  });
});
