import { createHash, randomUUID } from 'node:crypto';
import type { BackupInfo } from '../backup/backup-manager.js';
import { NovelGenerationLock } from '../pipeline/novel-generation-lock.js';
import {
  listChapterGenerationFailures,
  recordChapterGenerationFailure,
  type ChapterGenerationFailure,
} from '../services/chapter-generation-failure-store.js';
import type { NovelManager } from './novel-manager.js';
import type { Chapter } from './types.js';
import { withNovelMaintenanceLock } from './novel-maintenance-lock.js';

export type ChapterIntegrityIssue = {
  code: 'failed_empty_placeholder' | 'empty_chapter' | 'unreadable_chapter';
  severity: 'error' | 'warning';
  chapterNumber: number;
  status: string;
  message: string;
  repairable: boolean;
  errorCode?: string;
  errorMessage?: string;
  updatedAt?: string;
};

export type ChapterGenerationIntegrityReport = {
  novel: { id: string; title: string; ownerId: string };
  summary: {
    chapterCount: number;
    emptyChapterCount: number;
    repairablePlaceholderCount: number;
    suspiciousEmptyChapterCount: number;
    persistedFailureCount: number;
  };
  issues: ChapterIntegrityIssue[];
  planToken: string;
  auditedAt: string;
};

export type ChapterGenerationRepairResult = {
  mode: 'dry-run' | 'apply';
  novelId: string;
  planToken: string;
  deletedChapterNumbers: number[];
  preservedFailureRecords: number[];
  backup?: Pick<BackupInfo, 'id' | 'size' | 'createdAt'>;
  reportBefore: ChapterGenerationIntegrityReport;
  reportAfter?: ChapterGenerationIntegrityReport;
};

type BackupCreator = {
  createBackup(novelId: string): Promise<BackupInfo>;
};

export class ChapterGenerationRepairPlanConflictError extends Error {
  constructor() {
    super('章节数据在检查后发生变化，请重新执行 chapter-check');
    this.name = 'ChapterGenerationRepairPlanConflictError';
  }
}

export class ChapterGenerationRepairActiveError extends Error {
  constructor() {
    super('小说当前仍有章节生成任务，已拒绝清理空章');
    this.name = 'ChapterGenerationRepairActiveError';
  }
}

function hasAuthorOrGeneratedMaterial(chapter: Chapter): boolean {
  return Boolean(
    chapter.content.trim()
    || chapter.title.trim()
    || chapter.summary?.trim()
    || chapter.agentComments.length > 0
    || chapter.revisionCount > 0
    || (chapter.authorNotes?.length ?? 0) > 0
    || (chapter.scenes?.length ?? 0) > 0
    || chapter.outline,
  );
}

function isRepairableFailedPlaceholder(chapter: Chapter): boolean {
  return chapter.status === 'outlined'
    && chapter.diagnostics?.generationLifecycle?.phase === 'failed'
    && !hasAuthorOrGeneratedMaterial(chapter);
}

function createPlanToken(params: {
  novelId: string;
  issues: ChapterIntegrityIssue[];
  failures: ChapterGenerationFailure[];
}): string {
  return createHash('sha256').update(JSON.stringify({
    novelId: params.novelId,
    issues: params.issues.map(issue => ({
      code: issue.code,
      chapterNumber: issue.chapterNumber,
      status: issue.status,
      repairable: issue.repairable,
      errorCode: issue.errorCode,
      updatedAt: issue.updatedAt,
    })),
    failures: params.failures,
  })).digest('hex');
}

