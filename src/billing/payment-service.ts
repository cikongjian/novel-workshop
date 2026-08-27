import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { BillingService } from './billing-service.js';
import { now } from '../utils/text.js';
import { getBillingPaymentConfig, type BillingPaymentConfig, type BillingWechatMode } from './payment-config.js';
import { createAlipayPageAction, readAlipayCallbackValue, verifyAlipayCallback } from './payment-providers/alipay-provider.js';
import {
  createWechatPaymentAction,
  decryptWechatCallbackResource,
  parseWechatCallback,
  verifyWechatCallback,
} from './payment-providers/wechat-provider.js';
import { BillingTopupOrderStore } from './topup-order-store.js';
import type { BillingCreateTopupOrderResult, BillingTopupOrderRequest } from './payment-types.js';
import { BillingOrder, type BillingOrder as BillingOrderType } from './types.js';

type PaidOrderResult = {
  order: BillingOrderType;
  issuedCodes: Awaited<ReturnType<BillingService['creditTopupOrder']>>['issuedCodes'];
  ledgerItem: Awaited<ReturnType<BillingService['creditTopupOrder']>>['ledgerItem'];
  account: Awaited<ReturnType<BillingService['creditTopupOrder']>>['account'];
};

type OrderPaymentPatch = {
  channelTradeNo: string;
  metadata?: Record<string, string>;
};

export class BillingPaymentService {
  private readonly config: BillingPaymentConfig;
  private readonly billingService: BillingService;
  private readonly orderStore: BillingTopupOrderStore;
  private readonly orderLocks = new Map<string, Promise<unknown>>();
  /** 充值到账后的回调（用于拉新佣金触发等） */
  onTopupCredited?: (userId: string, totalPoints: number) => Promise<void>;

  constructor(_dataDir: string, billingService: BillingService, config: BillingPaymentConfig = getBillingPaymentConfig()) {
    this.config = config;
    this.billingService = billingService;
    // orderStore 从 billingService 内部共享，避免重复初始化
    this.orderStore = (billingService as unknown as { orderStore: BillingTopupOrderStore }).orderStore;
  }

  async createTopupOrder(userId: string, input: BillingTopupOrderRequest): Promise<BillingCreateTopupOrderResult> {
    const createdAt = now();
    const expiresAt = new Date(Date.now() + this.config.orderExpireMinutes * 60_000).toISOString();
    const packageConfig = input.packageId
      ? (await this.billingService.getPackages()).find(item => item.id === input.packageId)
      : undefined;

    let amountCny = 0;
    let points = 0;
    let bonusPoints = 0;
    let title = 'Account topup';
    let remark = input.remark?.trim() ?? '';

    if (packageConfig) {
      amountCny = packageConfig.amountCny;
      points = packageConfig.points;
      bonusPoints = packageConfig.bonusPoints;
      title = packageConfig.title;
      if (!remark) remark = packageConfig.title;
    } else {
      const safePoints = Math.floor(input.points ?? 0);
      if (!Number.isFinite(safePoints) || safePoints <= 0) {
        throw new Error('points is required when packageId is missing');
      }
      const config = await this.billingService.getSystemConfig();
      points = safePoints;
      const expectedAmountCny = Number((points / config.pointScale).toFixed(2));
      if (
        typeof input.amountCny === 'number'
        && Number.isFinite(input.amountCny)
        && Number(input.amountCny.toFixed(2)) !== expectedAmountCny
      ) {
        throw new Error('amountCny must match server pricing');
      }
      amountCny = expectedAmountCny;
      title = `${points} points topup`;
      if (!remark) remark = title;
    }

    const order = BillingOrder.parse({
      id: randomUUID(),
      userId,
      title,
      packageId: packageConfig?.id,
      amountCny,
      points,
      bonusPoints,
      totalPoints: points + bonusPoints,
      channel: input.channel,
      status: 'created',
      paymentScene: input.channel === 'alipay' ? 'alipay.page' : this.resolveWechatScene(input.client),
      remark,
      createdAt,
      updatedAt: createdAt,
      expiresAt,
    });

    const paymentAction = await this.createPaymentAction(order, input.client.ip ?? '127.0.0.1');
    const savedOrder = await this.orderStore.saveOrder({
      ...order,
      paymentScene: paymentAction.scene,
      paymentUrl: paymentAction.type === 'redirect' ? paymentAction.url : undefined,
      codeUrl: paymentAction.type === 'qrcode' ? paymentAction.codeUrl : undefined,
      updatedAt: now(),
    });

    return {
      order: savedOrder,
      paymentAction,
    };
  }

  async getOrder(orderId: string): Promise<BillingOrderType | null> {
    const order = await this.orderStore.getOrder(orderId);
    if (!order) return null;
    if (order.status === 'created' && order.expiresAt && Date.parse(order.expiresAt) <= Date.now()) {
      return this.closeOrder(order.id, 'Order expired');
    }
    return order;
  }

  async listOrdersForUser(userId: string, limit = 20): Promise<BillingOrderType[]> {
    return this.orderStore.listOrdersForUser(userId, limit);
  }

