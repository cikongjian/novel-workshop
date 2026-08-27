import fs from 'node:fs/promises';
import path from 'node:path';
import type { AdaptationPackage } from '../novel/types.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';
import { createLogger, type Logger } from '../utils/logger.js';
import type { AdaptationComplianceMetadata } from './compliance-metadata.js';

type AudioPayloadChapter = {
  audioPath?: string;
};

type AdaptationPayload = {
  mode?: AdaptationPackage['mode'];
  chapters?: AudioPayloadChapter[];
  pages?: unknown[];
  scenes?: unknown[];
  chapterStoryboards?: unknown[];
  characterPrompts?: unknown[];
  mixGuidePath?: string;
  promptPath?: string;
  guidePath?: string;
  storyboardPromptPath?: string;
  characterPromptPath?: string;
  compliance?: Partial<AdaptationComplianceMetadata>;
};

export type PublishReadyCheckResult = {
  packageId: string;
  publishReady: boolean;
  blockers: string[];
  warnings: string[];
  checkedAt: string;
};

export class AdaptationComplianceChecker {
  private readonly novelsDir: string;
  private readonly logger: Logger;

  constructor(
    novelsDir: string,
    logger: Logger = createLogger('adaptation-compliance-checker'),
  ) {
    this.novelsDir = novelsDir;
    this.logger = logger;
  }

  async check(novelId: string, pack: AdaptationPackage): Promise<PublishReadyCheckResult> {
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (pack.status !== 'passed') {
      blockers.push('改编包尚未通过 QA（status 必须为 passed）');
    }

    const payloadPath = pack.payloadPath.trim();
    if (!payloadPath) {
      blockers.push('改编包 payloadPath 为空');
      return this.buildResult(pack.id, blockers, warnings);
    }

    const payloadAbsolutePath = this.resolvePayloadPath(novelId, payloadPath);
    const payload = await this.loadPayload(payloadAbsolutePath, blockers);
    if (!payload) {
      return this.buildResult(pack.id, blockers, warnings);
    }

    if (payload.mode && payload.mode !== pack.mode) {
      warnings.push(`payload.mode=${payload.mode} 与 package.mode=${pack.mode} 不一致`);
    }

    this.checkCommonCompliance(payload, novelId, blockers);
    await this.checkModeSpecificCompliance(novelId, pack, payload, blockers);

    return this.buildResult(pack.id, blockers, warnings);
  }

  private buildResult(packageId: string, blockers: string[], warnings: string[]): PublishReadyCheckResult {
    return {
      packageId,
      publishReady: blockers.length === 0,
      blockers,
      warnings,
      checkedAt: new Date().toISOString(),
    };
  }

  private getNovelDir(novelId: string): string {
    return resolveNovelStorageDir(this.novelsDir, novelId);
  }

  private resolvePayloadPath(novelId: string, payloadPath: string): string {
    if (path.isAbsolute(payloadPath)) {
      return payloadPath;
    }
    const { validateSafePath } = require('../utils/path-validator.js');
    return validateSafePath(this.getNovelDir(novelId), payloadPath);
  }

