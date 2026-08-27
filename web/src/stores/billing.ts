import { defineStore } from 'pinia';
import {
  createBillingTopupOrder,
  estimateBilling,
  fetchBillingTopupOrder,
  fetchBillingTopupOrders,
  fetchBillingOverview,
  fetchBillingPricing,
  type BillingAccount,
  type BillingEstimateResult,
  type BillingLedgerItem,
  type BillingOrder,
  type BillingPaymentAction,
  type BillingPricingCatalog,
} from '../api/billing';
import { useAuthStore } from './auth';
import { readOrCreateBillingUserId } from '../utils/billing-user';

type BillingState = {
  userId: string;
  pricing: BillingPricingCatalog | null;
  account: BillingAccount | null;
  ledger: BillingLedgerItem[];
  trialQuota: { remaining: number; total: number } | null;
  loading: boolean;
  toppingUp: boolean;
};

export const useBillingStore = defineStore('billing', {
  state: (): BillingState => ({
    userId: readOrCreateBillingUserId(),
    pricing: null,
    account: null,
    ledger: [],
    trialQuota: null,
    loading: false,
    toppingUp: false,
  }),
  actions: {
    resolveUserId(): string {
      const authStore = useAuthStore();
      if (authStore.authEnabled && authStore.user?.id) {
        return authStore.user.id;
      }
      return this.userId;
    },
    async loadPricing(force = false) {
      if (this.pricing && !force) return this.pricing;
      this.pricing = await fetchBillingPricing();
      return this.pricing;
    },
    async loadOverview(limit = 20) {
      this.loading = true;
      try {
        const overview = await fetchBillingOverview(this.resolveUserId(), limit);
        this.pricing = {
          pointScale: overview.pointScale,
          freeTrial: overview.freeTrial,
          productPresentation: overview.productPresentation,
          externalStorefront: overview.externalStorefront,
          operationBindings: overview.operationBindings,
          rules: overview.rules,
          packages: overview.packages,
        };
        this.account = overview.account;
        this.ledger = overview.ledger;
        this.trialQuota = overview.trialQuota;
        return overview;
      } finally {
        this.loading = false;
      }
    },
    async createTopupOrder(payload: {
      packageId?: string;
      points?: number;
      amountCny?: number;
      remark?: string;
      channel: 'alipay' | 'wechat';
    }): Promise<{ order: BillingOrder; paymentAction: BillingPaymentAction }> {
      this.toppingUp = true;
      try {
        return await createBillingTopupOrder(this.resolveUserId(), payload);
      } finally {
        this.toppingUp = false;
      }
    },
    async fetchTopupOrder(orderId: string): Promise<BillingOrder> {
      return fetchBillingTopupOrder(this.resolveUserId(), orderId);
    },
    async fetchTopupOrders(): Promise<BillingOrder[]> {
      return fetchBillingTopupOrders(this.resolveUserId());
    },
    async estimate(payload: { ruleCode: string; charCount?: number; quantity?: number }): Promise<BillingEstimateResult> {
      return estimateBilling(payload);
    },
  },
});
