import path from 'node:path';
import fs from 'node:fs';
import { config as loadDotenv } from 'dotenv';
import type { AppConfig } from '../config/config-builder.js';
import { buildConfigFromEnv } from '../config/config-builder.js';

type TobModelOverrides = {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export interface TobConfig {
  host: string;
  port: number;
  apiToken: string;
  dataDir: string;
  sourceDataDir: string;
  workerConcurrency: number;
  workerPollMs: number;
  rateLimitMax: number;
  allowMockGeneration: boolean;
  appConfig: AppConfig;
}

function readIntEnv(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function loadTobEnvFile(): void {
  loadDotenv();
  const envFile = process.env.TOB_ENV_FILE ?? '.env.tob.local';
  const resolved = path.resolve(envFile);
  if (fs.existsSync(resolved)) {
    loadDotenv({ path: resolved, override: true });
  }
}

function resolveModelOverrides(baseConfig: AppConfig): TobModelOverrides {
  return {
    provider: process.env.TOB_MODEL_PROVIDER ?? baseConfig.model.provider,
    apiKey: process.env.TOB_MODEL_API_KEY ?? baseConfig.model.apiKey,
    model: process.env.TOB_MODEL_NAME ?? baseConfig.model.model,
    baseUrl: process.env.TOB_MODEL_BASE_URL ?? baseConfig.model.baseUrl,
  };
}

function buildTobAppConfig(baseConfig: AppConfig): AppConfig {
  const overrides = resolveModelOverrides(baseConfig);
  return {
    ...baseConfig,
    model: {
      ...baseConfig.model,
      provider: overrides.provider as AppConfig['model']['provider'],
      apiKey: overrides.apiKey ?? '',
      model: overrides.model ?? baseConfig.model.model,
      baseUrl: overrides.baseUrl ?? '',
    },
    dataDir: process.env.TOB_DATA_DIR
      ? path.resolve(process.env.TOB_DATA_DIR)
      : path.resolve(baseConfig.dataDir, 'tob'),
  };
}

export function loadTobConfig(): TobConfig {
  loadTobEnvFile();
  const baseConfig = buildConfigFromEnv();
  const appConfig = buildTobAppConfig(baseConfig);
  const baseDataDir = path.resolve(baseConfig.dataDir);
  const hasNestedNovelsData = fs.existsSync(path.resolve(baseDataDir, 'novels', 'novels'));
  const inferredSourceDataDir = hasNestedNovelsData
    ? path.resolve(baseDataDir, 'novels')
    : baseDataDir;

  return {
    host: process.env.TOB_HOST ?? '127.0.0.1',
    port: readIntEnv('TOB_PORT', 3310),
    apiToken: process.env.TOB_API_TOKEN ?? '',
    dataDir: appConfig.dataDir,
    sourceDataDir: process.env.TOB_SOURCE_DATA_DIR
      ? path.resolve(process.env.TOB_SOURCE_DATA_DIR)
      : inferredSourceDataDir,
    workerConcurrency: readIntEnv('TOB_WORKER_CONCURRENCY', 1),
    workerPollMs: readIntEnv('TOB_WORKER_POLL_MS', 1200, 200),
    rateLimitMax: readIntEnv('TOB_RATE_LIMIT_MAX', 60),
    allowMockGeneration: readBoolEnv('TOB_ALLOW_MOCK_GENERATION', true),
    appConfig,
  };
}
