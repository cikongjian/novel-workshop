import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ConfigManager, getConfigManager } from './config-manager.js';
import { buildConfigFromEnv } from './config-builder.js';

describe('ConfigManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should be a singleton', () => {
    const manager1 = ConfigManager.getInstance();
    const manager2 = ConfigManager.getInstance();
    expect(manager1).toBe(manager2);
  });

  it('should return same instance via getConfigManager', () => {
    const manager1 = getConfigManager();
    const manager2 = getConfigManager();
    expect(manager1).toBe(manager2);
    expect(manager1).toBe(ConfigManager.getInstance());
  });

  it('should return config via getConfig', () => {
    const manager = getConfigManager();
    const config = manager.getConfig();
    expect(config).toBeDefined();
    expect(config.server).toBeDefined();
    expect(config.model).toBeDefined();
  });

  it('should return config property via get', () => {
    const manager = getConfigManager();
    const serverConfig = manager.get('server');
    expect(serverConfig).toBeDefined();
    expect(typeof serverConfig.port).toBe('number');
  });

  it('should return nested config via getNested', () => {
    const manager = getConfigManager();
    const modelProvider = manager.getNested('model', 'provider');
    expect(typeof modelProvider).toBe('string');
  });

  it('should return new config on reload', async () => {
    const manager = getConfigManager();
    const oldConfig = manager.getConfig();
    const newConfig = await manager.reload();
    expect(newConfig).toBeDefined();
    expect(newConfig.server.port).toBe(oldConfig.server.port);
  });

  it('should skip notification when config is same', async () => {
    const manager = getConfigManager();
    const handler = vi.fn();

    manager.subscribe(handler);

    await manager.reload();
    await manager.reload();

    expect(handler).toHaveBeenCalledTimes(0);
  });

  it('should be reentrant safe during reload', async () => {
    const manager = getConfigManager();
    const handler = vi.fn();

    manager.subscribe(handler);

    await Promise.all([manager.reload(), manager.reload(), manager.reload()]);

    expect(handler).toHaveBeenCalledTimes(0);
  });

  it('should check feature enabled status', () => {
    const manager = getConfigManager();

    expect(typeof manager.isFeatureEnabled('qualityGate')).toBe('boolean');
    expect(typeof manager.isFeatureEnabled('autoRevision')).toBe('boolean');
    expect(manager.isFeatureEnabled('unknown')).toBe(false);
  });

  it('should get gate mode', () => {
    const manager = getConfigManager();

    const mode = manager.getGateMode('quality');
    expect(['off', 'warn', 'strict', undefined]).toContain(mode);
    expect(manager.getGateMode('unknown')).toBeUndefined();
  });

  it('should have buildConfigFromEnv return valid config', () => {
    const config = buildConfigFromEnv();
    expect(config).toBeDefined();
    expect(config.server.port).toBeGreaterThan(0);
    expect(config.model.provider).toBeDefined();
  });

  it('keeps quality floor revision enabled by default even when broad auto revision is off', () => {
    const originalAutoRevision = process.env.AUTO_REVISION_ENABLED;
    const originalQualityFloor = process.env.QUALITY_FLOOR_REVISION_ENABLED;
    delete process.env.AUTO_REVISION_ENABLED;
    delete process.env.QUALITY_FLOOR_REVISION_ENABLED;

    try {
      const config = buildConfigFromEnv();
      expect(config.autoRevision.enabled).toBe(false);
      expect(config.autoRevision.qualityFloorRevisionEnabled).toBe(true);

      process.env.QUALITY_FLOOR_REVISION_ENABLED = 'false';
      expect(buildConfigFromEnv().autoRevision.qualityFloorRevisionEnabled).toBe(false);
    } finally {
      if (originalAutoRevision === undefined) {
        delete process.env.AUTO_REVISION_ENABLED;
      } else {
        process.env.AUTO_REVISION_ENABLED = originalAutoRevision;
      }
      if (originalQualityFloor === undefined) {
        delete process.env.QUALITY_FLOOR_REVISION_ENABLED;
      } else {
        process.env.QUALITY_FLOOR_REVISION_ENABLED = originalQualityFloor;
      }
    }
  });

  it('should allow subscription and unsubscription', () => {
    const manager = getConfigManager();
    const handler = vi.fn();

    const unsubscribe = manager.subscribe(handler);
    unsubscribe();

    expect(manager['changeHandlers'].has(handler)).toBe(false);
  });
});
