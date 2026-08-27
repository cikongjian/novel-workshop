import path from 'node:path';
import { atomicWriteUtf8 } from '../novel/fs-helpers.js';
import type { NovelOrganizationScope } from '../novel/novel-data-organizer.js';

export type RemoteNovelDataReportRequest = {
  novelId?: string;
  all?: boolean;
  scopes?: NovelOrganizationScope[];
  search?: string;
  ownerId?: string;
  limit?: number;
  offset?: number;
  apply?: boolean;
  backupId?: string;
};

export type RemoteNovelDataReport = {
  schemaVersion: 1;
  action: 'doctor' | 'list' | 'audit' | 'organize' | 'backups' | 'rollback'
    | 'chapter-check' | 'chapter-repair' | 'memory-check' | 'memory-rebuild' | 'cover-prompt';
  generatedAt: string;
  request: RemoteNovelDataReportRequest;
  result: unknown;
};

export async function writeRemoteNovelDataReport(
  outputPath: string,
  report: RemoteNovelDataReport,
): Promise<string> {
  const resolved = path.resolve(outputPath);
  await atomicWriteUtf8(resolved, `${JSON.stringify(report, null, 2)}\n`);
  return resolved;
}
