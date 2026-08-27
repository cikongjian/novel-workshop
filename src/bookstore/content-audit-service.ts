import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { ContentAudit, AuditResultDetail, AuditStatus } from './types.js';
import type { AuditClient, AuditConfig } from './audit-client.js';
import { createAuditClient } from './audit-client.js';
import type { ModelClient } from '../models/types.js';
import { AiAuditClient } from './ai-audit-client.js';
import { runWithAiUsageContextAsync } from '../ai/usage-context.js';

const CONTENT_AUDITS_DATA_FILE = 'content-audits.json';

/** 审核记录最大保留条数，超出时清理最旧的记录 */
const MAX_AUDIT_RECORDS = 2000;

export class ContentAuditService {
  private dataDir: string;
  private auditClient: AuditClient;
  private config: AuditConfig;

  constructor(dataDir: string, config: AuditConfig) {
    this.dataDir = dataDir;
    this.config = config;
    this.auditClient = createAuditClient(config);
  }

  /**
   * 注入 ModelClient，切换为 AI 智能审核模式。
   * 在 index.ts 中模型客户端就绪后调用此方法。
   */
  setModelClient(modelClient: ModelClient): void {
    this.auditClient = new AiAuditClient(modelClient);
  }

  private getAuditsFilePath(): string {
    return path.join(this.dataDir, CONTENT_AUDITS_DATA_FILE);
  }

  private async ensureDataFile(): Promise<void> {
    const filePath = this.getAuditsFilePath();
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify({ audits: [] }, null, 2), 'utf-8');
    }
  }

  private async readAllAudits(): Promise<ContentAudit[]> {
    await this.ensureDataFile();
    const content = await fs.readFile(this.getAuditsFilePath(), 'utf-8');
    const data = JSON.parse(content);
    return data.audits.map((audit: any) => ({
      ...audit,
      auditTime: new Date(audit.auditTime),
    }));
  }

  private async writeAllAudits(audits: ContentAudit[]): Promise<void> {
    const filePath = this.getAuditsFilePath();
    await fs.writeFile(filePath, JSON.stringify({ audits }, null, 2), 'utf-8');
  }

  /**
   * 审核任意短文本，不落库。
   */
  async auditText(
    content: string,
    options?: {
      novelId?: string;
      operationKey?: string;
      operationLabel?: string;
    },
  ): Promise<AuditResultDetail> {
    return runWithAiUsageContextAsync({
      scope: 'system',
      operationKey: options?.operationKey ?? 'system.content-audit',
      operationLabel: options?.operationLabel ?? '内容审核',
      operationRegistered: true,
      novelId: options?.novelId,
    }, async () => this.auditClient.auditText(content));
  }

  /**
   * 审核单个章节
   */
  async auditChapter(
    novelId: string,
    chapterId: string,
    content: string
  ): Promise<ContentAudit> {
    const result = await this.auditText(content, { novelId });
    const status = this.determineStatus(result);

    const audit: ContentAudit = {
      id: randomUUID(),
      novelId,
      chapterId,
      content: content.substring(0, 500), // 只保存前 500 字符
      auditType: 'auto',
      status,
      result,
      auditTime: new Date(),
      provider: this.auditClient.providerId,
    };

    let audits = await this.readAllAudits();
    audits.push(audit);
    // 超出上限时删除最旧的记录，防止文件无限增长
    if (audits.length > MAX_AUDIT_RECORDS) {
      audits = audits
        .sort((a, b) => b.auditTime.getTime() - a.auditTime.getTime())
        .slice(0, MAX_AUDIT_RECORDS);
    }
    await this.writeAllAudits(audits);

    return audit;
  }

  /**
   * 审核整本小说
   */
  async auditNovel(
    novelId: string,
    chapters: Array<{ id: string; content: string }>
  ): Promise<{
    overallStatus: AuditStatus;
    audits: ContentAudit[];
    summary: {
      total: number;
      pass: number;
      review: number;
      reject: number;
    };
  }> {
    const audits: ContentAudit[] = [];

    // 批量审核所有章节
    for (const chapter of chapters) {
      const audit = await this.auditChapter(novelId, chapter.id, chapter.content);
      audits.push(audit);
    }

    // 统计结果
    const summary = {
      total: audits.length,
      pass: audits.filter(a => a.status === 'pass').length,
      review: audits.filter(a => a.status === 'manual_review').length,
      reject: audits.filter(a => a.status === 'reject').length,
    };

    // 确定整体状态
    let overallStatus: AuditStatus;
    if (summary.reject > 0) {
      overallStatus = 'reject';
    } else if (summary.review > 0) {
      overallStatus = 'manual_review';
    } else {
      overallStatus = 'pass';
    }

    return { overallStatus, audits, summary };
  }

  /**
   * 通过 auditId 获取对应的 novelId
   */
  async getNovelIdByAuditId(auditId: string): Promise<string | null> {
    const audits = await this.readAllAudits();
    return audits.find(a => a.id === auditId)?.novelId ?? null;
  }

  /**
   * 人工审核
   */
  async manualAudit(
    auditId: string,
    auditorId: string,
    status: 'pass' | 'reject'
  ): Promise<void> {
    const audits = await this.readAllAudits();
    const index = audits.findIndex(a => a.id === auditId);

    if (index === -1) {
      throw new Error('审核记录不存在');
    }

    audits[index].status = status;
    audits[index].auditType = 'manual';
    audits[index].auditorId = auditorId;
    audits[index].auditTime = new Date();

    await this.writeAllAudits(audits);
  }

  /**
   * 获取小说的审核记录
   */
  async getNovelAudits(novelId: string): Promise<ContentAudit[]> {
    const audits = await this.readAllAudits();
    return audits.filter(a => a.novelId === novelId);
  }

  /**
   * 获取待人工审核的记录
   */
  async getPendingManualAudits(): Promise<ContentAudit[]> {
    const audits = await this.readAllAudits();
    return audits.filter(a => a.status === 'manual_review');
  }

  /**
   * 根据审核结果确定状态
   */
  private determineStatus(result: AuditResultDetail): AuditStatus {
    if (result.suggestion === 'pass') {
      return 'pass';
    } else if (result.suggestion === 'review') {
      return 'manual_review';
    } else {
      return 'reject';
    }
  }

  /**
   * 获取审核统计
   */
  async getAuditStats(): Promise<{
    total: number;
    pass: number;
    review: number;
    reject: number;
    byType: Record<string, number>;
  }> {
    const audits = await this.readAllAudits();

    const stats = {
      total: audits.length,
      pass: audits.filter(a => a.status === 'pass').length,
      review: audits.filter(a => a.status === 'manual_review').length,
      reject: audits.filter(a => a.status === 'reject').length,
      byType: {} as Record<string, number>,
    };

    // 统计违规类型
    audits.forEach(audit => {
      audit.result.violations.forEach(violation => {
        stats.byType[violation.type] = (stats.byType[violation.type] || 0) + 1;
      });
    });

    return stats;
  }
}
