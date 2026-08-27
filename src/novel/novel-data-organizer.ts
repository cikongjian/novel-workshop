import { createHash } from 'node:crypto';
import type { BackupInfo } from '../backup/backup-manager.js';
import {
  mergeArchivedMilestoneSummary,
  mergeChapterHistory,
  mergeGrowthMilestones,
} from '../pipeline/character-profile-merge.js';
import { projectCharacterIdentityLabels } from './character-identity-labels.js';
import { writeJson } from './fs-helpers.js';
import { NovelPaths } from './novel-paths.js';
import type { NovelManager } from './novel-manager.js';
import type { NovelMemory } from '../memory/novel-memory.js';
import { rebuildOutlineFromChapters } from './outline-repository.js';
import type { CharacterProfile } from './types.js';
import {
  promoteRecurringCharacters,
  selectRecurringCharacterCandidates,
} from '../services/recurring-character-promotion.js';
import {
  applyAutoProtagonistReconciliation,
  loadAutoProtagonistReconciliationPlan,
  type AutoProtagonistReconciliationPlan,
} from '../services/auto-protagonist-reconciliation.js';
import {
  applyCharacterStatusReconciliation,
  loadCharacterStatusReconciliationPlan,
  type CharacterStatusReconciliationPlan,
} from '../services/character-status-reconciliation.js';
import {
  auditNovelData,
  buildAuditReport,
  type NovelDataAuditReport,
} from './novel-data-audit.js';
import {
  loadNovelMaintenanceSnapshot,
  type NovelMaintenanceSnapshot,
} from './novel-maintenance-snapshot.js';
import { withNovelMaintenanceLock } from './novel-maintenance-lock.js';
import {
  applyFinalizationOrganizationRepair,
  applyFactOrganizationRepair,
  applyThreadOrganizationRepair,
  loadStructuralOrganizationPlan,
  type StructuralOrganizationPlan,
} from './novel-organization-structural-repair.js';
import {
  applyOrphanRelationshipRepairs,
  planOrphanRelationshipRepairs,
} from './novel-relationship-repair.js';

export const NovelOrganizationScopeValues = [
  'characters',
  'metadata',
  'outline',
  'threads',
  'finalization',
  'facts',
] as const;
export type NovelOrganizationScope = typeof NovelOrganizationScopeValues[number];

export type NovelOrganizationChange = {
  scope: NovelOrganizationScope;
  changed: boolean;
  message: string;
  affectedEntries: number;
};

export type NovelOrganizationResult = {
  mode: 'dry-run' | 'apply';
  novelId: string;
  planToken: string;
  plannedAt: string;
  backup?: Pick<BackupInfo, 'id' | 'size' | 'createdAt'>;
  changes: NovelOrganizationChange[];
  reportBefore: NovelDataAuditReport;
  reportAfter?: NovelDataAuditReport;
};

type BackupCreator = {
  createBackup(novelId: string): Promise<BackupInfo>;
};

export class NovelOrganizationPlanConflictError extends Error {
  constructor() {
    super('小说数据在预览后发生变化，请重新生成整理计划');
    this.name = 'NovelOrganizationPlanConflictError';
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nestedValue: unknown) => {
    if (!nestedValue || typeof nestedValue !== 'object' || Array.isArray(nestedValue)) {
      return nestedValue;
    }
    return Object.fromEntries(
      Object.entries(nestedValue).sort(([left], [right]) => left.localeCompare(right)),
    );
  });
}

