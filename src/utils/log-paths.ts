import path from 'node:path';

const DEFAULT_LOG_DIR = path.join(process.cwd(), 'logs');
const LEGACY_LOG_DIR = path.resolve(process.cwd(), '..', 'logs');

export function resolvePrimaryLogDir(): string {
  return process.env.LOG_DIR || DEFAULT_LOG_DIR;
}

export function resolveReadableLogDirs(): string[] {
  if (process.env.LOG_DIR) {
    return [process.env.LOG_DIR];
  }

  return Array.from(new Set([DEFAULT_LOG_DIR, LEGACY_LOG_DIR]));
}
