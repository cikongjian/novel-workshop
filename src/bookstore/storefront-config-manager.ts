import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  BookStoreStorefrontConfig,
  UpdateBookStoreStorefrontConfigRequest,
} from './storefront-types.js';

const STOREFRONT_CONFIG_FILE = 'bookstore-storefront.json';

function createDefaultConfig(): BookStoreStorefrontConfig {
  return {
    defaultSort: 'updated',
    updatedAt: new Date(),
    updatedBy: 'system',
  };
}

export class BookStoreStorefrontConfigManager {
  constructor(private readonly dataDir: string) {}

  private getConfigPath(): string {
    return path.join(this.dataDir, STOREFRONT_CONFIG_FILE);
  }

  private async ensureConfigFile(): Promise<void> {
    const filePath = this.getConfigPath();
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(createDefaultConfig(), null, 2), 'utf-8');
    }
  }

  private toDate(value: unknown): Date | undefined {
    if (!value) {
      return undefined;
    }

    const date = value instanceof Date ? value : new Date(value as string);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private normalizeConfig(raw: any): BookStoreStorefrontConfig {
    const defaults = createDefaultConfig();
    return {
      defaultSort: raw?.defaultSort === 'hot' || raw?.defaultSort === 'new' ? raw.defaultSort : defaults.defaultSort,
      updatedAt: this.toDate(raw?.updatedAt) ?? defaults.updatedAt,
      updatedBy: typeof raw?.updatedBy === 'string' && raw.updatedBy.trim() ? raw.updatedBy : defaults.updatedBy,
    };
  }

  private async readConfig(): Promise<BookStoreStorefrontConfig> {
    await this.ensureConfigFile();
    const content = await fs.readFile(this.getConfigPath(), 'utf-8');
    return this.normalizeConfig(JSON.parse(content));
  }

  private async writeConfig(config: BookStoreStorefrontConfig): Promise<void> {
    await fs.writeFile(this.getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
  }

  async getConfig(): Promise<BookStoreStorefrontConfig> {
    return this.readConfig();
  }

  async updateConfig(
    request: UpdateBookStoreStorefrontConfigRequest,
    updatedBy: string,
  ): Promise<BookStoreStorefrontConfig> {
    const config: BookStoreStorefrontConfig = {
      defaultSort: request.defaultSort,
      updatedAt: new Date(),
      updatedBy,
    };
    await this.writeConfig(config);
    return config;
  }
}
