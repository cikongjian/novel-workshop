import type { NovelManager } from './novel-manager.js';
import type { Chapter } from './types.js';
import { projectCharacterIdentityLabels } from './character-identity-labels.js';
import { buildStoryTaskGraph, type StoryTaskGraph } from './story-task-graph.js';
import {
  loadNovelMaintenanceSnapshot,
  type NovelMaintenanceSnapshot,
} from './novel-maintenance-snapshot.js';
import { findCharacterResurrectionConflicts } from '../services/character-status-reconciliation.js';
import { planOrphanRelationshipRepairs } from './novel-relationship-repair.js';

export type NovelDataAuditSeverity = 'error' | 'warning' | 'info';

export type NovelDataAuditIssue = {
  code: string;
  severity: NovelDataAuditSeverity;
  message: string;
  entityType: 'novel' | 'outline' | 'character' | 'relationship' | 'task' | 'chapter';
  entityId?: string;
  repairable: boolean;
};

export type NovelDataAuditReport = {
  novel: {
    id: string;
    title: string;
    ownerId: string;
    status: string;
    updatedAt: string;
  };
  summary: {
    healthScore: number;
    chapterCount: number;
    finalizedChapterCount: number;
    characterCount: number;
    worldEntryCount: number;
    identityLabelCount: number;
    growthMilestoneCount: number;
    characterStateCount: number;
    characterEventCount: number;
    outlineChapterCount: number;
    plotThreadCount: number;
    plotThreadSnapshotCount: number;
    taskCount: number;
    taskEdgeCount: number;
    taskParticipantCount: number;
    issueCount: number;
    repairableIssueCount: number;
  };
  capabilities: {
    identityLabels: boolean;
    characterGrowth: boolean;
    outlineCoverage: boolean;
    structuredPlotThreads: boolean;
    plotThreadCoverage: boolean;
    taskGraph: boolean;
    taskAssignments: boolean;
    worldCanon: boolean;
  };
  taskGraphSummary: StoryTaskGraph['summary'] | null;
  issues: NovelDataAuditIssue[];
  auditedAt: string;
};

const CHAPTER_ENTRY_RE = /\[第(\d+)章\]/gu;

function repeatedChapterEntries(value: string): number[] {
  const seen = new Set<number>();
  const duplicate = new Set<number>();
  for (const match of value.matchAll(CHAPTER_ENTRY_RE)) {
    const chapter = Number(match[1]);
    if (seen.has(chapter)) duplicate.add(chapter);
    seen.add(chapter);
  }
  return [...duplicate].sort((left, right) => left - right);
}

function healthScore(issues: NovelDataAuditIssue[]): number {
  const grouped = new Map<string, NovelDataAuditIssue[]>();
  for (const issue of issues) {
    const entries = grouped.get(issue.code) ?? [];
    entries.push(issue);
    grouped.set(issue.code, entries);
  }
  const penalty = [...grouped.values()].reduce((total, entries) => {
    const severity = entries[0].severity;
    const base = severity === 'error' ? 20 : severity === 'warning' ? 8 : 2;
    const incremental = severity === 'error' ? 4 : severity === 'warning' ? 2 : 1;
    return total + base + Math.min(5, entries.length - 1) * incremental;
  }, 0);
  return Math.max(0, 100 - penalty);
}

