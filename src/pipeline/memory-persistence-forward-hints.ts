import type { Chapter } from '../novel/types.js';

export type MemoryPersistenceForwardRisk = {
  severity: 'none' | 'warning' | 'critical';
  codes: string[];
  shouldPromoteToUserDirection: boolean;
};

function noMemoryPersistenceRisk(): MemoryPersistenceForwardRisk {
  return {
    severity: 'none',
    codes: [],
    shouldPromoteToUserDirection: false,
  };
}

export function evaluateMemoryPersistenceForwardRisk(
  chapter: Chapter | null | undefined,
): MemoryPersistenceForwardRisk {
  const audit = chapter?.diagnostics?.memoryPersistenceAudit;
  if (!chapter || !audit) return noMemoryPersistenceRisk();

  const warningCodes: string[] = [];
  const criticalCodes: string[] = [];
  const warnings = audit.warnings ?? [];

  if (audit.chapterIndexed === false) {
    criticalCodes.push('chapter-vector-missing');
  }
  if (audit.digestIndexed === false) {
    if (chapter.summary?.trim()) {
      warningCodes.push('chapter-digest-index-missing');
    } else {
      criticalCodes.push('chapter-digest-and-summary-missing');
    }
  }
  if (audit.factIndexed === false) {
    warningCodes.push('fact-index-missing');
  }
  if (audit.threadIndexed === false || audit.threadIndexStatus === 'failed') {
    warningCodes.push('thread-index-missing');
  }
  if (audit.truthFilesAligned === false) {
    criticalCodes.push('truth-files-misaligned');
  }
  if (warnings.length > 0) {
    warningCodes.push('memory-persistence-warnings');
  }

  if (criticalCodes.length > 0) {
    return {
      severity: 'critical',
      codes: [...criticalCodes, ...warningCodes],
      shouldPromoteToUserDirection: true,
    };
  }
  if (warningCodes.length > 0) {
    return {
      severity: 'warning',
      codes: warningCodes,
      shouldPromoteToUserDirection: false,
    };
  }
  return noMemoryPersistenceRisk();
}

export function buildMemoryPersistenceForwardHints(chapter: Chapter | null | undefined): string {
  const audit = chapter?.diagnostics?.memoryPersistenceAudit;
  if (!chapter || !audit) return '';

  const issues: string[] = [];
  if (audit.chapterIndexed === false) {
    issues.push('章节正文向量未成功入库，下一章不能只依赖检索结果，必须显式承接上一章正文中的关键行动、结果和角色状态。');
  }
  if (audit.digestIndexed === false) {
    const stage = audit.digestFailureStage ? `（失败阶段：${audit.digestFailureStage}）` : '';
    issues.push(`章节摘要未成功入库${stage}，下一章必须从上一章正文/summary 中主动承接关键事件、人物变化和未解决压力。`);
  }
  if (audit.factIndexed === false) {
    issues.push('事实图索引未成功入库，下一章新增设定前必须先核对已知事实，避免重新发明规则、关系或物件状态。');
  }
  if (audit.threadIndexed === false || audit.threadIndexStatus === 'failed') {
    issues.push('伏笔/线程快照索引失败，下一章必须显式检查未回收钩子，不要跳过上一章留下的任务、承诺或危险。');
  }
  if (audit.truthFilesAligned === false) {
    issues.push('真相文件健康检查未对齐，下一章必须优先保持 currentState、pendingHooks、characterMatrix 一致，不要新增冲突设定。');
  }
  if (audit.warnings.length > 0) {
    issues.push(`落库警告：${audit.warnings.slice(0, 3).join('；')}。`);
  }

  if (issues.length === 0) return '';

  return [
    `上一章记忆落库审计提示（第 ${chapter.chapterNumber} 章）：`,
    ...issues.map(issue => `- ${issue}`),
    '- 读者交付优先：补记忆要写成角色行动、选择、代价和章尾压力，不要写成设定清单。',
  ].join('\n');
}
