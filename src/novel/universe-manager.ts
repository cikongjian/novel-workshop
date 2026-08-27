import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  UniverseMetadata,
  UniverseNovelRef,
  UniverseRelation,
  UniverseRelationType,
} from './universe-types.js';

const UNIVERSE_DIR = 'universes';
const UNIVERSE_META_FILE = 'universe.json';

export class UniverseManager {
  private static readonly RELATION_LABELS: Record<UniverseRelationType, string> = {
    'mainline-next': '主线下一部',
    'side-story': '外传',
    parallel: '平行篇',
    prequel: '前传',
    sequel: '续作',
    'alt-branch': '分歧线',
  };

  constructor(private readonly dataDir: string) {}

  private universeDir(universeId: string): string {
    return path.join(this.dataDir, UNIVERSE_DIR, universeId);
  }

  private universeMetaPath(universeId: string): string {
    return path.join(this.universeDir(universeId), UNIVERSE_META_FILE);
  }

  async createUniverse(params: {
    title: string;
    description?: string;
    corePremise?: string;
    sharedWorldRules?: string;
    timelineBaseline?: string;
    ownerId?: string;
  }): Promise<UniverseMetadata> {
    const now = new Date().toISOString();
    const universe: UniverseMetadata = {
      id: randomUUID(),
      ownerId: params.ownerId,
      title: params.title,
      description: params.description ?? '',
      corePremise: params.corePremise ?? '',
      sharedWorldRules: params.sharedWorldRules ?? '',
      timelineBaseline: params.timelineBaseline ?? '',
      novels: [],
      relations: [],
      createdAt: now,
      updatedAt: now,
    };
    return this.writeUniverse(universe);
  }

  async getUniverse(universeId: string): Promise<UniverseMetadata | null> {
    try {
      const raw = await fs.readFile(this.universeMetaPath(universeId), 'utf-8');
      return this.normalizeUniverse(JSON.parse(raw) as UniverseMetadata);
    } catch {
      return null;
    }
  }

