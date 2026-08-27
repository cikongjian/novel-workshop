import type { RemoteNovelDataOptions } from './remote-novel-data.js';
import type { RemoteNovelDataClient } from './remote-novel-data-client.js';
import { writeRemoteNovelDataReport } from './remote-novel-data-report.js';

function printAudit(report: Awaited<ReturnType<RemoteNovelDataClient['audit']>>): void {
  console.log(`${report.novel.title} (${report.novel.id})`);
  console.log(`健康分 ${report.summary.healthScore} | 章节 ${report.summary.chapterCount} | 角色 ${report.summary.characterCount} | 任务 ${report.summary.taskCount}`);
  console.log(`问题 ${report.summary.issueCount} | 可自动整理 ${report.summary.repairableIssueCount}`);
  for (const issue of report.issues) {
    console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function persistReport(
  options: RemoteNovelDataOptions,
  result: unknown,
): Promise<void> {
  if (!options.outputPath) return;
  const reportPath = await writeRemoteNovelDataReport(options.outputPath, {
    schemaVersion: 1,
    action: options.action,
    generatedAt: new Date().toISOString(),
    request: {
      novelId: options.novelId,
      all: options.all || undefined,
      scopes: options.action === 'organize' ? options.scopes : undefined,
      search: options.search,
      ownerId: options.ownerId,
      limit: options.action === 'list' || options.all ? options.limit : undefined,
      offset: options.action === 'list' || options.all ? options.offset : undefined,
      apply: options.action === 'organize' || options.action === 'rollback'
        || options.action === 'chapter-repair' || options.action === 'memory-rebuild'
        ? options.apply
        : undefined,
      backupId: options.action === 'rollback' ? options.backupId : undefined,
    },
    result,
  });
  if (!options.json) console.log(`报告已写入：${reportPath}`);
}

export async function runRemoteNovelDataCommand(
  options: RemoteNovelDataOptions,
  client: RemoteNovelDataClient,
): Promise<number> {
  if (options.action === 'doctor') {
    const result = await client.doctor();
    await persistReport(options, result);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`远程连接成功：${result.apiBase}`);
      console.log(`  平台健康：${result.health.status} (${result.latencyMs.health}ms)`);
      console.log(`  管理员握手：通过 (${result.latencyMs.authenticatedHandshake}ms)`);
      console.log(`  维护协议：${result.capabilities.protocol.name} v${result.capabilities.protocol.version}`);
      console.log(`  写入能力：整理 ${result.capabilities.features.organizationApply ? '可用' : '不可用'} | 备份 ${result.capabilities.features.backups ? '可用' : '不可用'} | 回滚 ${result.capabilities.features.rollback ? '可用' : '不可用'}`);
      console.log(`  记忆维护：检查 ${result.capabilities.features.memoryCoverage ? '可用' : '未声明'} | 重建 ${result.capabilities.features.memoryReindex ? '可用' : '未声明'}`);
      console.log(`  封面诊断：${result.capabilities.features.coverPromptDiagnostics ? '可用' : '未声明'}`);
      if (!result.compatible) console.log('  兼容性：当前 CLI 与服务端维护协议不兼容');
    }
    return result.compatible ? 0 : 2;
  }

  if (options.action === 'list') {
    const result = await client.list(options);
    await persistReport(options, result);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`小说 ${result.total} 部，当前返回 ${result.novels.length} 部`);
      for (const novel of result.novels) {
        console.log(`${novel.id}  ${String(novel.chapterCount).padStart(4)}  ${novel.status.padEnd(10)}  ${novel.title}`);
      }
    }
    return 0;
  }

  if (options.action === 'cover-prompt') {
    const result = await client.diagnoseCoverPrompt(options.novelId!);
    await persistReport(options, result);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`封面提示词：${result.promptSource} | 总耗时 ${result.elapsedMs}ms | 正向 ${result.positivePromptLength} 字 | 负向 ${result.negativePromptLength} 字`);
      if (!result.diagnostics) {
        console.log('  服务端未返回诊断信息，请确认生产环境已部署支持版本');
      } else {
        const { modelAccess, aiAttempt } = result.diagnostics;
        console.log(`  模型：${modelAccess.source} | ${modelAccess.provider ?? 'unknown'} / ${modelAccess.model ?? 'unknown'}`);
        console.log(`  AI 阶段：${aiAttempt.outcome} (${aiAttempt.elapsedMs}ms)`);
        if (aiAttempt.error) {
          const status = aiAttempt.error.status ? ` HTTP ${aiAttempt.error.status}` : '';
          const code = aiAttempt.error.code ? ` ${aiAttempt.error.code}` : '';
          console.log(`  回退原因：[${aiAttempt.error.category}]${status}${code} ${aiAttempt.error.message}`);
        }
      }
    }
    return result.diagnostics?.aiAttempt.outcome === 'ai' ? 0 : 2;
  }

  if (options.action === 'audit') {
    if (options.all) {
      const page = await client.list(options);
      const reports = await mapWithConcurrency(page.novels, 4, novel => client.audit(novel.id));
      const summary = {
        audited: reports.length,
        averageHealthScore: reports.length > 0
          ? Math.round(reports.reduce((sum, report) => sum + report.summary.healthScore, 0) / reports.length)
          : 0,
        issueCount: reports.reduce((sum, report) => sum + report.summary.issueCount, 0),
        repairableIssueCount: reports.reduce(
          (sum, report) => sum + report.summary.repairableIssueCount,
          0,
        ),
      };
      const batchResult = { summary, reports };
      await persistReport(options, batchResult);
      if (options.json) console.log(JSON.stringify(batchResult, null, 2));
      else {
        console.log(`批量审计 ${summary.audited} 部 | 平均健康分 ${summary.averageHealthScore} | 问题 ${summary.issueCount} | 可整理 ${summary.repairableIssueCount}`);
        for (const report of reports) {
          console.log(`${String(report.summary.healthScore).padStart(3)}  ${String(report.summary.issueCount).padStart(3)}  ${report.novel.id}  ${report.novel.title}`);
        }
      }
      return reports.some(report => report.summary.healthScore === 0) ? 2 : 0;
    }
    const result = await client.audit(options.novelId!);
    await persistReport(options, result);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printAudit(result);
    return result.summary.healthScore > 0 ? 0 : 2;
  }

  if (options.action === 'chapter-check') {
    const result = await client.chapterIntegrity(options.novelId!);
    await persistReport(options, result);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${result.novel.title}：空章 ${result.summary.emptyChapterCount} | 可安全修复 ${result.summary.repairablePlaceholderCount} | 需人工确认 ${result.summary.suspiciousEmptyChapterCount}`);
      for (const issue of result.issues) {
        console.log(`  [${issue.repairable ? '可修复' : '需确认'}] 第 ${issue.chapterNumber} 章 ${issue.code}: ${issue.message}`);
      }
      console.log(`  修复计划令牌：${result.planToken}`);
    }
    return result.summary.emptyChapterCount > 0 ? 2 : 0;
  }

  if (options.action === 'chapter-repair') {
    const preview = options.apply && !options.planToken
      ? await client.chapterIntegrity(options.novelId!)
      : null;
    const result = await client.repairChapterIntegrity({
      novelId: options.novelId!,
      apply: options.apply,
      expectedPlanToken: options.apply ? (options.planToken ?? preview?.planToken) : undefined,
    });
    await persistReport(options, result);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${result.reportBefore.novel.title}：${result.mode === 'apply' ? '空章修复已执行' : '空章修复预览'}`);
      console.log(`  可安全修复：${result.reportBefore.summary.repairablePlaceholderCount} 章`);
      if (result.mode === 'apply') {
        console.log(`  已清理章节：${result.deletedChapterNumbers.join(', ') || '无'}`);
        if (result.backup) console.log(`  备份：${result.backup.id} (${result.backup.size} bytes)`);
      } else {
        console.log(`  修复计划令牌：${result.planToken}`);
      }
    }
    return 0;
  }

  if (options.action === 'memory-check') {
    const result = await client.memoryCoverage(options.novelId!);
    await persistReport(options, result);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      const missing = Object.values(result.missing).reduce((sum, items) => sum + items.length, 0);
      const stale = Object.values(result.stale).reduce((sum, items) => sum + items.length, 0);
      console.log(`记忆覆盖：${result.complete ? '完整' : '不完整'} | 缺失 ${missing} | 陈旧 ${stale} | 向量块 ${result.indexed.chunkStats.totalChunks}`);
      for (const [domain, items] of Object.entries(result.missing)) {
        if (items.length > 0) console.log(`  缺失 ${domain}: ${items.join(', ')}`);
      }
      for (const warning of result.readiness.warnings) console.log(`  来源警告：${warning}`);
    }
    return result.complete ? 0 : 2;
  }

  if (options.action === 'memory-rebuild') {
    const result = await client.rebuildMemory({
      novelId: options.novelId!,
      apply: options.apply,
    });
    await persistReport(options, result);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(options.apply ? '远程记忆增量重建已执行' : '远程记忆重建预检完成');
      console.log(`  小说 ${result.reindex.summary.totalNovels} | 成功 ${result.reindex.summary.successNovels} | 失败 ${result.reindex.summary.failedNovels}`);
      console.log(`  重建后覆盖：${result.coverage.complete ? '完整' : '不完整'}`);
    }
    return result.reindex.success && (!options.apply || result.coverage.complete) ? 0 : 2;
  }

  if (options.action === 'backups') {
    const result = await client.backups(options.novelId!);
    await persistReport(options, result);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`备份 ${result.backups.length} 份`);
      for (const backup of result.backups) {
        console.log(`${backup.id}  ${String(backup.size).padStart(10)} bytes  ${backup.createdAt}`);
      }
    }
    return 0;
  }

  if (options.action === 'rollback') {
    const result = await client.rollback({ novelId: options.novelId!, backupId: options.backupId! });
    await persistReport(options, result);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${result.reportAfter.novel.title}：已恢复备份 ${result.restoredBackup.id}`);
      console.log(`  回滚前安全备份：${result.safetyBackup.id}`);
      console.log(`  回滚后健康分：${result.reportAfter.summary.healthScore}`);
    }
    return 0;
  }

  const preview = options.apply && !options.planToken
    ? await client.organize({
        novelId: options.novelId!,
        scopes: options.scopes,
        apply: false,
      })
    : null;
  const result = await client.organize({
    novelId: options.novelId!,
    scopes: options.scopes,
    apply: options.apply,
    expectedPlanToken: options.apply ? (options.planToken ?? preview?.planToken) : undefined,
  });
  await persistReport(options, result);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.reportBefore.novel.title}：${result.mode === 'apply' ? '整理已执行' : '整理预览'}`);
    for (const change of result.changes) {
      console.log(`  ${change.changed ? '[变更]' : '[无变更]'} ${change.scope}: ${change.message}`);
    }
    if (result.backup) console.log(`  备份：${result.backup.id} (${result.backup.size} bytes)`);
    if (result.reportAfter) {
      console.log(`  健康分：${result.reportBefore.summary.healthScore} -> ${result.reportAfter.summary.healthScore}`);
    }
    if (result.mode === 'dry-run') console.log(`  计划令牌：${result.planToken}`);
  }
  return 0;
}
