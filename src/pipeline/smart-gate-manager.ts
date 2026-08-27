/**
 * 智能门禁管理器
 * 
 * 整合多个纯算法检测器：
 * - 连续性审计（人名突变、数字不一致、物品复活）
 * - 蓝图执行追踪（场景兑现覆盖率）
 * - 代价感检测（战斗代价、资源消耗）
 * 
 * 所有检测均为纯算法实现，毫秒级完成，不调用AI。
 * 提供像编程工具一样的即时反馈。
 */

import { ContinuityAuditor, type ContinuityFinding } from './smart-continuity-auditor.js';
import { BlueprintTracker, type BlueprintFinding } from './blueprint-execution-tracker.js';
import { CostDetector, type CostFinding } from './cost-detector.js';
import { DialoguePacingDetector, type DialoguePacingFinding } from './dialogue-pacing-detector.js';
import { HookDetector, type HookFinding } from './hook-detector.js';
import { AntiClicheEngine, type ClicheDetectionReport } from './anti-cliche-engine.js';
import type { EvolutionStrategy, DetectorStats } from './evolvable-detector-types.js';

export type SmartGateFinding = ContinuityFinding | BlueprintFinding | CostFinding | DialoguePacingFinding | HookFinding;

export type SmartGateReport = {
  continuity: {
    passed: boolean;
    findings: ContinuityFinding[];
    summary: string;
  };
  blueprint: {
    passed: boolean;
    findings: BlueprintFinding[];
    summary: string;
    coverage: number;
  };
  cost: {
    passed: boolean;
    findings: CostFinding[];
    summary: string;
  };
  dialoguePacing: {
    passed: boolean;
    findings: DialoguePacingFinding[];
    summary: string;
    dialogueRatio: number;
    avgParagraphLength: number;
  };
  hook: {
    passed: boolean;
    findings: HookFinding[];
    summary: string;
    hookType: string;
    hookStrength: string;
    tensionScore: number;
  };
  overallPassed: boolean;
  totalFindings: number;
  errorCount: number;
  warnCount: number;
  summary: string;
  antiCliche?: ClicheDetectionReport;
};

export class SmartGateManager {
  private continuityAuditor = new ContinuityAuditor();
  private blueprintTracker = new BlueprintTracker();
  private costDetector = new CostDetector();
  private dialoguePacingDetector = new DialoguePacingDetector();
  private hookDetector = new HookDetector();