function buildAuditReport(
  snapshot: NovelMaintenanceSnapshot,
  additionalIssues: NovelDataAuditIssue[] = [],
): NovelDataAuditReport {
  const issues: NovelDataAuditIssue[] = [...additionalIssues];
  const characterIds = new Set(snapshot.characters.map(character => character.id));
  const orphanRelationshipRepairs = planOrphanRelationshipRepairs(snapshot.characters);
  const outline = snapshot.outline;
  const plotThreadIds = new Set(outline?.plotThreads.map(thread => thread.id) ?? []);
  const writtenChapterNumbers = new Set(snapshot.chapters.map(chapter => chapter.chapterNumber));
  const outlineChapterNumbers = new Set(outline?.chapters.map(chapter => chapter.chapterNumber) ?? []);

  if (snapshot.invalidCharacters.length > 0) {
    issues.push({
      code: 'invalid_character_profiles',
      severity: 'error',
      message: `${snapshot.invalidCharacters.length} 条角色档案无法解析，自动整理已跳过这些条目`,
      entityType: 'character',
      repairable: false,
    });
  }
  if (snapshot.charactersFileError) {
    issues.push({
      code: 'characters_file_corrupt',
      severity: 'error',
      message: '角色档案文件整体无法解析，已禁止自动覆盖',
      entityType: 'character',
      repairable: false,
    });
  }
  if (snapshot.chapters.length > 0 && snapshot.characters.length === 0) {
    issues.push({
      code: 'character_profiles_missing',
      severity: 'error',
      message: '已有正文但没有角色档案，人物成长、关系和任务参与无法建立',
      entityType: 'character',
      repairable: true,
    });
  }
  if (snapshot.chapters.length > 0 && snapshot.worldEntries.length === 0) {
    issues.push({
      code: 'world_canon_missing',
      severity: 'warning',
      message: '已有正文但没有世界正典条目，世界门禁无法形成有效约束',
      entityType: 'novel',
      repairable: true,
    });
  }
  if (
    snapshot.chapters.length >= 2
    && snapshot.characters.length > 0
    && snapshot.characterStates.length === 0
  ) {
    issues.push({
      code: 'character_growth_data_missing',
      severity: 'warning',
      message: '已有多章正文和角色档案，但没有角色状态快照',
      entityType: 'character',
      repairable: true,
    });
  }
  if (snapshot.invalidCharacterStates.length > 0) {
    issues.push({
      code: 'invalid_character_states',
      severity: 'warning',
      message: `${snapshot.invalidCharacterStates.length} 条角色状态快照无法解析`,
      entityType: 'character',
      repairable: false,
    });
  }
  if (!outline) {
    issues.push({
      code: snapshot.outlineError ? 'outline_corrupt' : 'outline_missing',
      severity: 'error',
      message: snapshot.outlineError ? '大纲文件损坏，可从章节数据恢复' : '缺少大纲文件，可从章节数据建立最小大纲',
      entityType: 'outline',
      repairable: snapshot.chapters.length > 0,
    });
  } else if (snapshot.chapters.length > 0 && outline.chapters.length === 0) {
    issues.push({
      code: 'outline_empty',
      severity: 'warning',
      message: '已有正文但大纲章节为空，可从章节数据补齐',
      entityType: 'outline',
      repairable: true,
    });
  }

  const missingOutlineChapters = [...writtenChapterNumbers]
    .filter(chapter => !outlineChapterNumbers.has(chapter));
  if (outline && missingOutlineChapters.length > 0) {
    issues.push({
      code: 'outline_chapter_coverage_gap',
      severity: 'warning',
      message: `${missingOutlineChapters.length} 个章节未进入总大纲`,
      entityType: 'outline',
      repairable: outline.chapters.length === 0,
    });
  }

  for (const character of snapshot.characters) {
    const projected = projectCharacterIdentityLabels(character);
    const persistedKeys = new Set((character.identityLabels ?? []).map(label => label.key));
    const missingLabels = projected.filter(label => !persistedKeys.has(label.key));
    if (missingLabels.length > 0) {
      issues.push({
        code: 'identity_labels_not_persisted',
        severity: 'info',
        message: `角色“${character.name}”有 ${missingLabels.length} 个自动身份标签尚未落盘`,
        entityType: 'character',
        entityId: character.id,
        repairable: true,
      });
    }

    const labelKeys = (character.identityLabels ?? []).map(label => label.key);
    if (new Set(labelKeys).size !== labelKeys.length) {
      issues.push({
        code: 'duplicate_identity_labels',
        severity: 'warning',
        message: `角色“${character.name}”存在重复身份标签`,
        entityType: 'character',
        entityId: character.id,
        repairable: true,
      });
    }

    const milestoneChapters = character.growthTrack?.milestones.map(item => item.chapter) ?? [];
    if (new Set(milestoneChapters).size !== milestoneChapters.length) {
      issues.push({
        code: 'duplicate_growth_milestones',
        severity: 'warning',
        message: `角色“${character.name}”同一章节存在多个成长里程碑`,
        entityType: 'character',
        entityId: character.id,
        repairable: true,
      });
    }

    const duplicateHistory = [character.backstory, character.arc, character.currentState]
      .flatMap(repeatedChapterEntries);
    if (duplicateHistory.length > 0) {
      issues.push({
        code: 'duplicate_character_history',
        severity: 'warning',
        message: `角色“${character.name}”存在重复的逐章档案记录`,
        entityType: 'character',
        entityId: character.id,
        repairable: true,
      });
    }

    const relationshipKeys = character.relationships.map(relationship => JSON.stringify(relationship));
    if (new Set(relationshipKeys).size !== relationshipKeys.length) {
      issues.push({
        code: 'duplicate_relationships',
        severity: 'warning',
        message: `角色“${character.name}”存在完全重复的人物关系`,
        entityType: 'relationship',
        entityId: character.id,
        repairable: true,
      });
    }
    const orphanCount = character.relationships.filter(item => !characterIds.has(item.targetId)).length;
    if (orphanCount > 0) {
      const repairableOrphanCount = orphanRelationshipRepairs.filter(plan => (
        plan.characterId === character.id
      )).length;
      issues.push({
        code: 'orphan_relationships',
        severity: 'warning',
        message: repairableOrphanCount === orphanCount
          ? `角色“${character.name}”有 ${orphanCount} 条关系指向旧角色 ID，可按关系描述安全重映射`
          : `角色“${character.name}”有 ${orphanCount} 条关系指向不存在的角色`,
        entityType: 'relationship',
        entityId: character.id,
        repairable: repairableOrphanCount === orphanCount,
      });
    }
  }

  for (const state of snapshot.characterStates) {
    if (!characterIds.has(state.characterId)) {
      issues.push({
        code: 'orphan_character_state',
        severity: 'warning',
        message: `第 ${state.chapterNumber} 章状态快照指向不存在的角色`,
        entityType: 'character',
        entityId: state.characterId,
        repairable: false,
      });
    }
  }

  if (outline) {
    const invalidThreadRefs = outline.plotThreads.reduce((count, thread) => (
      count
      + thread.prerequisites.filter(id => !plotThreadIds.has(id)).length
      + thread.parallelThreads.filter(id => !plotThreadIds.has(id)).length
      + (thread.mergeTarget && !plotThreadIds.has(thread.mergeTarget) ? 1 : 0)
    ), 0);
    if (invalidThreadRefs > 0) {
      issues.push({
        code: 'invalid_plot_thread_links',
        severity: 'warning',
        message: `${invalidThreadRefs} 条情节线关系指向不存在的情节线`,
        entityType: 'outline',
        repairable: false,
      });
    }
  }
  if (snapshot.chapters.length >= 3 && (outline?.plotThreads.length ?? 0) === 0) {
    issues.push({
      code: 'plot_threads_missing',
      severity: 'warning',
      message: '已有多章正文但没有结构化情节线，长期记忆无法追踪主线推进',
      entityType: 'outline',
      repairable: true,
    });
  }
  const invalidPlotThreadSnapshots = snapshot.invalidPlotThreadSnapshots ?? [];
  const plotThreadSnapshots = snapshot.plotThreadSnapshots ?? [];
  if (invalidPlotThreadSnapshots.length > 0) {
    issues.push({
      code: 'plot_thread_snapshots_corrupt',
      severity: 'error',
      message: `${invalidPlotThreadSnapshots.length} 条剧情线快照无法解析`,
      entityType: 'outline',
      repairable: false,
    });
  }
  const snapshotChapterNumbers = new Set(
    plotThreadSnapshots.map(entry => entry.chapterNumber),
  );
  const missingPlotSnapshotChapters = snapshot.chapters.filter(chapter => (
    chapter.wordCount > 0 && !snapshotChapterNumbers.has(chapter.chapterNumber)
  ));
  if ((outline?.plotThreads.length ?? 0) > 0 && missingPlotSnapshotChapters.length > 0) {
    issues.push({
      code: 'plot_thread_snapshots_missing',
      severity: 'warning',
      message: `${missingPlotSnapshotChapters.length} 章缺少剧情线推进快照，长期记忆来源不完整`,
      entityType: 'outline',
      repairable: true,
    });
  }

  const graph = outline
    ? buildStoryTaskGraph({
        outline,
        characters: snapshot.characters,
        chapterSummaries: snapshot.chapters,
      })
    : null;
  if (snapshot.chapters.length > 0 && (!graph || graph.tasks.length === 0)) {
    issues.push({
      code: 'task_graph_empty',
      severity: 'warning',
      message: '已有章节但没有可投影的故事任务',
      entityType: 'task',
      repairable: !outline || outline.chapters.length === 0,
    });
  }
  if (graph && graph.tasks.length > 0 && graph.characters.length === 0) {
    issues.push({
      code: 'task_assignments_missing',
      severity: 'info',
      message: '任务已生成，但大纲中缺少可确认的角色参与证据',
      entityType: 'task',
      repairable: false,
    });
  }

  const actualWordCount = snapshot.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
  const actualFinalized = snapshot.chapters.filter(chapter => chapter.status === 'finalized').length;
  const nonFinalizedWrittenChapters = snapshot.chapters.filter(chapter => (
    chapter.wordCount > 0 && chapter.status !== 'finalized'
  ));
  if (nonFinalizedWrittenChapters.length > 0) {
    issues.push({
      code: 'chapters_not_finalized',
      severity: 'warning',
      message: `${nonFinalizedWrittenChapters.length} 章已有正文但尚未完成结构定稿`,
      entityType: 'chapter',
      repairable: false,
    });
  }
  if (
    snapshot.persistedMetadataStats.chapterCount !== snapshot.chapters.length
    || snapshot.persistedMetadataStats.finalizedChapterCount !== actualFinalized
    || snapshot.persistedMetadataStats.wordCount !== actualWordCount
  ) {
    issues.push({
      code: 'novel_metadata_out_of_sync',
      severity: 'warning',
      message: '小说章节数、定稿数或字数统计与实际章节不一致',
      entityType: 'novel',
      repairable: true,
    });
  }

  const identityLabelCount = snapshot.characters.reduce(
    (sum, character) => sum + projectCharacterIdentityLabels(character).length,
    0,
  );
  const growthMilestoneCount = snapshot.characters.reduce(
    (sum, character) => sum + (character.growthTrack?.milestones.length ?? 0),
    0,
  );
  const outlineCovered = snapshot.chapters.length === 0 || missingOutlineChapters.length === 0;

  return {
    novel: {
      id: snapshot.novel.id,
      title: snapshot.novel.title,
      ownerId: snapshot.novel.ownerId ?? 'dev',
      status: snapshot.novel.status,
      updatedAt: snapshot.novel.updatedAt,
    },
    summary: {
      healthScore: healthScore(issues),
      chapterCount: snapshot.chapters.length,
      finalizedChapterCount: actualFinalized,
      characterCount: snapshot.characters.length,
      worldEntryCount: snapshot.worldEntries.length,
      identityLabelCount,
      growthMilestoneCount,
      characterStateCount: snapshot.characterStates.length,
      characterEventCount: snapshot.characterEvents.length,
      outlineChapterCount: outline?.chapters.length ?? 0,
      plotThreadCount: outline?.plotThreads.length ?? 0,
      plotThreadSnapshotCount: plotThreadSnapshots.length,
      taskCount: graph?.tasks.length ?? 0,
      taskEdgeCount: graph?.edges.length ?? 0,
      taskParticipantCount: graph?.characters.length ?? 0,
      issueCount: issues.length,
      repairableIssueCount: issues.filter(issue => issue.repairable).length,
    },
    capabilities: {
      identityLabels: identityLabelCount > 0,
      characterGrowth: growthMilestoneCount > 0 || snapshot.characterEvents.length > 0,
      outlineCoverage: outlineCovered,
      structuredPlotThreads: (outline?.plotThreads.length ?? 0) > 0,
      plotThreadCoverage: missingPlotSnapshotChapters.length === 0,
      taskGraph: (graph?.tasks.length ?? 0) > 0,
      taskAssignments: (graph?.characters.length ?? 0) > 0,
      worldCanon: snapshot.worldEntries.length > 0,
    },
    taskGraphSummary: graph?.summary ?? null,
    issues,
    auditedAt: new Date().toISOString(),
  };
}

export async function auditNovelData(
  novelManager: NovelManager,
  novelId: string,
): Promise<NovelDataAuditReport> {
  const snapshot = await loadNovelMaintenanceSnapshot(novelManager, novelId);
  const chapters = (await Promise.all(snapshot.chapters.map(summary => (
    novelManager.getChapter(novelId, summary.chapterNumber).catch(() => null)
  )))).filter((chapter): chapter is Chapter => Boolean(chapter?.content.trim()));
  const resurrectionIssues: NovelDataAuditIssue[] = findCharacterResurrectionConflicts({
    characters: snapshot.characters,
    chapters,
  }).map(conflict => ({
    code: 'character_resurrection_conflict',
    severity: 'error',
    message: `角色“${conflict.name}”在第 ${conflict.deathChapterNumber} 章确认死亡，却在第 ${conflict.appearanceChapterNumber} 章再次主动在场`,
    entityType: 'character',
    entityId: conflict.characterId,
    repairable: false,
  }));
  return buildAuditReport(snapshot, resurrectionIssues);
}

export { buildAuditReport };
