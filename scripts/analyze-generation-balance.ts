import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

type ChapterSample = {
  novelId: string;
  chapterNumber: number;
  status?: string;
  wordCount: number;
  readerScore?: number;
  qualityOverall?: number;
  qualityStructure?: number;
  qualityStyle?: number;
  qualityEmotion?: number;
  qualityPassed?: boolean;
  qualityFindings: string[];
  autoRevisionTriggered: boolean;
  autoRevisionRounds: number;
  autoRevisionAccepted?: boolean;
  autoRevisionReason?: string;
  readerDeliveryPassed?: boolean;
  readerDeliveryScore?: number;
  generationPhase?: string;
  generationErrorCode?: string;
  generationErrorMessage?: string;
  hasAgentTrace: boolean;
  agentCalls: number;
  tracedLatencyMs: number;
  callsByRole: Map<string, number>;
  latencyByRole: Map<string, number>;
  memoryWarnings: string[];
  persistenceMissing: string[];
};

type Summary = {
  sampleCount: number;
  reviewedCount: number;
  failedCount: number;
  draftCount: number;
  avgWordCount: number;
  avgReaderScore: number;
  avgQualityOverall: number;
  qualityPassRate: number;
  autoRevisionRate: number;
  autoRevisionAcceptedRate: number;
  avgAutoRevisionRoundsWhenTriggered: number;
  readerDeliveryPassRate: number;
  avgAgentCalls: number;
  avgTracedLatencySec: number;
};

const dataDir = path.resolve(process.argv[2] ?? process.env.DATA_DIR ?? './data');
const novelsDir = path.join(dataDir, 'novels');
const limit = readPositiveInt(process.argv[3], 2000);

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readJson(filePath: string): JsonRecord | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as JsonRecord;
  } catch {
    return null;
  }
}

function getRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function addMap(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSec(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function analyzeChapter(novelId: string, filePath: string): ChapterSample | null {
  const chapter = readJson(filePath);
  if (!chapter) return null;
  const diagnostics = getRecord(chapter.diagnostics) ?? {};
  const qualityGate = getRecord(diagnostics.qualityGate);
  const autoRevision = getRecord(diagnostics.autoRevision);
  const lifecycle = getRecord(diagnostics.generationLifecycle);
  const readerDelivery = getRecord(diagnostics.readerDeliveryAudit);
  const memoryPersistence = getRecord(diagnostics.memoryPersistenceAudit);
  const agentTrace = getArray(diagnostics.agentTrace);

  const callsByRole = new Map<string, number>();
  const latencyByRole = new Map<string, number>();
  let tracedLatencyMs = 0;
  for (const item of agentTrace) {
    const trace = getRecord(item);
    const role = getString(trace?.agentRole) ?? 'unknown';
    const latencyMs = getNumber(trace?.latencyMs) ?? 0;
    addMap(callsByRole, role, 1);
    addMap(latencyByRole, role, latencyMs);
    tracedLatencyMs += latencyMs;
  }

  const qualityFindings = getArray(qualityGate?.findings)
    .map(item => getString(getRecord(item)?.code))
    .filter((item): item is string => Boolean(item));

  const persistenceMissing: string[] = [];
  if (memoryPersistence) {
    for (const [field, label] of [
      ['chapterIndexed', 'chapter-index'],
      ['digestIndexed', 'digest-index'],
      ['factIndexed', 'fact-index'],
      ['truthFilesAligned', 'truth-files'],
    ] as const) {
      if (memoryPersistence[field] === false) persistenceMissing.push(label);
    }
  }

  return {
    novelId,
    chapterNumber: getNumber(chapter.chapterNumber) ?? 0,
    status: getString(chapter.status),
    wordCount: getNumber(chapter.wordCount) ?? getString(chapter.content)?.length ?? 0,
    readerScore: getNumber(chapter.readerScore),
    qualityOverall: getNumber(qualityGate?.overallScore),
    qualityStructure: getNumber(qualityGate?.structureScore),
    qualityStyle: getNumber(qualityGate?.styleScore),
    qualityEmotion: getNumber(qualityGate?.emotionScore),
    qualityPassed: getBoolean(qualityGate?.passed),
    qualityFindings,
    autoRevisionTriggered: getBoolean(autoRevision?.triggered) ?? false,
    autoRevisionRounds: getNumber(autoRevision?.rounds) ?? 0,
    autoRevisionAccepted: getBoolean(autoRevision?.accepted),
    autoRevisionReason: getString(autoRevision?.reason),
    readerDeliveryPassed: getBoolean(autoRevision?.readerDeliveryPassed) ?? getBoolean(readerDelivery?.passed),
    readerDeliveryScore: getNumber(autoRevision?.readerDeliveryFinalScore) ?? getNumber(readerDelivery?.score),
    generationPhase: getString(lifecycle?.phase),
    generationErrorCode: getString(lifecycle?.errorCode),
    generationErrorMessage: getString(lifecycle?.errorMessage),
    hasAgentTrace: agentTrace.length > 0,
    agentCalls: agentTrace.length,
    tracedLatencyMs,
    callsByRole,
    latencyByRole,
    memoryWarnings: getArray(memoryPersistence?.warnings).map(String).filter(Boolean),
    persistenceMissing,
  };
}

function loadSamples(): ChapterSample[] {
  if (!existsSync(novelsDir)) return [];
  const samples: ChapterSample[] = [];
  for (const novelEntry of readdirSync(novelsDir, { withFileTypes: true })) {
    if (!novelEntry.isDirectory() || novelEntry.name.startsWith('_')) continue;
    const chaptersDir = path.join(novelsDir, novelEntry.name, 'chapters');
    if (!existsSync(chaptersDir)) continue;
    for (const chapterEntry of readdirSync(chaptersDir, { withFileTypes: true })) {
      if (!chapterEntry.isFile() || !/^\d+\.json$/.test(chapterEntry.name)) continue;
      const sample = analyzeChapter(novelEntry.name, path.join(chaptersDir, chapterEntry.name));
      if (sample) samples.push(sample);
      if (samples.length >= limit) return samples;
    }
  }
  return samples.sort((a, b) => `${a.novelId}:${a.chapterNumber}`.localeCompare(`${b.novelId}:${b.chapterNumber}`));
}

function summarize(samples: ChapterSample[]): Summary {
  const reviewed = samples.filter(item => item.status === 'reviewed' || item.status === 'finalized');
  const failed = samples.filter(item => item.generationPhase === 'failed');
  const draft = samples.filter(item => item.generationPhase === 'draft');
  const withQuality = samples.filter(item => item.qualityOverall != null);
  const withReader = samples.filter(item => item.readerScore != null);
  const withDelivery = samples.filter(item => item.readerDeliveryPassed != null);
  const triggered = samples.filter(item => item.autoRevisionTriggered);
  const accepted = triggered.filter(item => item.autoRevisionAccepted);
  const withTrace = samples.filter(item => item.hasAgentTrace);

  return {
    sampleCount: samples.length,
    reviewedCount: reviewed.length,
    failedCount: failed.length,
    draftCount: draft.length,
    avgWordCount: average(samples.map(item => item.wordCount)),
    avgReaderScore: average(withReader.map(item => item.readerScore ?? 0)),
    avgQualityOverall: average(withQuality.map(item => item.qualityOverall ?? 0)),
    qualityPassRate: withQuality.length ? withQuality.filter(item => item.qualityPassed).length / withQuality.length : 0,
    autoRevisionRate: samples.length ? triggered.length / samples.length : 0,
    autoRevisionAcceptedRate: triggered.length ? accepted.length / triggered.length : 0,
    avgAutoRevisionRoundsWhenTriggered: average(triggered.map(item => item.autoRevisionRounds)),
    readerDeliveryPassRate: withDelivery.length ? withDelivery.filter(item => item.readerDeliveryPassed).length / withDelivery.length : 0,
    avgAgentCalls: average(withTrace.map(item => item.agentCalls)),
    avgTracedLatencySec: average(withTrace.map(item => item.tracedLatencyMs)) / 1000,
  };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function topCounts(values: string[], topN: number): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) addMap(counts, value, 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
}

function printTable(title: string, rows: string[][]): void {
  console.log(`\n${title}`);
  if (rows.length === 0) {
    console.log('  (none)');
    return;
  }
  const widths = rows[0].map((_, index) => Math.max(...rows.map(row => row[index]?.length ?? 0)));
  for (const row of rows) {
    console.log(`  ${row.map((cell, index) => cell.padEnd(widths[index])).join('  ')}`);
  }
}

function main(): void {
  const samples = loadSamples();
  const summary = summarize(samples);
  const traced = samples.filter(item => item.hasAgentTrace);
  const traceLatency = traced.map(item => item.tracedLatencyMs).filter(value => value > 0);
  const allFindings = samples.flatMap(item => item.qualityFindings);
  const revisionReasons = samples
    .filter(item => item.autoRevisionTriggered)
    .map(item => item.autoRevisionReason ?? 'unknown');
  const persistenceIssues = samples.flatMap(item => item.persistenceMissing);
  const memoryWarnings = samples.flatMap(item => item.memoryWarnings);
  const failed = samples.filter(item => item.generationPhase === 'failed');
  const drafts = samples.filter(item => item.generationPhase === 'draft');

  const callsByRole = new Map<string, number>();
  const latencyByRole = new Map<string, number>();
  for (const sample of traced) {
    for (const [role, count] of sample.callsByRole) addMap(callsByRole, role, count);
    for (const [role, latency] of sample.latencyByRole) addMap(latencyByRole, role, latency);
  }

  console.log('Generation balance analysis');
  console.log(`dataDir=${dataDir}`);
  console.log(`samples=${summary.sampleCount}`);
  console.log('');
  console.log(`reviewed/finalized=${summary.reviewedCount}`);
  console.log(`failedRecords=${summary.failedCount}`);
  console.log(`draftOnlyRecords=${summary.draftCount}`);
  console.log(`avgWordCount=${summary.avgWordCount.toFixed(0)}`);
  console.log(`avgReaderScore=${summary.avgReaderScore.toFixed(2)}`);
  console.log(`avgQualityOverall=${summary.avgQualityOverall.toFixed(1)}`);
  console.log(`qualityPassRate=${formatPercent(summary.qualityPassRate)}`);
  console.log(`autoRevisionRate=${formatPercent(summary.autoRevisionRate)}`);
  console.log(`autoRevisionAcceptedRate=${formatPercent(summary.autoRevisionAcceptedRate)}`);
  console.log(`avgAutoRevisionRoundsWhenTriggered=${summary.avgAutoRevisionRoundsWhenTriggered.toFixed(1)}`);
  console.log(`readerDeliveryPassRate=${formatPercent(summary.readerDeliveryPassRate)}`);
  console.log(`avgAgentCalls=${summary.avgAgentCalls.toFixed(1)}`);
  console.log(`avgTracedLatency=${summary.avgTracedLatencySec.toFixed(1)}s`);
  console.log(`medianTracedLatency=${formatSec(median(traceLatency))}`);
  console.log(`p90TracedLatency=${formatSec(percentile(traceLatency, 90))}`);

  printTable('Top quality findings', [
    ['finding', 'count'],
    ...topCounts(allFindings, 10).map(([key, count]) => [key, String(count)]),
  ]);
  printTable('Auto revision reasons', [
    ['reason', 'count'],
    ...topCounts(revisionReasons, 10).map(([key, count]) => [key, String(count)]),
  ]);
  printTable('Agent calls and traced latency', [
    ['role', 'calls', 'latency'],
    ...[...callsByRole.entries()]
      .sort((a, b) => (latencyByRole.get(b[0]) ?? 0) - (latencyByRole.get(a[0]) ?? 0))
      .map(([role, calls]) => [role, String(calls), formatSec(latencyByRole.get(role) ?? 0)]),
  ]);
  printTable('Persistence issues', [
    ['issue', 'count'],
    ...topCounts([...persistenceIssues, ...memoryWarnings], 10).map(([key, count]) => [key, String(count)]),
  ]);
  printTable('Failed or draft records', [
    ['novel', 'chapter', 'phase', 'code', 'message'],
    ...[...failed, ...drafts].slice(0, 20).map(item => [
      item.novelId.slice(0, 8),
      String(item.chapterNumber),
      item.generationPhase ?? '',
      item.generationErrorCode ?? '',
      (item.generationErrorMessage ?? '').slice(0, 80),
    ]),
  ]);
}

main();