  async handleAlipayCallback(payload: Record<string, string | string[] | undefined>): Promise<PaidOrderResult | null> {
    if (!verifyAlipayCallback(this.config, payload)) {
      throw new Error('Invalid Alipay callback signature');
    }

    const orderId = readAlipayCallbackValue(payload, 'out_trade_no');
    const tradeStatus = readAlipayCallbackValue(payload, 'trade_status');
    if (!orderId || !tradeStatus) {
      throw new Error('Alipay callback is missing order id or trade status');
    }

    if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
      return null;
    }

    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error(`Topup order not found: ${orderId}`);
    }

    const totalAmount = Number.parseFloat(readAlipayCallbackValue(payload, 'total_amount'));
    if (Number.isFinite(totalAmount) && Number(totalAmount.toFixed(2)) !== Number(order.amountCny.toFixed(2))) {
      throw new Error(`Alipay callback amount mismatch for order ${orderId}`);
    }

    return this.markOrderPaid(orderId, {
      channelTradeNo: readAlipayCallbackValue(payload, 'trade_no') || orderId,
      metadata: {
        buyerId: readAlipayCallbackValue(payload, 'buyer_id'),
        tradeStatus,
      },
    });
  }

  async handleWechatCallback(headers: IncomingHttpHeaders, rawBody: string): Promise<PaidOrderResult | null> {
    if (!verifyWechatCallback(this.config, headers, rawBody)) {
      throw new Error('Invalid WeChat callback signature');
    }

    const callback = parseWechatCallback(rawBody);
    const resource = decryptWechatCallbackResource(this.config, callback);
    if (resource.trade_state !== 'SUCCESS') {
      return null;
    }

    const orderId = resource.out_trade_no;
    if (!orderId) {
      throw new Error('WeChat callback is missing order id');
    }

    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error(`Topup order not found: ${orderId}`);
    }

    const paidAmountFen = resource.amount?.total;
    const orderAmountFen = Math.round(order.amountCny * 100);
    if (typeof paidAmountFen === 'number' && paidAmountFen !== orderAmountFen) {
      throw new Error(`WeChat callback amount mismatch for order ${orderId}`);
    }

    return this.markOrderPaid(orderId, {
      channelTradeNo: resource.transaction_id || orderId,
      metadata: {
        tradeState: resource.trade_state,
        tradeStateDesc: resource.trade_state_desc ?? '',
      },
    });
  }

  private async createPaymentAction(order: BillingOrderType, clientIp: string) {
    if (order.channel === 'alipay') {
      return createAlipayPageAction(this.config, order);
    }
    const mode: BillingWechatMode = order.paymentScene === 'wechat.h5' ? 'h5' : 'native';
    return createWechatPaymentAction(this.config, order, mode, clientIp);
  }

  private resolveWechatScene(client: BillingTopupOrderRequest['client']): BillingOrderType['paymentScene'] {
    const userAgent = (client.userAgent ?? '').toLowerCase();
    if (client.prefersMobile) return 'wechat.h5';
    if (userAgent.includes('iphone') || userAgent.includes('android') || userAgent.includes('mobile')) {
      return 'wechat.h5';
    }
    return 'wechat.native';
  }

  private async closeOrder(orderId: string, reason: string): Promise<BillingOrderType> {
    return this.withOrderLock(orderId, async () => {
      const order = await this.orderStore.getOrder(orderId);
      if (!order) {
        throw new Error(`Topup order not found: ${orderId}`);
      }
      if (order.status !== 'created') {
        return order;
      }
      return this.orderStore.saveOrder({
        ...order,
        status: 'closed',
        failureReason: reason,
        closedAt: now(),
        updatedAt: now(),
      });
    });
  }

  private async markOrderPaid(orderId: string, patch: OrderPaymentPatch): Promise<PaidOrderResult> {
    return this.withOrderLock(orderId, async () => {
      const currentOrder = await this.orderStore.getOrder(orderId);
      if (!currentOrder) {
        throw new Error(`Topup order not found: ${orderId}`);
      }

      if (currentOrder.status === 'paid') {
        const result = await this.billingService.creditTopupOrder(currentOrder);
        return {
          order: currentOrder,
          ...result,
        };
      }

      if (currentOrder.status !== 'created') {
        throw new Error(`Topup order cannot be paid from status ${currentOrder.status}`);
      }

      const paidAt = now();
      const paidOrder = await this.orderStore.saveOrder({
        ...currentOrder,
        status: 'paid',
        channelTradeNo: patch.channelTradeNo,
        metadata: {
          ...(currentOrder.metadata ?? {}),
          ...(patch.metadata ?? {}),
        },
        paidAt,
        updatedAt: paidAt,
      });

      const result = await this.billingService.creditTopupOrder(paidOrder);

      // 异步触发拉新佣金回调（不阻塞支付响应）
      if (this.onTopupCredited) {
        void this.onTopupCredited(paidOrder.userId, paidOrder.totalPoints).catch(() => undefined);
      }

      return {
        order: paidOrder,
        ...result,
      };
    });
  }

  private async withOrderLock<T>(orderId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.orderLocks.get(orderId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.orderLocks.set(orderId, next);
    try {
      return await next;
    } finally {
      if (this.orderLocks.get(orderId) === next) {
        this.orderLocks.delete(orderId);
      }
    }
  }
}
