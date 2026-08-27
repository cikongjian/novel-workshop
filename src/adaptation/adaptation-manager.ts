import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  AdaptationPackage as AdaptationPackageSchema,
  SceneCard as SceneCardSchema,
} from '../novel/types.js';
import type {
  AdaptationMode,
  AdaptationPackage as AdaptationPackageRecord,
  SceneCard,
} from '../novel/types.js';
import { now } from '../utils/text.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { normalizeNovelDataRoot, resolveNovelStorageDir } from '../novel/data-root.js';
import { isPathWithin, resolvePathWithin } from '../utils/path-safety.js';
import type {
  CreateAdaptationPackageInput,
  ListAdaptationPackagesOptions,
  UpdateAdaptationPackageInput,
} from './types.js';

export class AdaptationManager {
  private readonly dataDir: string;
  private readonly logger: Logger;

  constructor(dataDir: string, logger: Logger = createLogger('adaptation-manager')) {
    this.dataDir = normalizeNovelDataRoot(dataDir);
    this.logger = logger;
  }

  async createPackage(input: CreateAdaptationPackageInput): Promise<AdaptationPackageRecord> {
    await this.ensurePackagesDir(input.novelId);
    const timestamp = now();
    const version = await this.nextVersion(input.novelId, input.mode);

    const pack = AdaptationPackageSchema.parse({
      id: randomUUID(),
      novelId: input.novelId,
      chapterNumberStart: input.chapterNumberStart,
      chapterNumberEnd: input.chapterNumberEnd,
      mode: input.mode,
      version,
      status: 'draft',
      payloadPath: input.payloadPath,
      qaReportPath: input.qaReportPath,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await this.writeJsonAtomic(this.packagePath(input.novelId, pack.id), pack);
    this.logger.info('创建改编包', {
      novelId: input.novelId,
      packageId: pack.id,
      mode: input.mode,
      version,
    });
    return pack;
  }

  async listPackages(
    novelId: string,
    options: ListAdaptationPackagesOptions = {},
  ): Promise<AdaptationPackageRecord[]> {
    const packageFiles = await this.listPackageFiles(novelId);
    const entries = await Promise.all(packageFiles.map(async (file) => this.readPackage(file)));
    const packages = entries.filter((item): item is AdaptationPackageRecord => item !== null);

    const filtered = packages.filter((pkg) => {
      if (options.mode && pkg.mode !== options.mode) return false;
      if (options.status && pkg.status !== options.status) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const byCreatedAt = b.createdAt.localeCompare(a.createdAt);
      if (byCreatedAt !== 0) return byCreatedAt;
      return b.version - a.version;
    });

    return filtered;
  }

  async getPackage(novelId: string, packageId: string): Promise<AdaptationPackageRecord | null> {
    return this.readPackage(this.packagePath(novelId, packageId));
  }

  async deletePackage(
    novelId: string,
    packageId: string,
    options: { removeArtifacts?: boolean } = {},
  ): Promise<{ deleted: boolean; removedArtifacts: string[] }> {
    const pack = await this.getPackage(novelId, packageId);
    if (!pack) {
      return { deleted: false, removedArtifacts: [] };
    }

    const removeArtifacts = options.removeArtifacts ?? true;
    const removedArtifacts: string[] = [];
    if (removeArtifacts) {
      const artifactPaths = await this.collectPackageArtifactPaths(novelId, pack);
      for (const artifactPath of artifactPaths) {
        const resolved = this.resolvePathWithinNovel(novelId, artifactPath);
        if (!resolved) continue;
        const removed = await this.safeRemovePath(resolved);
        if (removed) removedArtifacts.push(artifactPath);
      }

      const payloadDir = this.resolvePayloadRunDir(novelId, pack.payloadPath);
      if (payloadDir) {
        const removed = await this.safeRemovePath(payloadDir);
        if (removed) {
          const relative = path.relative(this.novelDir(novelId), payloadDir).split(path.sep).join('/');
          removedArtifacts.push(relative);
        }
      }
    }

    await this.safeRemovePath(this.packagePath(novelId, packageId));
    this.logger.info('删除改编包', {
      novelId,
      packageId,
      removeArtifacts,
      removedArtifactCount: removedArtifacts.length,
    });
    return {
      deleted: true,
      removedArtifacts,
    };
  }

  async updatePackageStatus(
    novelId: string,
    packageId: string,
    input: UpdateAdaptationPackageInput,
  ): Promise<AdaptationPackageRecord> {
    const current = await this.getPackage(novelId, packageId);
    if (!current) {
      throw new Error(`改编包不存在: novel=${novelId} package=${packageId}`);
    }

    const next = AdaptationPackageSchema.parse({
      ...current,
      status: input.status,
      qaReportPath: input.qaReportPath ?? current.qaReportPath,
      updatedAt: now(),
    });

    await this.writeJsonAtomic(this.packagePath(novelId, packageId), next);
    this.logger.info('更新改编包状态', {
      novelId,
      packageId,
      status: input.status,
    });
    return next;
  }

  async saveSceneCards(novelId: string, chapterNumber: number, cards: SceneCard[]): Promise<SceneCard[]> {
    const parsedCards = cards.map((card) => SceneCardSchema.parse(card));
    const payload = {
      chapterNumber,
      cards: parsedCards,
      updatedAt: now(),
    };

    await this.writeJsonAtomic(this.sceneCardsPath(novelId, chapterNumber), payload);
    this.logger.info('保存场景卡', {
      novelId,
      chapterNumber,
      cardCount: parsedCards.length,
    });
    return parsedCards;
  }

  async getSceneCards(novelId: string, chapterNumber: number): Promise<SceneCard[]> {
    const payload = await this.readSceneCardsPayload(this.sceneCardsPath(novelId, chapterNumber));
    return payload?.cards ?? [];
  }

  async saveQAReport(
    novelId: string,
    packageId: string,
    report: unknown,
    reportPath?: string,
  ): Promise<string> {
    const relativePath = reportPath?.trim() || `adaptations/reports/${packageId}.qa.json`;
    const absolutePath = this.resolvePathWithinNovel(novelId, relativePath);
    if (!absolutePath) throw new Error('QA_REPORT_PATH_INVALID');

    await this.writeJsonAtomic(absolutePath, report);
    this.logger.info('保存改编 QA 报告', {
      novelId,
      packageId,
      reportPath: relativePath,
    });
    return relativePath;
  }

  private novelDir(novelId: string): string {
    return resolveNovelStorageDir(this.dataDir, novelId);
  }

  private adaptationDir(novelId: string): string {
    return path.join(this.novelDir(novelId), 'adaptations');
  }

  private packagesDir(novelId: string): string {
    return path.join(this.adaptationDir(novelId), 'packages');
  }

  private packagePath(novelId: string, packageId: string): string {
    return resolvePathWithin(this.packagesDir(novelId), `${packageId}.json`);
  }

  private sceneCardsDir(novelId: string): string {
    return path.join(this.adaptationDir(novelId), 'scene-cards');
  }

  private sceneCardsPath(novelId: string, chapterNumber: number): string {
    const chapterFile = String(chapterNumber).padStart(3, '0');
    return path.join(this.sceneCardsDir(novelId), `${chapterFile}.json`);
  }

  private async ensurePackagesDir(novelId: string): Promise<void> {
    await fs.mkdir(this.packagesDir(novelId), { recursive: true });
  }

  private async nextVersion(novelId: string, mode: AdaptationMode): Promise<number> {
    const packages = await this.listPackages(novelId, { mode });
    const maxVersion = packages.reduce((max, item) => Math.max(max, item.version), 0);
    return maxVersion + 1;
  }

  private async listPackageFiles(novelId: string): Promise<string[]> {
    const dir = this.packagesDir(novelId);
    try {
      const files = await fs.readdir(dir, { withFileTypes: true });
      return files
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => path.join(dir, entry.name));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  private resolvePathWithinNovel(novelId: string, filePath: string): string | null {
    const base = this.novelDir(novelId);
    let absolutePath: string;
    try {
      absolutePath = path.isAbsolute(filePath) ? path.resolve(filePath) : resolvePathWithin(base, filePath);
    } catch {
      return null;
    }
    if (!this.isPathWithin(base, absolutePath)) return null;
    return absolutePath;
  }

  private isPathWithin(root: string, target: string): boolean {
    return isPathWithin(root, target);
  }

  private async safeRemovePath(fileOrDir: string): Promise<boolean> {
    try {
      await fs.rm(fileOrDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  private resolvePayloadRunDir(novelId: string, payloadPath: string): string | null {
    const payloadAbsolute = this.resolvePathWithinNovel(novelId, payloadPath);
    if (!payloadAbsolute) return null;
    const runDir = path.dirname(payloadAbsolute);
    const adaptationBase = this.adaptationDir(novelId);
    if (!this.isPathWithin(adaptationBase, runDir)) {
      return null;
    }
    const basename = path.basename(runDir);
    if (!basename.startsWith('run-')) {
      return null;
    }
    return runDir;
  }

  private async collectPackageArtifactPaths(
    novelId: string,
    pack: AdaptationPackageRecord,
  ): Promise<string[]> {
    const paths = new Set<string>();
    if (pack.payloadPath?.trim()) paths.add(pack.payloadPath.trim());
    if (pack.qaReportPath?.trim()) paths.add(pack.qaReportPath.trim());

    const payloadAbsolute = this.resolvePathWithinNovel(novelId, pack.payloadPath);
    if (!payloadAbsolute) {
      return Array.from(paths);
    }

    try {
      const raw = await fs.readFile(payloadAbsolute, 'utf-8');
      const payload = JSON.parse(raw) as unknown;
      for (const p of this.extractPathLikeStrings(payload)) {
        paths.add(p);
      }
    } catch {
      // payload 缺失或损坏时，仅删除已知主路径
    }
    return Array.from(paths);
  }

  private extractPathLikeStrings(payload: unknown): string[] {
    const collected = new Set<string>();
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (typeof value === 'string' && isPathLikeKey(key)) {
          const trimmed = value.trim();
          if (trimmed.length > 0) collected.add(trimmed);
          continue;
        }
        if (Array.isArray(value) && isPathLikeKey(key)) {
          for (const item of value) {
            if (typeof item === 'string' && item.trim().length > 0) {
              collected.add(item.trim());
            }
          }
          continue;
        }
        walk(value);
      }
    };
    walk(payload);
    return Array.from(collected);
  }

  private async readPackage(filePath: string): Promise<AdaptationPackageRecord | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return AdaptationPackageSchema.parse(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      this.logger.warn('改编包读取失败，已跳过', {
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = `${filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  private async readSceneCardsPayload(
    filePath: string,
  ): Promise<{ chapterNumber: number; cards: SceneCard[]; updatedAt: string } | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        chapterNumber: number;
        cards: unknown[];
        updatedAt: string;
      };

      return {
        chapterNumber: parsed.chapterNumber,
        cards: (parsed.cards ?? []).map((card) => SceneCardSchema.parse(card)),
        updatedAt: parsed.updatedAt,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      this.logger.warn('场景卡读取失败，已返回空结果', {
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}

function isPathLikeKey(key: string): boolean {
  return (
    key.endsWith('Path')
    || key.endsWith('Paths')
    || key.toLowerCase().includes('path')
  );
}
