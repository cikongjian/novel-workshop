import type { AppConfig } from './config-builder.js';
import { buildConfigFromEnv } from './config-builder.js';

export type ConfigChangeHandler = (config: AppConfig) => void;

export class ConfigManager {
  private static instance: ConfigManager | null = null;

  private config: AppConfig;
  private configHash: string = '';
  private changeHandlers: Set<ConfigChangeHandler> = new Set();
  private isReloading = false;

  private constructor() {
    this.config = buildConfigFromEnv();
    this.configHash = this.computeConfigHash(this.config);
  }

  private computeConfigHash(config: AppConfig): string {
    return JSON.stringify(config);
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public get<T extends keyof AppConfig>(key: T): AppConfig[T] {
    return this.config[key];
  }

  public getNested<T extends keyof AppConfig, K extends keyof AppConfig[T]>(
    key: T,
    nestedKey: K,
  ): AppConfig[T][K] {
    return this.config[key][nestedKey];
  }

  public async reload(): Promise<AppConfig> {
    if (this.isReloading) {
      return this.config;
    }

    this.isReloading = true;
    try {
      const newConfig = buildConfigFromEnv();
      const newHash = this.computeConfigHash(newConfig);
      const oldHash = this.configHash;

      this.config = newConfig;
      this.configHash = newHash;

      if (oldHash !== newHash) {
        await this.notifyChange();
      }

      return newConfig;
    } finally {
      this.isReloading = false;
    }
  }

  public subscribe(handler: ConfigChangeHandler): () => void {
    this.changeHandlers.add(handler);

    return () => {
      this.changeHandlers.delete(handler);
    };
  }

  private async notifyChange(): Promise<void> {
    const handlers = Array.from(this.changeHandlers);
    for (const handler of handlers) {
      try {
        handler(this.config);
      } catch (err) {
        console.error('[config-manager] Error in change handler:', err);
      }
    }
  }

  public isFeatureEnabled(feature: string): boolean {
    const features: Record<string, string> = {
      worldContract: 'worldFeatures.enabled',
      outlineGate: 'outlineFeatures.enabled',
      qualityGate: 'qualityFeatures.enabled',
      continuityGate: 'continuityFeatures.enabled',
      powerRuleGate: 'powerRuleFeatures.enabled',
      autoRevision: 'autoRevision.enabled',
      autoCurate: 'autoCurate.enabled',
      autoFinalize: 'autoFinalize.enabled',
      authorNote: 'authorNote.enabled',
      realNameVerification: 'realNameVerification.enabled',
      userApi: 'userApi.enabled',
      antiAiTells: 'chapterEnhancement.antiAiTells.enabled',
      antiAiStructure: 'chapterEnhancement.antiAiStructure.enabled',
    };

    const path = features[feature];
    if (!path) return false;

    const parts = path.split('.');
    let current: unknown = this.config;
    for (const part of parts) {
      if (!current || typeof current !== 'object') return false;
      current = (current as Record<string, unknown>)[part];
    }

    return Boolean(current);
  }

  public getGateMode(feature: string): 'off' | 'warn' | 'strict' | undefined {
    const gates: Record<string, string> = {
      world: 'worldFeatures.gateMode',
      outline: 'outlineFeatures.gateMode',
      quality: 'qualityFeatures.gateMode',
      continuity: 'continuityFeatures.gateMode',
      powerRule: 'powerRuleFeatures.gateMode',
    };

    const path = gates[feature];
    if (!path) return undefined;

    const parts = path.split('.');
    let current: unknown = this.config;
    for (const part of parts) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    const mode = current as string;
    if (mode === 'off' || mode === 'warn' || mode === 'strict') return mode;
    return undefined;
  }
}

let cachedManager: ConfigManager | null = null;

export function getConfigManager(): ConfigManager {
  if (!cachedManager) {
    cachedManager = ConfigManager.getInstance();
  }
  return cachedManager;
}

export function getConfig(): AppConfig {
  return getConfigManager().getConfig();
}