export async function auditChapterGenerationIntegrity(
  novelManager: NovelManager,
  novelId: string,
): Promise<ChapterGenerationIntegrityReport> {
  const [novel, summaries, failures] = await Promise.all([
    novelManager.getNovel(novelId),
    novelManager.listChapters(novelId),
    listChapterGenerationFailures(novelManager, novelId),
  ]);
  const issues: ChapterIntegrityIssue[] = [];

  for (const summary of summaries) {
    let chapter: Chapter | null;
    try {
      chapter = await novelManager.getChapter(novelId, summary.chapterNumber);
    } catch {
      chapter = null;
    }
    if (!chapter) {
      issues.push({
        code: 'unreadable_chapter',
        severity: 'error',
        chapterNumber: summary.chapterNumber,
        status: summary.status,
        message: `第 ${summary.chapterNumber} 章元数据存在，但章节文件无法完整读取`,
        repairable: false,
        updatedAt: summary.updatedAt,
      });
      continue;
    }
    if (chapter.content.trim()) continue;
    const lifecycle = chapter.diagnostics?.generationLifecycle;
    const repairable = isRepairableFailedPlaceholder(chapter);
    issues.push({
      code: repairable ? 'failed_empty_placeholder' : 'empty_chapter',
      severity: repairable ? 'error' : 'warning',
      chapterNumber: chapter.chapterNumber,
      status: chapter.status,
      message: repairable
        ? `第 ${chapter.chapterNumber} 章是生成失败后写入的空占位章，可安全移除后重新生成`
        : `第 ${chapter.chapterNumber} 章正文为空，但含有作者内容或不具备明确的失败证据，需人工确认`,
      repairable,
      errorCode: lifecycle?.errorCode,
      errorMessage: lifecycle?.errorMessage,
      updatedAt: chapter.updatedAt,
    });
  }

  const planToken = createPlanToken({ novelId, issues, failures });
  const repairablePlaceholderCount = issues.filter(issue => issue.repairable).length;
  return {
    novel: {
      id: novel.id,
      title: novel.title,
      ownerId: novel.ownerId ?? 'dev',
    },
    summary: {
      chapterCount: summaries.length,
      emptyChapterCount: issues.length,
      repairablePlaceholderCount,
      suspiciousEmptyChapterCount: issues.length - repairablePlaceholderCount,
      persistedFailureCount: failures.length,
    },
    issues,
    planToken,
    auditedAt: new Date().toISOString(),
  };
}

function slimBackup(backup: BackupInfo): Pick<BackupInfo, 'id' | 'size' | 'createdAt'> {
  return { id: backup.id, size: backup.size, createdAt: backup.createdAt };
}

export async function repairChapterGenerationIntegrity(params: {
  novelManager: NovelManager;
  novelId: string;
  apply?: boolean;
  expectedPlanToken?: string;
  backupManager?: BackupCreator;
}): Promise<ChapterGenerationRepairResult> {
  return withNovelMaintenanceLock(params.novelId, async () => {
    const reportBefore = await auditChapterGenerationIntegrity(params.novelManager, params.novelId);
    const targets = reportBefore.issues.filter(issue => issue.repairable);
    if (!params.apply) {
      return {
        mode: 'dry-run',
        novelId: params.novelId,
        planToken: reportBefore.planToken,
        deletedChapterNumbers: [],
        preservedFailureRecords: [],
        reportBefore,
      };
    }
    if (params.expectedPlanToken !== reportBefore.planToken) {
      throw new ChapterGenerationRepairPlanConflictError();
    }
    if (targets.length === 0) {
      return {
        mode: 'apply',
        novelId: params.novelId,
        planToken: reportBefore.planToken,
        deletedChapterNumbers: [],
        preservedFailureRecords: [],
        reportBefore,
        reportAfter: reportBefore,
      };
    }
    if (!params.backupManager) throw new Error('修复章节数据前必须配置备份管理器');

    const generationLock = new NovelGenerationLock(params.novelManager.getDataDir(), {
      retryMs: 100,
    });
    let releaseGenerationLock: (() => Promise<void>) | undefined;
    try {
      releaseGenerationLock = await generationLock.acquire({
        novelId: params.novelId,
        chapterNumber: targets[0].chapterNumber,
        runId: `chapter-repair-${randomUUID()}`,
        signal: AbortSignal.timeout(1_500),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ChapterGenerationRepairActiveError();
      }
      throw error;
    }

    let backup: BackupInfo;
    const deletedChapterNumbers: number[] = [];
    const preservedFailureRecords: number[] = [];
    try {
      const lockedReport = await auditChapterGenerationIntegrity(params.novelManager, params.novelId);
      if (lockedReport.planToken !== params.expectedPlanToken) {
        throw new ChapterGenerationRepairPlanConflictError();
      }
      backup = await params.backupManager.createBackup(params.novelId);
      for (const target of targets) {
        await recordChapterGenerationFailure(params.novelManager, params.novelId, {
          chapterNumber: target.chapterNumber,
          errorCode: target.errorCode ?? 'EMPTY_FAILED_CHAPTER_REPAIRED',
          errorMessage: target.errorMessage ?? '生成失败产生的空占位章已清理，可重新生成。',
          retryable: true,
          updatedAt: new Date().toISOString(),
        });
        preservedFailureRecords.push(target.chapterNumber);
        await params.novelManager.deleteChapter(params.novelId, target.chapterNumber);
        deletedChapterNumbers.push(target.chapterNumber);
      }
      await params.novelManager.syncNovelMetadataByChapters(params.novelId);
    } finally {
      await releaseGenerationLock();
    }

    return {
      mode: 'apply',
      novelId: params.novelId,
      planToken: reportBefore.planToken,
      deletedChapterNumbers,
      preservedFailureRecords,
      backup: slimBackup(backup!),
      reportBefore,
      reportAfter: await auditChapterGenerationIntegrity(params.novelManager, params.novelId),
    };
  });
}
