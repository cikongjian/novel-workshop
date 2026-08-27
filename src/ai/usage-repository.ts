import fs from 'node:fs/promises';
import path from 'node:path';
import { AiUsageRecord, type AiUsageOperationSummary, type AiUsageRecord as AiUsageRecordType } from './usage-types.js';

const AI_USAGE_DIR = 'ai-usage';
const AI_USAGE_LOG_FILE = 'records.jsonl';

function getAiUsageLogPath(dataDir: string): string {
  return path.join(dataDir, AI_USAGE_DIR, AI_USAGE_LOG_FILE);
}

export async function appendAiUsageRecord(dataDir: string, record: AiUsageRecordType): Promise<void> {
  const logPath = getAiUsageLogPath(dataDir);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf-8');
}

export async function readAiUsageRecords(dataDir: string): Promise<AiUsageRecordType[]> {
  const logPath = getAiUsageLogPath(dataDir);
  const raw = await fs.readFile(logPath, 'utf-8').catch(() => '');
  if (!raw.trim()) return [];

  const records: AiUsageRecordType[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(AiUsageRecord.parse(JSON.parse(trimmed)));
    } catch {
      // Ignore malformed historical lines.
    }
  }
  return records;
}

export function summarizeAiUsageOperations(records: AiUsageRecordType[]): AiUsageOperationSummary[] {
  const grouped = new Map<string, AiUsageOperationSummary>();

  for (const record of records) {
    const key = record.operationKey;
    const summary = grouped.get(key) ?? {
      operationKey: record.operationKey,
      operationLabel: record.operationLabel,
      requestCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      deepSeekTokens: 0,
      deepSeekCost: 0,
      lastUsedAt: null,
      usageKinds: [],
    };
    summary.requestCount += Math.max(1, record.requestCount ?? 1);
    summary.totalInputTokens += Math.max(0, record.inputTokens ?? 0);
    summary.totalOutputTokens += Math.max(0, record.outputTokens ?? 0);
    summary.totalTokens += Math.max(0, record.totalTokens ?? 0);
    summary.totalCost += Math.max(0, record.totalCost ?? 0);
    if ((record.provider ?? '').toLowerCase().includes('deepseek') || (record.model ?? '').toLowerCase().includes('deepseek')) {
      summary.deepSeekTokens += Math.max(0, record.totalTokens ?? 0);
      summary.deepSeekCost += Math.max(0, record.totalCost ?? 0);
    }
    summary.lastUsedAt = summary.lastUsedAt && summary.lastUsedAt > record.createdAt
      ? summary.lastUsedAt
      : record.createdAt;
    if (!summary.usageKinds.includes(record.usageKind)) {
      summary.usageKinds.push(record.usageKind);
    }
    grouped.set(key, summary);
  }

  return [...grouped.values()].sort((a, b) => (
    b.totalCost - a.totalCost
    || b.totalTokens - a.totalTokens
    || b.requestCount - a.requestCount
    || a.operationLabel.localeCompare(b.operationLabel)
  ));
}