  private async loadPayload(payloadAbsolutePath: string, blockers: string[]): Promise<AdaptationPayload | null> {
    try {
      const raw = await fs.readFile(payloadAbsolutePath, 'utf-8');
      return JSON.parse(raw) as AdaptationPayload;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        blockers.push(`改编产物不存在：${payloadAbsolutePath}`);
        return null;
      }
      blockers.push(`改编产物解析失败：${payloadAbsolutePath}`);
      this.logger.warn('读取改编产物失败', {
        payloadAbsolutePath,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private checkCommonCompliance(
    payload: AdaptationPayload,
    novelId: string,
    blockers: string[],
  ): void {
    const compliance = payload.compliance;
    if (!compliance) {
      blockers.push('缺少合规字段 compliance');
      return;
    }

    if (!compliance.aigc?.enabled) {
      blockers.push('缺少 AIGC 标识开关：compliance.aigc.enabled');
    }
    if (!compliance.aigc?.label?.trim()) {
      blockers.push('缺少 AIGC 标识文案：compliance.aigc.label');
    }
    if (!compliance.aigc?.provider?.trim()) {
      blockers.push('缺少 AIGC 生成来源：compliance.aigc.provider');
    }
    if (!compliance.aigc?.generatedAt?.trim()) {
      blockers.push('缺少 AIGC 生成时间：compliance.aigc.generatedAt');
    }

    if (!compliance.rights?.sourceNovelId?.trim()) {
      blockers.push('缺少版权来源字段：compliance.rights.sourceNovelId');
    } else if (compliance.rights.sourceNovelId !== novelId) {
      blockers.push('版权来源字段与当前小说不一致：compliance.rights.sourceNovelId');
    }
    if (!compliance.rights?.copyrightNotice?.trim()) {
      blockers.push('缺少版权声明字段：compliance.rights.copyrightNotice');
    }
    if (!compliance.rights?.authorizingParty?.trim()) {
      blockers.push('缺少授权主体字段：compliance.rights.authorizingParty');
    }
  }

  private async checkModeSpecificCompliance(
    novelId: string,
    pack: AdaptationPackage,
    payload: AdaptationPayload,
    blockers: string[],
  ): Promise<void> {
    if (pack.mode === 'audio') {
      const chapters = payload.chapters ?? [];
      if (chapters.length === 0) {
        blockers.push('有声包缺少章节音频清单：chapters');
        return;
      }

      if (!payload.mixGuidePath?.trim()) {
        blockers.push('有声包缺少混音指引路径：mixGuidePath');
      } else if (!(await this.fileExists(novelId, payload.mixGuidePath))) {
        blockers.push(`有声包混音指引文件不存在：${payload.mixGuidePath}`);
      }

      for (const [index, chapter] of chapters.entries()) {
        const audioPath = chapter.audioPath?.trim();
        if (!audioPath) {
          blockers.push(`有声包第 ${index + 1} 章缺少音频路径：chapters[].audioPath`);
          continue;
        }
        if (!(await this.fileExists(novelId, audioPath))) {
          blockers.push(`有声包音频文件不存在：${audioPath}`);
        }
      }
      return;
    }

    if (pack.mode === 'comic') {
      const pages = payload.pages ?? [];
      if (pages.length === 0) {
        blockers.push('漫画包缺少分镜页：pages');
      }
      if (!payload.promptPath?.trim()) {
        blockers.push('漫画包缺少提示词文件路径：promptPath');
      } else if (!(await this.fileExists(novelId, payload.promptPath))) {
        blockers.push(`漫画包提示词文件不存在：${payload.promptPath}`);
      }
      return;
    }

    const scenes = payload.scenes ?? [];
    if (scenes.length === 0) {
      blockers.push('短剧包缺少场景脚本：scenes');
    }
    const chapterStoryboards = payload.chapterStoryboards ?? [];
    if (chapterStoryboards.length === 0) {
      blockers.push('短剧包缺少按章节分镜：chapterStoryboards');
    }
    const characterPrompts = payload.characterPrompts ?? [];
    if (characterPrompts.length === 0) {
      blockers.push('短剧包缺少角色多视图提示词：characterPrompts');
    }
    if (!payload.guidePath?.trim()) {
      blockers.push('短剧包缺少拍摄指南路径：guidePath');
    } else if (!(await this.fileExists(novelId, payload.guidePath))) {
      blockers.push(`短剧包拍摄指南文件不存在：${payload.guidePath}`);
    }
    if (!payload.storyboardPromptPath?.trim()) {
      blockers.push('短剧包缺少电影分镜提示词路径：storyboardPromptPath');
    } else if (!(await this.fileExists(novelId, payload.storyboardPromptPath))) {
      blockers.push(`短剧包电影分镜提示词文件不存在：${payload.storyboardPromptPath}`);
    }
    if (!payload.characterPromptPath?.trim()) {
      blockers.push('短剧包缺少角色多视图提示词路径：characterPromptPath');
    } else if (!(await this.fileExists(novelId, payload.characterPromptPath))) {
      blockers.push(`短剧包角色多视图提示词文件不存在：${payload.characterPromptPath}`);
    }

    const shortDrama = payload.compliance?.shortDrama;
    if (!shortDrama) {
      blockers.push('短剧包缺少发布合规字段：compliance.shortDrama');
      return;
    }
    if (!shortDrama.filingStatus) {
      blockers.push('短剧包缺少备案状态字段：compliance.shortDrama.filingStatus');
    }
    if (!shortDrama.distributionQualification) {
      blockers.push('短剧包缺少资质状态字段：compliance.shortDrama.distributionQualification');
    }
    if (!shortDrama.aiPerformerConsent) {
      blockers.push('短剧包缺少演员授权状态字段：compliance.shortDrama.aiPerformerConsent');
    }
  }

  private async fileExists(novelId: string, relativePath: string): Promise<boolean> {
    const absolutePath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(this.getNovelDir(novelId), path.normalize(relativePath));
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}
