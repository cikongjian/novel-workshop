import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { SkillEffectRecord, SkillEffectsData, QualityScore, UserFeedback } from './skill-effects-types.js';
import { createLogger } from '../utils/logger.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';

const logger = createLogger('SkillEffectsTracker');

export class SkillEffectsTracker {
  constructor(private readonly novelsDir: string) {}

  private getEffectsFilePath(novelId: string): string {
    return path.join(resolveNovelStorageDir(this.novelsDir, novelId), 'skill-effects.json');
  }

  private async loadEffectsData(novelId: string): Promise<SkillEffectsData> {
    const filePath = this.getEffectsFilePath(novelId);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      return { records: data.records ?? [] };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { records: [] };
      }
      throw err;
    }
  }

  private async saveEffectsData(novelId: string, data: SkillEffectsData): Promise<void> {
    const filePath = this.getEffectsFilePath(novelId);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 记录技能效果
   */
  async recordSkillEffect(params: {
    novelId: string;
    chapterNumber: number;
    appliedSkills: string[];
    qualityBefore?: QualityScore;
    qualityAfter: QualityScore;
    agentRole: string;
  }): Promise<SkillEffectRecord> {
    const data = await this.loadEffectsData(params.novelId);

    const record: SkillEffectRecord = {
      id: uuidv4(),
      novelId: params.novelId,
      chapterNumber: params.chapterNumber,
      appliedSkills: params.appliedSkills,
      qualityBefore: params.qualityBefore,
      qualityAfter: params.qualityAfter,
      agentRole: params.agentRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    data.records.push(record);
    await this.saveEffectsData(params.novelId, data);

    logger.info(`Recorded skill effect for novel ${params.novelId} chapter ${params.chapterNumber}`);
    return record;
  }

  /**
   * 更新用户反馈
   */
  async updateUserFeedback(params: {
    novelId: string;
    chapterNumber: number;
    feedback: UserFeedback;
  }): Promise<SkillEffectRecord | null> {
    const data = await this.loadEffectsData(params.novelId);

    // 找到最近的该章节记录
    const record = [...data.records]
      .reverse()
      .find(r => r.novelId === params.novelId && r.chapterNumber === params.chapterNumber);

    if (!record) {
      logger.warn(`No skill effect record found for novel ${params.novelId} chapter ${params.chapterNumber}`);
      return null;
    }

    record.userFeedback = params.feedback;
    record.updatedAt = new Date().toISOString();

    await this.saveEffectsData(params.novelId, data);
    logger.info(`Updated user feedback for novel ${params.novelId} chapter ${params.chapterNumber}: ${params.feedback}`);

    return record;
  }

  /**
   * 获取指定章节的技能效果记录
   */
  async getChapterEffects(novelId: string, chapterNumber: number): Promise<SkillEffectRecord[]> {
    const data = await this.loadEffectsData(novelId);
    return data.records.filter(r => r.chapterNumber === chapterNumber);
  }

  /**
   * 获取小说的所有技能效果记录
   */
  async getNovelEffects(novelId: string): Promise<SkillEffectRecord[]> {
    const data = await this.loadEffectsData(novelId);
    return data.records;
  }

}