  async auditChapter(params: {
    novelId: string;
    content: string;
    chapterNumber: number;
    outlineText?: string;
    previousChapters?: Array<{ content: string; chapterNumber: number }>;
    novelsDir?: string;
  }): Promise<SmartGateReport> {
    const { novelId, content, chapterNumber, outlineText, previousChapters, novelsDir } = params;

    const continuityFindings = this._runContinuityAudit(novelId, content, chapterNumber, previousChapters);
    
    let blueprintFindings: BlueprintFinding[] = [];
    let blueprintCoverage = 100;
    if (outlineText) {
      const scenes = this.blueprintTracker.extractScenePlanFromOutline(outlineText);
      const blueprintReport = this.blueprintTracker.trackChapter(novelId, content, chapterNumber, scenes);
      blueprintFindings = blueprintReport.findings;
      blueprintCoverage = Math.round((blueprintReport.executedScenes / blueprintReport.totalScenes) * 100);
    }

    const costReport = this.costDetector.detect(content, chapterNumber);

    const dialoguePacingReport = this.dialoguePacingDetector.detect(content, chapterNumber, novelId);

    const hookReport = this.hookDetector.detect(content, chapterNumber);

    let antiClicheReport: ClicheDetectionReport | undefined;
    if (novelsDir) {
      try {
        const antiClicheEngine = AntiClicheEngine.getInstance(novelsDir);
        antiClicheReport = await antiClicheEngine.detect({
          novelId,
          chapterNumber,
          content,
          outline: outlineText,
          previousChapters,
        });
      } catch (err) {
        console.error('[smart-gate-manager] 反套路检测失败:', err);
      }
    }

    const continuityPassed = continuityFindings.filter(f => f.level === 'error').length === 0;
    const blueprintPassed = blueprintFindings.filter(f => f.level === 'error').length === 0;
    const costPassed = costReport.passed;
    const dialoguePacingPassed = dialoguePacingReport.passed;
    const hookPassed = hookReport.passed;

    const allFindings = [...continuityFindings, ...blueprintFindings, ...costReport.findings, ...dialoguePacingReport.findings, ...hookReport.findings];
    const errorCount = allFindings.filter(f => f.level === 'error').length;
    const warnCount = allFindings.filter(f => f.level === 'warn').length;

    return {
      continuity: {
        passed: continuityPassed,
        findings: continuityFindings,
        summary: continuityFindings.length > 0
          ? `${continuityFindings.filter(f => f.level === 'error').length} 错误, ${continuityFindings.filter(f => f.level === 'warn').length} 警告`
          : '通过',
      },
      blueprint: {
        passed: blueprintPassed,
        findings: blueprintFindings,
        summary: blueprintFindings.length > 0
          ? `${blueprintFindings.filter(f => f.level === 'error').length} 错误, ${blueprintFindings.filter(f => f.level === 'warn').length} 警告`
          : '通过',
        coverage: blueprintCoverage,
      },
      cost: {
        passed: costPassed,
        findings: costReport.findings,
        summary: costReport.summary,
      },
      dialoguePacing: {
        passed: dialoguePacingPassed,
        findings: dialoguePacingReport.findings,
        summary: dialoguePacingReport.summary,
        dialogueRatio: dialoguePacingReport.dialogueRatio,
        avgParagraphLength: dialoguePacingReport.avgParagraphLength,
      },
      hook: {
        passed: hookPassed,
        findings: hookReport.findings,
        summary: hookReport.summary,
        hookType: hookReport.hookType,
        hookStrength: hookReport.hookStrength,
        tensionScore: hookReport.tensionScore,
      },
      overallPassed: continuityPassed && blueprintPassed && costPassed && dialoguePacingPassed && hookPassed,
      totalFindings: allFindings.length,
      errorCount,
      warnCount,
      summary: this._buildSummary(allFindings),
      antiCliche: antiClicheReport,
    };
  }

  private _runContinuityAudit(
    novelId: string,
    content: string,
    chapterNumber: number,
    previousChapters?: Array<{ content: string; chapterNumber: number }>
  ): ContinuityFinding[] {
    this.continuityAuditor.registerNovel(novelId);

    if (previousChapters && previousChapters.length > 0) {
      for (const chapter of previousChapters.sort((a, b) => a.chapterNumber - b.chapterNumber)) {
        if (chapter.chapterNumber < chapterNumber) {
          this.continuityAuditor.processChapter(novelId, chapter.content, chapter.chapterNumber);
        }
      }
    }

    return this.continuityAuditor.processChapter(novelId, content, chapterNumber);
  }

  private _buildSummary(findings: SmartGateFinding[]): string {
    if (findings.length === 0) {
      return '智能门禁全部通过';
    }

    const groups: Record<string, string[]> = {};
    for (const finding of findings) {
      const code = finding.code;
      if (!groups[code]) groups[code] = [];
      groups[code].push(finding.message);
    }

    const lines: string[] = [];
    const codeLabels: Record<string, string> = {
      'name-mutation': '角色名突变',
      'number-inconsistency': '数字不一致',
      'identity-conflict': '身份冲突',
      'faction-conflict': '势力冲突',
      'item-resurrection': '物品复活',
      'setting-leak': '设定泄露',
      'scene-not-executed': '场景未执行',
      'scene-partial-execution': '场景执行不完整',
      'foreshadowing-not-recovered': '伏笔未回收',
      'contract-violation': '合约违规',
      'no-cost-combat': '无代价战斗',
      'overpowered-protagonist': '主角过强',
      'missing-consequences': '缺少后果',
      'unearned-victory': '胜利来得太容易',
      'dialogue-ratio-high': '对话占比过高',
      'dialogue-ratio-low': '对话占比过低',
      'dialogue-monologue': '连续大段对话',
      'said-bookism': '对话标签病',
      'pacing-monotony': '节奏单调',
      'paragraph-too-short': '段落过短',
      'paragraph-too-long': '段落过长',
      'action-ratio-low': '动作描写偏少',
      'description-ratio-high': '环境描写偏多',
      'hook-weak': '钩子弱',
      'hook-none': '无钩子',
      'hook-poor-position': '钩子位置不佳',
      'hook-low-tension': '钩子张力不足',
    };

    for (const [code, messages] of Object.entries(groups)) {
      const label = codeLabels[code] || code;
      lines.push(`${label}: ${messages.length} 处`);
    }

    return lines.join('，');
  }

