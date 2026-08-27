// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockIsAppShell = vi.fn(() => false);

vi.mock('../utils/app-shell', () => ({
  isAppShell: () => mockIsAppShell(),
}));

const { useNetworkStatusStore } = await import('./networkStatus');

/** 覆写 navigator.onLine（happy-dom 下该属性默认只读） */
function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    value,
    configurable: true,
    writable: true,
  });
}

describe('useNetworkStatusStore 初始在线判定', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockIsAppShell.mockReturnValue(false);
    setNavigatorOnLine(true);
    vi.clearAllMocks();
  });

  it('浏览器环境跟随 navigator.onLine', () => {
    setNavigatorOnLine(false);
    mockIsAppShell.mockReturnValue(false);
    expect(useNetworkStatusStore().online).toBe(false);
  });

  it('浏览器在线时初始为在线', () => {
    setNavigatorOnLine(true);
    expect(useNetworkStatusStore().online).toBe(true);
  });

  it('App 壳环境即使 navigator 报离线也视为在线', () => {
    // 壳内页面能加载即代表有网，navigator.onLine 常误报
    setNavigatorOnLine(false);
    mockIsAppShell.mockReturnValue(true);
    expect(useNetworkStatusStore().online).toBe(true);
  });

  it('Service Worker 相关标志初始均为 false', () => {
    const store = useNetworkStatusStore();
    expect(store.swRegistered).toBe(false);
    expect(store.swUpdateAvailable).toBe(false);
    expect(store.swOfflineReady).toBe(false);
  });
});

describe('useNetworkStatusStore 事件监听', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockIsAppShell.mockReturnValue(false);
    setNavigatorOnLine(true);
    vi.clearAllMocks();
  });

  it('online 事件恢复在线状态', () => {
    const store = useNetworkStatusStore();
    store.init();
    store.setOnline(false);
    window.dispatchEvent(new Event('online'));
    expect(store.online).toBe(true);
  });

  it('浏览器环境响应 offline 事件', () => {
    const store = useNetworkStatusStore();
    store.init();
    window.dispatchEvent(new Event('offline'));
    expect(store.online).toBe(false);
  });

  it('App 壳环境忽略 offline 误报', () => {
    mockIsAppShell.mockReturnValue(true);
    const store = useNetworkStatusStore();
    store.init();
    window.dispatchEvent(new Event('offline'));
    expect(store.online).toBe(true);
  });

  it('App 壳环境仍响应 online 事件', () => {
    mockIsAppShell.mockReturnValue(true);
    const store = useNetworkStatusStore();
    store.init();
    store.setOnline(false);
    window.dispatchEvent(new Event('online'));
    expect(store.online).toBe(true);
  });

  it('sw:registered 事件置位并保留注册对象', () => {
    const store = useNetworkStatusStore();
    store.init();
    const registration = { scope: '/' } as ServiceWorkerRegistration;
    window.dispatchEvent(new CustomEvent('sw:registered', { detail: registration }));
    expect(store.swRegistered).toBe(true);
  });

  it('sw:update-available 事件置位', () => {
    const store = useNetworkStatusStore();
    store.init();
    window.dispatchEvent(new Event('sw:update-available'));
    expect(store.swUpdateAvailable).toBe(true);
  });

  it('sw:offline-ready 事件置位', () => {
    const store = useNetworkStatusStore();
    store.init();
    window.dispatchEvent(new Event('sw:offline-ready'));
    expect(store.swOfflineReady).toBe(true);
  });
});

describe('useNetworkStatusStore 状态设置方法', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockIsAppShell.mockReturnValue(false);
    setNavigatorOnLine(true);
  });

  it('setOnline 双向可切换', () => {
    const store = useNetworkStatusStore();
    store.setOnline(false);
    expect(store.online).toBe(false);
    store.setOnline(true);
    expect(store.online).toBe(true);
  });

  it('setSwRegistered 允许传入 undefined', () => {
    const store = useNetworkStatusStore();
    store.setSwRegistered(undefined);
    expect(store.swRegistered).toBe(true);
  });
});

describe('useNetworkStatusStore acceptSwUpdate', () => {
  const originalUpdater = (window as Record<string, unknown>).__updateSW;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockIsAppShell.mockReturnValue(false);
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    if (originalUpdater === undefined) delete (window as Record<string, unknown>).__updateSW;
    else (window as Record<string, unknown>).__updateSW = originalUpdater;
  });

  it('存在注入的更新器时调用它并要求重载', async () => {
    const updater = vi.fn(async () => {});
    (window as Record<string, unknown>).__updateSW = updater;
    const store = useNetworkStatusStore();
    store.setSwUpdateAvailable();
    await store.acceptSwUpdate();
    expect(updater).toHaveBeenCalledWith(true);
    expect(store.swUpdateAvailable).toBe(false);
  });

  it('更新器缺失时回退到页面重载', async () => {
    delete (window as Record<string, unknown>).__updateSW;
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    });
    const store = useNetworkStatusStore();
    store.setSwUpdateAvailable();
    await store.acceptSwUpdate();
    expect(reload).toHaveBeenCalled();
    expect(store.swUpdateAvailable).toBe(false);
  });
});
