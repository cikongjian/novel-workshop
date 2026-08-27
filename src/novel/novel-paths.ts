import path from 'node:path';
import { normalizeNovelDataRoot, resolveNovelStorageDir } from './data-root.js';

/**
 * 小说文件路径解析器
 * 统一管理所有数据文件的路径计算，供 NovelManager 和各 repository 使用。
 */
export class NovelPaths {
  constructor(private dataDir: string) {
    this.dataDir = normalizeNovelDataRoot(dataDir);
  }

  /** novels 根目录 */
  novelsDir(): string {
    return path.join(this.dataDir, 'novels');
  }

  /** 小说目录 */
  novelDir(novelId: string): string {
    return resolveNovelStorageDir(this.dataDir, novelId);
  }

  legacyNovelsDir(): string {
    return path.join(this.dataDir, 'novels', 'novels');
  }

  /** 回收站目录 */
  trashDir(novelId: string): string {
    return path.join(this.dataDir, 'trash', novelId);
  }

  /** 回收站根目录 */
  trashBase(): string {
    return path.join(this.dataDir, 'trash');
  }

  novelMetaPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'novel.json');
  }

  constitutionVersionsPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'constitution-versions.json');
  }

  worldPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'world.json');
  }

  charactersPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'characters.json');
  }

  pendingCharactersPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'pending-characters.json');
  }

  outlinePath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'outline.json');
  }

  characterStatesPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'character-states.json');
  }

  quoteCleanupFeedbackPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'quote-cleanup-feedback.json');
  }

  factGraphPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'fact-graph.json');
  }

  plotBranchesPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'plot-branches.json');
  }

  costDataPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'cost-data.json');
  }

  chaptersDir(novelId: string): string {
    return path.join(this.novelDir(novelId), 'chapters');
  }

  /** 章节编号格式化为 3 位补零 */
  chapterFileName(chapterNumber: number): string {
    return String(chapterNumber).padStart(3, '0');
  }

  chapterContentPath(novelId: string, chapterNumber: number): string {
    return path.join(
      this.chaptersDir(novelId),
      `${this.chapterFileName(chapterNumber)}.md`,
    );
  }

  chapterMetaPath(novelId: string, chapterNumber: number): string {
    return path.join(
      this.chaptersDir(novelId),
      `${this.chapterFileName(chapterNumber)}.json`,
    );
  }

  chapterVersionsPath(novelId: string, chapterNumber: number): string {
    return path.join(
      this.chaptersDir(novelId),
      `${this.chapterFileName(chapterNumber)}-versions.json`,
    );
  }

  // ==================== 角色事件路径 ====================

  /** 旧版单文件路径（迁移用） */
  characterEventsLegacyPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'character-events.json');
  }

  /** 新版按章拆分目录 */
  characterEventsDir(novelId: string): string {
    return path.join(this.novelDir(novelId), 'character-events');
  }

  characterEventsFilePath(novelId: string, chapterNumber: number): string {
    return path.join(this.characterEventsDir(novelId), `${chapterNumber}.json`);
  }

  /** 角色高光（金句 + 场面）单文件存储 */
  characterHighlightsPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'character-highlights.json');
  }

  /** 角色关系（对话交锋）单文件存储 */
  characterRelationsPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'character-relations.json');
  }

  // ==================== 章节事实路径 ====================

  /** 旧版单文件路径（迁移用） */
  chapterFactsLegacyPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'chapter-facts.json');
  }

  /** 新版按章拆分目录 */
  chapterFactsDir(novelId: string): string {
    return path.join(this.novelDir(novelId), 'chapter-facts');
  }

  chapterFactFilePath(novelId: string, chapterNumber: number): string {
    return path.join(this.chapterFactsDir(novelId), `${chapterNumber}.json`);
  }

  // ==================== 其他数据路径 ====================

  pacingPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'pacing.json');
  }

  plotThreadSnapshotsPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'plot-thread-snapshots.json');
  }

  outlineDeviationsPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'outline-deviations.json');
  }

  collaborationLogPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'collaboration-logs.json');
  }

  styleDnaPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'style-dna.json');
  }

  knowledgeGraphPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'knowledge-graph.json');
  }

  reflogPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'state-reflog.json');
  }

  contextIgnoreRulesPath(novelId: string): string {
    return path.join(this.novelDir(novelId), 'context-ignore-rules.json');
  }
}
