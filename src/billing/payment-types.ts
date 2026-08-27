import type { BillingOrder, BillingOrderChannel, BillingPaymentScene } from './types.js';

export type BillingTopupOrderRequest = {
  packageId?: string;
  points?: number;
  amountCny?: number;
  remark?: string;
  channel: Exclude<BillingOrderChannel, 'demo'>;
  client: {
    userAgent?: string;
    ip?: string;
    prefersMobile?: boolean;
  };
};

export type BillingPaymentAction =
  | {
      type: 'redirect';
      channel: 'alipay' | 'wechat';
      scene: Extract<BillingPaymentScene, 'alipay.page' | 'wechat.h5'>;
      url: string;
      expiresAt?: string;
    }
  | {
      type: 'qrcode';
      channel: 'wechat';
      scene: 'wechat.native';
      codeUrl: string;
      qrCodeImageUrl?: string;
      expiresAt?: string;
    };

export type BillingCreateTopupOrderResult = {
  order: BillingOrder;
  paymentAction: BillingPaymentAction;
};