  generateFixHints(report: SmartGateReport): string {
    const lines: string[] = ['【智能门禁修复建议】'];

    if (report.continuity.findings.some(f => f.code === 'name-mutation')) {
      lines.push('- 检查角色名是否突变（如"阿星"变成"何苗"），统一命名');
    }

    if (report.continuity.findings.some(f => f.code === 'number-inconsistency')) {
      lines.push('- 检查数字设定是否一致（如频率、距离、数量）');
    }
    if (report.continuity.findings.some(f => f.code === 'item-resurrection')) {
      lines.push('- 检查已毁/已失物品是否被重新使用');
    }

    if (report.blueprint.findings.some(f => f.code === 'scene-not-executed')) {
      const notExecuted = report.blueprint.findings.filter(f => f.code === 'scene-not-executed');
      const titles = notExecuted.map(f => f.sceneTitle).filter(Boolean).slice(0, 3);
      lines.push(`- 大纲规划的场景未执行：${titles.join('、')}`);
    }

    if (report.blueprint.coverage < 80) {
      lines.push(`- 场景兑现覆盖率偏低（${report.blueprint.coverage}%），请检查大纲执行情况`);
    }

    if (report.cost.findings.some(f => f.code === 'no-cost-combat')) {
      lines.push('- 战斗场景缺少代价描写，建议增加受伤或资源消耗');
    }

    if (report.cost.findings.some(f => f.code === 'overpowered-protagonist')) {
      lines.push('- 主角过于强大，建议增加战斗难度或限制');
    }

    if (report.cost.findings.some(f => f.code === 'missing-consequences')) {
      lines.push('- 提及了资源但未展示消耗，建议增加资源压力');
    }

    if (lines.length === 1) {
      return '';
    }

    lines.push('');
    lines.push('请对正文做最小必要改写，保持主剧情节奏不变。');
    return lines.join('\n');
  }

  setStrategy(strategy: EvolutionStrategy): void {
    this.hookDetector.setStrategy(strategy);
    this.costDetector.setStrategy(strategy);
    this.dialoguePacingDetector.setStrategy(strategy);
  }

  getStrategy(): EvolutionStrategy {
    return this.hookDetector.getStrategy();
  }

  setGenre(genre: string): void {
    this.hookDetector.setGenre(genre);
    this.costDetector.setGenre(genre);
    this.dialoguePacingDetector.setGenre(genre);
  }

  recordFalsePositive(detectorType: string, ruleId: string): void {
    if (detectorType === 'hook-detector') {
      this.hookDetector.recordFalsePositive(ruleId);
    } else if (detectorType === 'cost-detector') {
      this.costDetector.recordFalsePositive(ruleId);
    } else if (detectorType === 'dialogue-pacing') {
      this.dialoguePacingDetector.recordFalsePositive(ruleId);
    }
  }

  recordTruePositive(detectorType: string, ruleId: string): void {
    if (detectorType === 'hook-detector') {
      this.hookDetector.recordTruePositive(ruleId);
    } else if (detectorType === 'cost-detector') {
      this.costDetector.recordTruePositive(ruleId);
    } else if (detectorType === 'dialogue-pacing') {
      this.dialoguePacingDetector.recordTruePositive(ruleId);
    }
  }

  getDetectorStats(detectorType: string): DetectorStats | null {
    if (detectorType === 'hook-detector') {
      return this.hookDetector.getStats();
    } else if (detectorType === 'cost-detector') {
      return this.costDetector.getStats();
    } else if (detectorType === 'dialogue-pacing') {
      return this.dialoguePacingDetector.getStats();
    }
    return null;
  }

  getAllDetectorStats(): Record<string, DetectorStats> {
    return {
      'hook-detector': this.hookDetector.getStats(),
      'cost-detector': this.costDetector.getStats(),
      'dialogue-pacing': this.dialoguePacingDetector.getStats(),
    };
  }
}