  async listUniverses(): Promise<UniverseMetadata[]> {
    const baseDir = path.join(this.dataDir, UNIVERSE_DIR);
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      const results: UniverseMetadata[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const universe = await this.getUniverse(entry.name);
        if (universe) results.push(universe);
      }
      return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  async updateUniverse(
    universeId: string,
    updates: Partial<Pick<UniverseMetadata, 'title' | 'description' | 'corePremise' | 'sharedWorldRules' | 'timelineBaseline'>>,
  ): Promise<UniverseMetadata | null> {
    const universe = await this.getUniverse(universeId);
    if (!universe) return null;

    if (updates.title !== undefined) universe.title = updates.title;
    if (updates.description !== undefined) universe.description = updates.description;
    if (updates.corePremise !== undefined) universe.corePremise = updates.corePremise;
    if (updates.sharedWorldRules !== undefined) universe.sharedWorldRules = updates.sharedWorldRules;
    if (updates.timelineBaseline !== undefined) universe.timelineBaseline = updates.timelineBaseline;
    universe.updatedAt = new Date().toISOString();

    return this.writeUniverse(universe);
  }

  async deleteUniverse(universeId: string): Promise<boolean> {
    try {
      await fs.rm(this.universeDir(universeId), { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  async addNovel(
    universeId: string,
    ref: Omit<UniverseNovelRef, 'createdAt' | 'updatedAt'>,
  ): Promise<UniverseMetadata | null> {
    const universe = await this.getUniverse(universeId);
    if (!universe) return null;

    const now = new Date().toISOString();
    const existing = universe.novels.find((novel) => novel.novelId === ref.novelId);
    if (existing) {
      existing.title = ref.title;
      existing.genre = ref.genre;
      existing.status = ref.status;
      existing.notes = ref.notes ?? '';
      existing.updatedAt = now;
    } else {
      universe.novels.push({
        novelId: ref.novelId,
        title: ref.title,
        genre: ref.genre,
        status: ref.status,
        notes: ref.notes ?? '',
        createdAt: now,
        updatedAt: now,
      });
    }

    universe.updatedAt = now;
    return this.writeUniverse(universe);
  }

  async removeNovel(universeId: string, novelId: string): Promise<UniverseMetadata | null> {
    const universe = await this.getUniverse(universeId);
    if (!universe) return null;

    universe.novels = universe.novels.filter((novel) => novel.novelId !== novelId);
    universe.relations = universe.relations.filter(
      (relation) => relation.fromNovelId !== novelId && relation.toNovelId !== novelId,
    );
    universe.updatedAt = new Date().toISOString();

    return this.writeUniverse(universe);
  }

  async findUniverseByNovel(novelId: string): Promise<UniverseMetadata | null> {
    const universes = await this.listUniverses();
    return universes.find((universe) => universe.novels.some((novel) => novel.novelId === novelId)) ?? null;
  }

  buildUniverseContext(universe: UniverseMetadata, currentNovelId: string): string {
    if (!this.hasNovel(universe, currentNovelId)) return '';

    const currentNovel = universe.novels.find((novel) => novel.novelId === currentNovelId) ?? null;
    const related = universe.relations.filter((relation) => (
      relation.fromNovelId === currentNovelId || relation.toNovelId === currentNovelId
    ));
    const otherWorks = universe.novels.filter((novel) => novel.novelId !== currentNovelId);

    if (!universe.corePremise && !universe.sharedWorldRules && !universe.timelineBaseline && related.length === 0 && otherWorks.length === 0) {
      return '';
    }

    const parts: string[] = ['## 🌌 宇宙上下文\n'];
    parts.push(`宇宙名：${universe.title}`);
    if (currentNovel) {
      parts.push(`当前作品：${currentNovel.title}`);
    }
    if (universe.corePremise) {
      parts.push(`### 核心母题\n${universe.corePremise}\n`);
    }
    if (universe.sharedWorldRules) {
      parts.push(`### 共享世界规则\n${universe.sharedWorldRules}\n`);
    }
    if (universe.timelineBaseline) {
      parts.push(`### 时间基线\n${universe.timelineBaseline}\n`);
    }
    if (related.length > 0) {
      parts.push('### 当前作品的关联关系');
      for (const relation of related) {
        const source = universe.novels.find((novel) => novel.novelId === relation.fromNovelId)?.title ?? relation.fromNovelId;
        const target = universe.novels.find((novel) => novel.novelId === relation.toNovelId)?.title ?? relation.toNovelId;
        parts.push(`- ${UniverseManager.RELATION_LABELS[relation.type]}：${source} -> ${target}`);
        if (relation.timelineSpan) parts.push(`  时间定位：${relation.timelineSpan}`);
        if (relation.spoilerCeiling) parts.push(`  剧透上限：${relation.spoilerCeiling}`);
        if (relation.notes) parts.push(`  备注：${relation.notes}`);
      }
      parts.push('');
    }
    if (otherWorks.length > 0) {
      parts.push('### 宇宙内其他作品');
      for (const novel of otherWorks) {
        parts.push(`- ${novel.title}${novel.notes ? `：${novel.notes}` : ''}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  async addRelation(
    universeId: string,
    relation: {
      fromNovelId: string;
      toNovelId: string;
      type: UniverseRelationType;
      anchorChapterNumber?: number;
      timelineSpan?: string;
      spoilerCeiling?: string;
      inheritWorld?: boolean;
      inheritCharacters?: boolean;
      inheritForeshadowing?: boolean;
      notes?: string;
    },
  ): Promise<UniverseMetadata | null> {
    const universe = await this.getUniverse(universeId);
    if (!universe) return null;
    if (!this.hasNovel(universe, relation.fromNovelId) || !this.hasNovel(universe, relation.toNovelId)) {
      return null;
    }

    const now = new Date().toISOString();
    const item: UniverseRelation = {
      id: randomUUID(),
      fromNovelId: relation.fromNovelId,
      toNovelId: relation.toNovelId,
      type: relation.type,
      anchorChapterNumber: relation.anchorChapterNumber,
      timelineSpan: relation.timelineSpan ?? '',
      spoilerCeiling: relation.spoilerCeiling ?? '',
      inheritWorld: relation.inheritWorld ?? true,
      inheritCharacters: relation.inheritCharacters ?? true,
      inheritForeshadowing: relation.inheritForeshadowing ?? true,
      notes: relation.notes ?? '',
      createdAt: now,
      updatedAt: now,
    };

    universe.relations.push(item);
    universe.updatedAt = now;
    return this.writeUniverse(universe);
  }

  async updateRelation(
    universeId: string,
    relationId: string,
    updates: Partial<Omit<UniverseRelation, 'id' | 'createdAt' | 'fromNovelId' | 'toNovelId'>>,
  ): Promise<UniverseMetadata | null> {
    const universe = await this.getUniverse(universeId);
    if (!universe) return null;

    const relation = universe.relations.find((item) => item.id === relationId);
    if (!relation) return null;

    if (updates.type !== undefined) relation.type = updates.type;
    if (updates.anchorChapterNumber !== undefined) relation.anchorChapterNumber = updates.anchorChapterNumber;
    if (updates.timelineSpan !== undefined) relation.timelineSpan = updates.timelineSpan;
    if (updates.spoilerCeiling !== undefined) relation.spoilerCeiling = updates.spoilerCeiling;
    if (updates.inheritWorld !== undefined) relation.inheritWorld = updates.inheritWorld;
    if (updates.inheritCharacters !== undefined) relation.inheritCharacters = updates.inheritCharacters;
    if (updates.inheritForeshadowing !== undefined) relation.inheritForeshadowing = updates.inheritForeshadowing;
    if (updates.notes !== undefined) relation.notes = updates.notes;
    relation.updatedAt = new Date().toISOString();
    universe.updatedAt = relation.updatedAt;

    return this.writeUniverse(universe);
  }

  async removeRelation(universeId: string, relationId: string): Promise<UniverseMetadata | null> {
    const universe = await this.getUniverse(universeId);
    if (!universe) return null;

    universe.relations = universe.relations.filter((item) => item.id !== relationId);
    universe.updatedAt = new Date().toISOString();
    return this.writeUniverse(universe);
  }

  private hasNovel(universe: UniverseMetadata, novelId: string): boolean {
    return universe.novels.some((novel) => novel.novelId === novelId);
  }

  private normalizeUniverse(universe: UniverseMetadata): UniverseMetadata {
    const next: UniverseMetadata = JSON.parse(JSON.stringify(universe)) as UniverseMetadata;
    next.description = next.description ?? '';
    next.corePremise = next.corePremise ?? '';
    next.sharedWorldRules = next.sharedWorldRules ?? '';
    next.timelineBaseline = next.timelineBaseline ?? '';
    next.novels = (next.novels ?? []).map((novel) => ({
      ...novel,
      notes: novel.notes ?? '',
    }));
    next.relations = (next.relations ?? []).filter((relation) => (
      this.hasNovel(next, relation.fromNovelId) && this.hasNovel(next, relation.toNovelId)
    )).map((relation) => ({
      ...relation,
      timelineSpan: relation.timelineSpan ?? '',
      spoilerCeiling: relation.spoilerCeiling ?? '',
      notes: relation.notes ?? '',
      inheritWorld: relation.inheritWorld ?? true,
      inheritCharacters: relation.inheritCharacters ?? true,
      inheritForeshadowing: relation.inheritForeshadowing ?? true,
    }));
    return next;
  }

  private async writeUniverse(universe: UniverseMetadata): Promise<UniverseMetadata> {
    const normalized = this.normalizeUniverse(universe);
    const dir = this.universeDir(normalized.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.universeMetaPath(normalized.id), JSON.stringify(normalized, null, 2), 'utf-8');
    return normalized;
  }
}