export function createNovelOrganizationPlanToken(
  snapshot: NovelMaintenanceSnapshot,
  scopes: NovelOrganizationScope[],
  structuralPlan?: StructuralOrganizationPlan,
  rolePlans?: {
    protagonist?: AutoProtagonistReconciliationPlan | null;
    statuses?: CharacterStatusReconciliationPlan[];
  },
): string {
  const selected = [...new Set(scopes)].sort();
  const payload = {
    novelId: snapshot.novel.id,
    scopes: selected,
    characters: selected.includes('characters')
      ? {
          profilesSource: snapshot.charactersSource,
          pendingSource: snapshot.pendingCharactersSource,
          rolePlans,
        }
      : undefined,
    metadata: selected.includes('metadata')
      ? {
          persisted: snapshot.persistedMetadataStats,
          chapters: snapshot.chapters.map(chapter => ({
            chapterNumber: chapter.chapterNumber,
            status: chapter.status,
            wordCount: chapter.wordCount,
            updatedAt: chapter.updatedAt,
          })),
        }
      : undefined,
    outline: selected.includes('outline')
      ? {
          source: snapshot.outlineSource,
          chapters: snapshot.chapters.map(chapter => ({
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            summary: chapter.summary,
            wordCount: chapter.wordCount,
            updatedAt: chapter.updatedAt,
          })),
        }
      : undefined,
    threads: selected.includes('threads')
      ? {
          outlineSource: snapshot.outlineSource,
          snapshotsSource: structuralPlan?.plotThreadSnapshotsSource,
          affectedChapterNumbers: structuralPlan?.threadAffectedChapterNumbers,
        }
      : undefined,
    finalization: selected.includes('finalization')
      ? structuralPlan?.finalizationEvidence
      : undefined,
    facts: selected.includes('facts')
      ? structuralPlan?.factEvidence
      : undefined,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueRelationships(character: CharacterProfile): CharacterProfile['relationships'] {
  const seen = new Set<string>();
  return character.relationships.filter((relationship) => {
    const key = JSON.stringify(relationship);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCharacter(character: CharacterProfile): CharacterProfile {
  const growthTrack = character.growthTrack
    ? {
        ...character.growthTrack,
        milestones: mergeGrowthMilestones([], character.growthTrack.milestones),
        archivedMilestonesSummary: mergeArchivedMilestoneSummary(
          '',
          character.growthTrack.archivedMilestonesSummary,
        ),
        unresolvedTrauma: uniqueStrings(character.growthTrack.unresolvedTrauma),
        pendingPromises: uniqueStrings(character.growthTrack.pendingPromises),
      }
    : undefined;

  const normalized: CharacterProfile = {
    ...character,
    aliases: uniqueStrings(character.aliases),
    personalityTraits: uniqueStrings(character.personalityTraits),
    speechExamples: uniqueStrings(character.speechExamples),
    abilities: uniqueStrings(character.abilities),
    tags: uniqueStrings(character.tags),
    relationships: uniqueRelationships(character),
    backstory: mergeChapterHistory(character.backstory, ''),
    arc: mergeChapterHistory(character.arc, ''),
    currentState: mergeChapterHistory(character.currentState, ''),
    growthTrack,
  };
  return {
    ...normalized,
    identityLabels: projectCharacterIdentityLabels(normalized),
  };
}

function metadataNeedsSync(snapshot: Awaited<ReturnType<typeof loadNovelMaintenanceSnapshot>>): boolean {
  const chapterCount = snapshot.chapters.length;
  const finalizedChapterCount = snapshot.chapters.filter(chapter => chapter.status === 'finalized').length;
  const wordCount = snapshot.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
  return snapshot.persistedMetadataStats.chapterCount !== chapterCount
    || snapshot.persistedMetadataStats.finalizedChapterCount !== finalizedChapterCount
    || snapshot.persistedMetadataStats.wordCount !== wordCount;
}

async function organizeUnlocked(params: {
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
  novelId: string;
  scopes: NovelOrganizationScope[];
  apply: boolean;
  expectedPlanToken?: string;
  backupManager?: BackupCreator;
}): Promise<NovelOrganizationResult> {
  const { novelManager, novelMemory, novelId, scopes, apply, backupManager, expectedPlanToken } = params;
  const snapshot = await loadNovelMaintenanceSnapshot(novelManager, novelId);
  const reportBefore = buildAuditReport(snapshot);
  const requested = new Set(scopes);
  const structuralPlan = await loadStructuralOrganizationPlan({
    novelManager,
    novelId,
    outline: snapshot.outline,
    chapterSummaries: snapshot.chapters,
    includeThreads: requested.has('threads'),
    includeFinalization: requested.has('finalization'),
    includeFacts: requested.has('facts'),
  });
  const rolePlan = requested.has('characters')
    ? await loadAutoProtagonistReconciliationPlan({
        novelManager,
        novelId,
        characters: snapshot.characters,
      })
    : null;
  const statusRolePlans = requested.has('characters')
    ? await loadCharacterStatusReconciliationPlan({
        novelManager,
        novelId,
        characters: snapshot.characters,
      })
    : [];
  const planToken = createNovelOrganizationPlanToken(snapshot, scopes, structuralPlan, {
    protagonist: rolePlan,
    statuses: statusRolePlans,
  });
  const plannedAt = new Date().toISOString();
  if (apply && expectedPlanToken !== planToken) {
    throw new NovelOrganizationPlanConflictError();
  }
  const normalizedCharactersBeforeRelationshipRepair = snapshot.characters.map(normalizeCharacter);
  const orphanRelationshipRepairs = planOrphanRelationshipRepairs(
    normalizedCharactersBeforeRelationshipRepair,
  );
  const normalizedCharacters = applyOrphanRelationshipRepairs(
    normalizedCharactersBeforeRelationshipRepair,
    orphanRelationshipRepairs,
  );
  const changedCharacters = !snapshot.charactersFileError && snapshot.invalidCharacters.length === 0
    ? normalizedCharacters.filter((character, index) => (
        stableJson(character) !== stableJson(snapshot.characters[index])
      )).length
    : 0;
  const recurringCharacterCandidates = !snapshot.charactersFileError
    && snapshot.invalidCharacters.length === 0
    ? selectRecurringCharacterCandidates({
        candidates: snapshot.pendingCharacters,
        existingCharacters: snapshot.characters,
        maxPromotions: 12,
      })
    : [];
  const outlineNeedsRecovery = snapshot.chapters.length > 0
    && (!snapshot.outline || snapshot.outline.chapters.length === 0);
  const metadataChanged = metadataNeedsSync(snapshot);

  const allChanges: NovelOrganizationChange[] = [
    {
      scope: 'characters',
      changed: requested.has('characters')
        && (
          changedCharacters > 0
          || recurringCharacterCandidates.length > 0
          || rolePlan !== null
          || statusRolePlans.length > 0
        ),
      affectedEntries: requested.has('characters')
        ? changedCharacters + recurringCharacterCandidates.length + (rolePlan ? 2 : 0) + statusRolePlans.length
        : 0,
      message: snapshot.charactersFileError
        ? '角色档案文件损坏，角色整理已禁止'
        : snapshot.invalidCharacters.length > 0
        ? '存在无法解析的角色档案，角色整理已跳过'
        : changedCharacters > 0 || recurringCharacterCandidates.length > 0 || rolePlan || statusRolePlans.length > 0
          ? [
              changedCharacters > 0 ? `规范化 ${changedCharacters} 条角色档案` : '',
              orphanRelationshipRepairs.length > 0
                ? `重映射 ${orphanRelationshipRepairs.length} 条孤立人物关系`
                : '',
              recurringCharacterCandidates.length > 0
                ? `自动建档 ${recurringCharacterCandidates.length} 名跨章常驻配角`
                : '',
              rolePlan
                ? `将主角身份由“${rolePlan.current.name}”校正为“${rolePlan.next.name}”`
                : '',
              statusRolePlans.length > 0
                ? `回填 ${statusRolePlans.length} 名角色的死亡状态与身份`
                : '',
            ].filter(Boolean).join('，')
          : '角色档案无需整理',
    },
    {
      scope: 'metadata',
      changed: requested.has('metadata') && metadataChanged,
      affectedEntries: requested.has('metadata') && metadataChanged ? 1 : 0,
      message: metadataChanged ? '将同步章节数、定稿数和字数统计' : '小说元数据无需同步',
    },
    {
      scope: 'outline',
      changed: requested.has('outline') && outlineNeedsRecovery,
      affectedEntries: requested.has('outline') && outlineNeedsRecovery ? snapshot.chapters.length : 0,
      message: outlineNeedsRecovery ? '将从现有章节恢复最小大纲' : '大纲无需恢复',
    },
    {
      scope: 'threads',
      changed: requested.has('threads') && structuralPlan.threadAffectedChapterNumbers.length > 0,
      affectedEntries: requested.has('threads')
        ? structuralPlan.threadAffectedChapterNumbers.length
        : 0,
      message: snapshot.outlineError
        ? '大纲文件损坏，剧情线回填已禁止'
        : structuralPlan.plotThreadSourceError
          ? '剧情线快照文件损坏，自动回填已禁止'
          : structuralPlan.threadAffectedChapterNumbers.length > 0
            ? `将为 ${structuralPlan.threadAffectedChapterNumbers.length} 章回填剧情线推进快照`
            : '剧情线推进快照无需整理',
    },
    {
      scope: 'finalization',
      changed: requested.has('finalization') && structuralPlan.finalizationCandidates.length > 0,
      affectedEntries: requested.has('finalization')
        ? structuralPlan.finalizationCandidates.length
        : 0,
      message: structuralPlan.finalizationCandidates.length > 0
        ? `将安全标记 ${structuralPlan.finalizationCandidates.length} 章为已定稿`
        : '没有满足完整、终态且无损坏条件的待定稿章节',
    },
    {
      scope: 'facts',
      changed: requested.has('facts') && structuralPlan.factCandidates.length > 0,
      affectedEntries: requested.has('facts') ? structuralPlan.factCandidates.length : 0,
      message: structuralPlan.factCandidates.length > 0
        ? `将为 ${structuralPlan.factCandidates.length} 章补齐连贯性事实`
        : '逐章连贯性事实无需整理',
    },
  ];
  const changes = allChanges.filter(change => requested.has(change.scope));

  const hasChanges = changes.some(change => change.changed);
  if (!apply || !hasChanges) {
    return { mode: 'dry-run', novelId, planToken, plannedAt, changes, reportBefore };
  }
  if (!backupManager) {
    throw new Error('执行生产数据整理前必须配置备份管理器');
  }

  const backup = await backupManager.createBackup(novelId);
  const paths = new NovelPaths(novelManager.getDataDir());
  if (requested.has('characters') && changedCharacters > 0) {
    await writeJson(paths.charactersPath(novelId), normalizedCharacters);
  }
  if (requested.has('characters') && recurringCharacterCandidates.length > 0) {
    await promoteRecurringCharacters({
      novelManager,
      novelMemory,
      novelId,
      maxPromotions: 12,
    });
  }
  if (requested.has('characters') && rolePlan) {
    await applyAutoProtagonistReconciliation({
      novelManager,
      novelMemory,
      novelId,
      plan: rolePlan,
    });
  }
  if (requested.has('characters') && statusRolePlans.length > 0) {
    await applyCharacterStatusReconciliation({
      novelManager,
      novelMemory,
      novelId,
      plans: statusRolePlans,
    });
  }
  if (requested.has('metadata') && metadataChanged) {
    await novelManager.syncNovelMetadataByChapters(novelId);
  }
  if (requested.has('outline') && outlineNeedsRecovery) {
    if (snapshot.outlineError) {
      await writeJson(
        paths.outlinePath(novelId),
        await rebuildOutlineFromChapters(paths, novelId),
      );
    } else {
      await novelManager.getOutline(novelId);
    }
  }
  if (
    requested.has('threads')
    && !snapshot.outlineError
    && !structuralPlan.plotThreadSourceError
    && structuralPlan.threadAffectedChapterNumbers.length > 0
  ) {
    await applyThreadOrganizationRepair({
      novelManager,
      novelId,
      chapterNumbers: structuralPlan.threadAffectedChapterNumbers,
    });
  }
  if (requested.has('finalization') && structuralPlan.finalizationCandidates.length > 0) {
    await applyFinalizationOrganizationRepair({
      novelManager,
      novelId,
      chapters: structuralPlan.finalizationCandidates,
    });
  }
  if (requested.has('facts') && structuralPlan.factCandidates.length > 0) {
    await applyFactOrganizationRepair({
      novelManager,
      novelId,
      chapters: structuralPlan.factCandidates,
    });
  }

  return {
    mode: 'apply',
    novelId,
    planToken,
    plannedAt,
    backup: { id: backup.id, size: backup.size, createdAt: backup.createdAt },
    changes,
    reportBefore,
    reportAfter: await auditNovelData(novelManager, novelId),
  };
}

export async function organizeNovelData(params: {
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
  novelId: string;
  scopes?: NovelOrganizationScope[];
  apply?: boolean;
  expectedPlanToken?: string;
  backupManager?: BackupCreator;
}): Promise<NovelOrganizationResult> {
  const scopes = params.scopes?.length ? [...new Set(params.scopes)] : [...NovelOrganizationScopeValues];
  return withNovelMaintenanceLock(params.novelId, () => (
    organizeUnlocked({
      ...params,
      scopes,
      apply: params.apply === true,
    })
  ));
}

export { normalizeCharacter };
