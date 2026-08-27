import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const LOCAL_USER_ID = 'local-anonymous-id';
const AUTH_USER_ID = 'authenticated-user-id';

const mockFetchBillingPricing = vi.fn();
const mockFetchBillingOverview = vi.fn();
const mockCreateBillingTopupOrder = vi.fn();
const mockFetchBillingTopupOrder = vi.fn();
const mockFetchBillingTopupOrders = vi.fn();
const mockEstimateBilling = vi.fn();

vi.mock('../api/billing', () => ({
  fetchBillingPricing: mockFetchBillingPricing,
  fetchBillingOverview: mockFetchBillingOverview,
  createBillingTopupOrder: mockCreateBillingTopupOrder,
  fetchBillingTopupOrder: mockFetchBillingTopupOrder,
  fetchBillingTopupOrders: mockFetchBillingTopupOrders,
  estimateBilling: mockEstimateBilling,
}));

vi.mock('../utils/billing-user', () => ({
  readOrCreateBillingUserId: () => LOCAL_USER_ID,
}));

/** 用可控的假 auth store 替代真实实现，避免拉进 http 依赖 */
const authState = { authEnabled: false, user: null as { id: string } | null };
vi.mock('./auth', () => ({
  useAuthStore: () => authState,
}));

const { useBillingStore } = await import('./billing');

function overviewPayload() {
  return {
    pointScale: 1,
    freeTrial: {},
    productPresentation: {},
    externalStorefront: {},
    operationBindings: {},
    rules: [],
    packages: [],
    account: { balancePoints: 500 },
    ledger: [{ id: 'l1' }],
    trialQuota: { remaining: 2, total: 3 },
  };
}

describe('useBillingStore resolveUserId', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    authState.authEnabled = false;
    authState.user = null;
    vi.clearAllMocks();
  });

  it('认证关闭时用本机匿名 id', () => {
    const store = useBillingStore();
    expect(store.resolveUserId()).toBe(LOCAL_USER_ID);
  });

  it('认证开启且已登录时用登录用户 id', () => {
    authState.authEnabled = true;
    authState.user = { id: AUTH_USER_ID };
    const store = useBillingStore();
    expect(store.resolveUserId()).toBe(AUTH_USER_ID);
  });

  it('认证开启但未登录时回落到本机 id', () => {
    authState.authEnabled = true;
    authState.user = null;
    const store = useBillingStore();
    expect(store.resolveUserId()).toBe(LOCAL_USER_ID);
  });

  it('认证关闭时即使有用户也不采用其 id', () => {
    authState.authEnabled = false;
    authState.user = { id: AUTH_USER_ID };
    const store = useBillingStore();
    expect(store.resolveUserId()).toBe(LOCAL_USER_ID);
  });
});

describe('useBillingStore loadPricing 缓存', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockFetchBillingPricing.mockResolvedValue({ rules: [] });
  });

  it('首次调用会拉取', async () => {
    const store = useBillingStore();
    await store.loadPricing();
    expect(mockFetchBillingPricing).toHaveBeenCalledTimes(1);
  });

  it('已有缓存时不重复拉取', async () => {
    const store = useBillingStore();
    await store.loadPricing();
    await store.loadPricing();
    expect(mockFetchBillingPricing).toHaveBeenCalledTimes(1);
  });

  it('force 为真时强制重新拉取', async () => {
    const store = useBillingStore();
    await store.loadPricing();
    await store.loadPricing(true);
    expect(mockFetchBillingPricing).toHaveBeenCalledTimes(2);
  });
});

describe('useBillingStore loadOverview', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    authState.authEnabled = false;
    authState.user = null;
    vi.clearAllMocks();
  });

  it('把返回结果写入各状态字段', async () => {
    mockFetchBillingOverview.mockResolvedValue(overviewPayload());
    const store = useBillingStore();
    await store.loadOverview();
    expect(store.account).toEqual({ balancePoints: 500 });
    expect(store.ledger).toHaveLength(1);
    expect(store.trialQuota).toEqual({ remaining: 2, total: 3 });
    expect(store.pricing).not.toBeNull();
  });

  it('用解析出的用户 id 请求', async () => {
    authState.authEnabled = true;
    authState.user = { id: AUTH_USER_ID };
    mockFetchBillingOverview.mockResolvedValue(overviewPayload());
    const store = useBillingStore();
    await store.loadOverview(50);
    expect(mockFetchBillingOverview).toHaveBeenCalledWith(AUTH_USER_ID, 50);
  });

  it('默认条数为 20', async () => {
    mockFetchBillingOverview.mockResolvedValue(overviewPayload());
    const store = useBillingStore();
    await store.loadOverview();
    expect(mockFetchBillingOverview).toHaveBeenCalledWith(LOCAL_USER_ID, 20);
  });

  it('成功后 loading 复位', async () => {
    mockFetchBillingOverview.mockResolvedValue(overviewPayload());
    const store = useBillingStore();
    await store.loadOverview();
    expect(store.loading).toBe(false);
  });

  it('请求失败时 loading 也必须复位', async () => {
    mockFetchBillingOverview.mockRejectedValue(new Error('network down'));
    const store = useBillingStore();
    await expect(store.loadOverview()).rejects.toThrow('network down');
    expect(store.loading).toBe(false);
  });
});

describe('useBillingStore 充值与预估', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    authState.authEnabled = false;
    authState.user = null;
    vi.clearAllMocks();
  });

  it('创建订单时带上用户 id 与载荷', async () => {
    mockCreateBillingTopupOrder.mockResolvedValue({ order: {}, paymentAction: {} });
    const store = useBillingStore();
    const payload = { packageId: 'pkg-1', channel: 'alipay' as const };
    await store.createTopupOrder(payload);
    expect(mockCreateBillingTopupOrder).toHaveBeenCalledWith(LOCAL_USER_ID, payload);
  });

  it('创建订单成功后 toppingUp 复位', async () => {
    mockCreateBillingTopupOrder.mockResolvedValue({ order: {}, paymentAction: {} });
    const store = useBillingStore();
    await store.createTopupOrder({ channel: 'wechat' });
    expect(store.toppingUp).toBe(false);
  });

  it('创建订单失败时 toppingUp 也必须复位', async () => {
    mockCreateBillingTopupOrder.mockRejectedValue(new Error('pay gateway down'));
    const store = useBillingStore();
    await expect(store.createTopupOrder({ channel: 'alipay' })).rejects.toThrow('pay gateway down');
    expect(store.toppingUp).toBe(false);
  });

  it('查询单笔订单带上用户 id', async () => {
    mockFetchBillingTopupOrder.mockResolvedValue({});
    const store = useBillingStore();
    await store.fetchTopupOrder('order-9');
    expect(mockFetchBillingTopupOrder).toHaveBeenCalledWith(LOCAL_USER_ID, 'order-9');
  });

  it('查询订单列表带上用户 id', async () => {
    mockFetchBillingTopupOrders.mockResolvedValue([]);
    const store = useBillingStore();
    await store.fetchTopupOrders();
    expect(mockFetchBillingTopupOrders).toHaveBeenCalledWith(LOCAL_USER_ID);
  });

  it('预估只透传载荷，不带用户 id', async () => {
    mockEstimateBilling.mockResolvedValue({ points: 10 });
    const store = useBillingStore();
    await store.estimate({ ruleCode: 'r.gen', charCount: 2000 });
    expect(mockEstimateBilling).toHaveBeenCalledWith({ ruleCode: 'r.gen', charCount: 2000 });
  });
});
