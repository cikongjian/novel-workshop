import path from 'node:path';
import { ensureDir, readJson, writeJson } from '../novel/fs-helpers.js';
import { now } from '../utils/text.js';
import { createDefaultBillingConfig, DEFAULT_BILLING_PACKAGES, DEFAULT_BILLING_RULES } from './defaults.js';
import { BillingRechargePackage, BillingRule, BillingSystemConfig, type BillingSystemConfig as BillingSystemConfigType } from './types.js';

export class BillingConfigStore {
  private readonly configDir: string;
  private readonly systemConfigPath: string;
  private readonly legacyRulesPath: string;

  constructor(dataDir: string) {
    this.configDir = path.join(dataDir, 'billing', 'config');
    this.systemConfigPath = path.join(this.configDir, 'system.json');
    this.legacyRulesPath = path.join(this.configDir, 'rules.json');
  }

  async getConfig(): Promise<BillingSystemConfigType> {
    const fallback = createDefaultBillingConfig(now());
    const raw = await readJson(this.systemConfigPath, fallback);
    const parsed = BillingSystemConfig.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }

    const legacyRulesRaw = await readJson(this.legacyRulesPath, DEFAULT_BILLING_RULES);
    const legacyRules = BillingRule.array().safeParse(legacyRulesRaw);

    return {
      ...fallback,
      rules: legacyRules.success ? legacyRules.data : DEFAULT_BILLING_RULES,
      packages: DEFAULT_BILLING_PACKAGES,
      updatedAt: now(),
    };
  }

  async saveConfig(input: BillingSystemConfigType): Promise<BillingSystemConfigType> {
    const normalized = BillingSystemConfig.parse({
      ...input,
      rules: input.rules.map(rule => BillingRule.parse(rule)),
      packages: input.packages.map(pkg => BillingRechargePackage.parse(pkg)),
      updatedAt: now(),
    });

    await ensureDir(this.configDir);
    await writeJson(this.systemConfigPath, normalized);
    return normalized;
  }
}
