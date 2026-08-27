import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  UniverseAnchor,
  CharacterPoolCandidate,
  AnchorWorldSnapshot,
  AnchorForeshadowing,
  AnchorLink,
  AnchorTimeRelation,
} from './story-state-types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('universe-anchor');
const ANCHOR_DIR = 'anchors';
const ANCHOR_FILE = 'anchor.json';

/**
 * 宇宙锚点管理器
 * 管理完结小说的冻结快照，支持跨书共享宇宙
 *
 * 存储结构：
 * data/anchors/{anchorId}/anchor.json
 * data/novels/{novelId}/anchor-links.json  (衍生小说的锚点关联)
 */
export class UniverseAnchorManager {
  constructor(private readonly dataDir: string) {}

  // ==================== 路径工具 ====================

  private anchorDir(anchorId: string): string {
    return path.join(this.dataDir, ANCHOR_DIR, anchorId);
  }

  private anchorPath(anchorId: string): string {
    return path.join(this.anchorDir(anchorId), ANCHOR_FILE);
  }

  private anchorLinksPath(novelId: string): string {
    return path.join(this.dataDir, 'novels', novelId, 'anchor-links.json');
  }

  // ==================== 锚点 CRUD ====================

  /** 创建宇宙锚点（从完结小说生成） */
  async createAnchor(params: {
    sourceNovelId: string;
    sourceNovelTitle: string;
    world: AnchorWorldSnapshot;
    characterPool: CharacterPoolCandidate[];
    foreshadowing: AnchorForeshadowing[];
    storySummary: string;
  }): Promise<UniverseAnchor> {
    const now = new Date().toISOString();
    const anchor: UniverseAnchor = {
      id: randomUUID(),
      sourceNovelId: params.sourceNovelId,
      sourceNovelTitle: params.sourceNovelTitle,
      world: params.world,
      characterPool: params.characterPool,
      foreshadowing: params.foreshadowing,
      storySummary: params.storySummary,
      frozenAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await this.writeAnchor(anchor);
    log.info('锚点已创建', { anchorId: anchor.id, source: params.sourceNovelTitle });
    return anchor;
  }

  async getAnchor(anchorId: string): Promise<UniverseAnchor | null> {
    try {
      const raw = await fs.readFile(this.anchorPath(anchorId), 'utf-8');
      return JSON.parse(raw) as UniverseAnchor;
    } catch {
      return null;
    }
  }

  async listAnchors(): Promise<UniverseAnchor[]> {
    const baseDir = path.join(this.dataDir, ANCHOR_DIR);
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      const results: UniverseAnchor[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const anchor = await this.getAnchor(entry.name);
          if (anchor) results.push(anchor);
        }
      }
      return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  /** 查找某小说生成的锚点 */
  async findAnchorByNovel(novelId: string): Promise<UniverseAnchor | null> {
    const all = await this.listAnchors();
    return all.find(a => a.sourceNovelId === novelId) ?? null;
  }

  async deleteAnchor(anchorId: string): Promise<boolean> {
    try {
      await fs.rm(this.anchorDir(anchorId), { recursive: true, force: true });
      log.info('锚点已删除', { anchorId });
      return true;
    } catch {
      return false;
    }
  }

  private async writeAnchor(anchor: UniverseAnchor): Promise<void> {
    const dir = this.anchorDir(anchor.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.anchorPath(anchor.id), JSON.stringify(anchor, null, 2), 'utf-8');
  }

  // ==================== 角色池管理 ====================

  /** 用户确认候选角色入池（批量） */
  async confirmCharacters(anchorId: string, characterIds: string[]): Promise<UniverseAnchor | null> {
    const anchor = await this.getAnchor(anchorId);
    if (!anchor) return null;
    const idSet = new Set(characterIds);
    for (const c of anchor.characterPool) {
      if (idSet.has(c.characterId)) {
        c.confirmed = true;
      }
    }
    anchor.updatedAt = new Date().toISOString();
    await this.writeAnchor(anchor);
    return anchor;
  }

  /** 用户取消角色入池 */
  async removeCharacterFromPool(anchorId: string, characterId: string): Promise<UniverseAnchor | null> {
    const anchor = await this.getAnchor(anchorId);
    if (!anchor) return null;
    const target = anchor.characterPool.find(c => c.characterId === characterId);
    if (target) target.confirmed = false;
    anchor.updatedAt = new Date().toISOString();
    await this.writeAnchor(anchor);
    return anchor;
  }

  /** 获取已确认入池的角色 */
  getConfirmedCharacters(anchor: UniverseAnchor): CharacterPoolCandidate[] {
    return anchor.characterPool.filter(c => c.confirmed);
  }

  // ==================== 锚点关联（衍生小说侧） ====================

  /** 为衍生小说添加锚点关联 */
  async linkAnchor(novelId: string, link: AnchorLink): Promise<AnchorLink[]> {
    const links = await this.getAnchorLinks(novelId);
    // 去重：同一锚点不重复关联
    if (links.some(l => l.anchorId === link.anchorId)) {
      return links;
    }
    links.push(link);
    links.sort((a, b) => a.priority - b.priority);
    await this.writeAnchorLinks(novelId, links);
    log.info('锚点已关联', { novelId, anchorId: link.anchorId, relation: link.timeRelation });
    return links;
  }

  /** 移除锚点关联 */
  async unlinkAnchor(novelId: string, anchorId: string): Promise<AnchorLink[]> {
    let links = await this.getAnchorLinks(novelId);
    links = links.filter(l => l.anchorId !== anchorId);
    await this.writeAnchorLinks(novelId, links);
    return links;
  }

  /** 更新锚点关联（时间关系、优先级） */
  async updateAnchorLink(novelId: string, anchorId: string, updates: {
    timeRelation?: AnchorTimeRelation;
    priority?: number;
  }): Promise<AnchorLink[]> {
    const links = await this.getAnchorLinks(novelId);
    const target = links.find(l => l.anchorId === anchorId);
    if (target) {
      if (updates.timeRelation) target.timeRelation = updates.timeRelation;
      if (updates.priority != null) target.priority = updates.priority;
      links.sort((a, b) => a.priority - b.priority);
    }
    await this.writeAnchorLinks(novelId, links);
    return links;
  }

  /** 获取衍生小说的所有锚点关联 */
  async getAnchorLinks(novelId: string): Promise<AnchorLink[]> {
    try {
      const raw = await fs.readFile(this.anchorLinksPath(novelId), 'utf-8');
      return JSON.parse(raw) as AnchorLink[];
    } catch {
      return [];
    }
  }

  private async writeAnchorLinks(novelId: string, links: AnchorLink[]): Promise<void> {
    await fs.writeFile(this.anchorLinksPath(novelId), JSON.stringify(links, null, 2), 'utf-8');
  }

  // ==================== 上下文构建（注入写作管线） ====================

  private static readonly TIME_RELATION_LABELS: Record<string, string> = {
    prequel: '前传',
    parallel: '同时代平行',
    sequel: '续作',
  };

  private static readonly CROSS_BOOK_VALUE_LABELS: Record<string, string> = {
    boss: '大佬/BOSS',
    mysterious: '神秘人物',
    transitional: '承上启下',
    recurring: '常驻角色',
  };

  /**
   * 为衍生小说构建锚点上下文（注入 Writer/Editor Agent）
   * 按优先级合并多个锚点的信息
   */
  async buildAnchorContext(novelId: string): Promise<string> {
    const links = await this.getAnchorLinks(novelId);
    if (links.length === 0) return '';

    const parts: string[] = ['## 🌐 共享宇宙锚点\n'];
    parts.push('以下是本书所处宇宙的已确立设定，写作时必须与之保持一致。\n');

    for (const link of links) {
      const anchor = await this.getAnchor(link.anchorId);
      if (!anchor) continue;

      const relation = UniverseAnchorManager.TIME_RELATION_LABELS[link.timeRelation] ?? link.timeRelation;
      parts.push(`### 锚点：《${anchor.sourceNovelTitle}》（${relation}）\n`);

      if (anchor.storySummary) {
        parts.push(`**故事概要**：${anchor.storySummary}\n`);
      }

      // 世界基底
      parts.push(this.buildWorldSection(anchor, link.timeRelation));

      // 角色池
      parts.push(this.buildCharacterSection(anchor, link.timeRelation));

      // 伏笔
      parts.push(this.buildForeshadowingSection(anchor, link.timeRelation));
    }

    return parts.filter(Boolean).join('\n');
  }

  private buildWorldSection(anchor: UniverseAnchor, relation: AnchorTimeRelation): string {
    const entries = anchor.world.entries;
    if (entries.length === 0) return '';

    const parts: string[] = ['**世界基底设定**（不可违背）：'];

    const byCategory = new Map<string, typeof entries>();
    for (const e of entries) {
      const list = byCategory.get(e.category) ?? [];
      list.push(e);
      byCategory.set(e.category, list);
    }

    const categoryLabels: Record<string, string> = {
      geography: '地理', history: '历史', faction: '势力',
      power: '力量体系', culture: '文化', rule: '世界法则', other: '其他',
    };

    for (const [cat, items] of byCategory) {
      const label = categoryLabels[cat] ?? cat;
      parts.push(`\n【${label}】`);
      for (const item of items.slice(0, 20)) {
        parts.push(`- ${item.name}：${item.description.slice(0, 200)}`);
      }
    }

    if (relation === 'prequel') {
      parts.push('\n> 注意：本书是前传，上述设定在本书时代可能尚未完全形成，请合理推演其早期形态。');
    } else if (relation === 'sequel' && anchor.world.factionEndStates.length > 0) {
      parts.push('\n**势力终态**（续作初始格局）：');
      for (const f of anchor.world.factionEndStates) {
        parts.push(`- ${f.factionName}：${f.phase}，实力 ${f.powerLevel}/100${f.description ? `，${f.description}` : ''}`);
      }
    }

    return parts.join('\n') + '\n';
  }

  private buildCharacterSection(anchor: UniverseAnchor, relation: AnchorTimeRelation): string {
    const confirmed = this.getConfirmedCharacters(anchor);
    if (confirmed.length === 0) return '';

    const parts: string[] = ['**跨书角色池**：'];

    for (const c of confirmed) {
      const valueLabel = UniverseAnchorManager.CROSS_BOOK_VALUE_LABELS[c.crossBookValue] ?? c.crossBookValue;
      parts.push(`- ${c.name}（${valueLabel}）：${c.lastKnownState}`);
      if (c.abilitySummary) parts.push(`  能力：${c.abilitySummary}`);
      if (c.narrativeHooks.length > 0) {
        parts.push(`  叙事钩子：${c.narrativeHooks.join('；')}`);
      }
    }

    if (relation === 'prequel') {
      parts.push('\n> 前传中这些角色可能更年轻、地位更低，或尚未出生。');
    } else if (relation === 'parallel') {
      parts.push('\n> 平行视角中这些角色可能在远处被提及或偶尔客串，不必强行出场。');
    }

    return parts.join('\n') + '\n';
  }

  private buildForeshadowingSection(anchor: UniverseAnchor, _relation: AnchorTimeRelation): string {
    const unresolved = anchor.foreshadowing.filter(f => !f.resolvedInAnchor);
    if (unresolved.length === 0) return '';

    const parts: string[] = ['**跨书伏笔**（可在本书中兑现或延续）：'];
    for (const f of unresolved) {
      parts.push(`- 第${f.plantedInChapter}章埋下：${f.hint}`);
      if (f.resolutionHint) parts.push(`  兑现方向：${f.resolutionHint}`);
    }

    return parts.join('\n') + '\n';
  }
}
