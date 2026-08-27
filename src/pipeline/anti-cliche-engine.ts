import type {
  ClicheFinding,
  DetectionContext,
  ClicheRule,
  EvolutionResult,
  Detector,
  ClicheDetectionReport,
} from './anti-cliche-types.js';
export type { ClicheDetectionReport } from './anti-cliche-types.js';
import { ClicheRuleStore } from './cliche-rule-store.js';
import { EvolutionEngine } from './evolution-engine.js';
import { ALL_DETECTORS, getDetectorByType } from './anti-cliche-detectors.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('anti-cliche-engine');

const MAX_FINDINGS_PER_CATEGORY = 20;
const SCORE_WEIGHTS: Record<string, number> = {
  critical: 20,
  high: 15,
  medium: 10,
  low: 5,
  info: 2,
};

export class AntiClicheEngine {
  private ruleStore: ClicheRuleStore;
  private evolutionEngine: EvolutionEngine;
  private detectors: Map<string, Detector>;

  private static instance: AntiClicheEngine | null = null;

  private constructor(novelsDir: string) {
    this.ruleStore = new ClicheRuleStore(novelsDir);
    this.evolutionEngine = new EvolutionEngine(this.ruleStore);
    this.detectors = new Map();
    for (const detector of ALL_DETECTORS) {
      this.detectors.set(detector.type, detector);
    }
  }

  public static getInstance(novelsDir?: string): AntiClicheEngine {
    if (!AntiClicheEngine.instance) {
      if (!novelsDir) {
        throw new Error('AntiClicheEngine requires novelsDir for first initialization');
      }
      AntiClicheEngine.instance = new AntiClicheEngine(novelsDir);
    }
    return AntiClicheEngine.instance;
  }

  async detect(context: DetectionContext): Promise<ClicheDetectionReport> {
    const { novelId, chapterNumber, content } = context;
    const rules = this.ruleStore.getNovelRules(novelId);
    const detectorConfigs = this.ruleStore.getDetectorConfigs();

    const allFindings: ClicheFinding[] = [];

    const enabledDetectors = detectorConfigs
      .filter(d => d.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const config of enabledDetectors) {
      const detector = this.detectors.get(config.type);
      if (!detector) continue;

      try {
        const findings = await detector.detect(context, rules);
        allFindings.push(...findings);

        log.debug('检测器执行完成', {
          detector: detector.name,
          findings: findings.length,
          chapter: chapterNumber,
        });
      } catch (err) {
        log.error(`检测器执行失败: ${detector.name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const finding of allFindings) {
      this.ruleStore.recordHit(finding.ruleId, novelId);
    }

    await this.evolutionEngine.autoLearnFromFindings(allFindings);

    const report = this.buildReport(allFindings, chapterNumber);

    log.info('反套路检测完成', {
      chapter: chapterNumber,
      totalFindings: report.totalFindings,
      score: report.score,
    });

    return report;
  }

  private buildReport(findings: ClicheFinding[], chapterNumber: number): ClicheDetectionReport {
    const sortedFindings = [...findings].sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.confidence - a.confidence;
    });

    const categoryBreakdown: Record<string, { count: number; score: number }> = {};
    const categories = ['expression', 'narrative', 'plot', 'character', 'scene', 'dialogue', 'world'];

    for (const cat of categories) {
      categoryBreakdown[cat] = { count: 0, score: 100 };
    }

    let totalScore = 100;

    for (const finding of sortedFindings) {
      const weight = SCORE_WEIGHTS[finding.severity];
      totalScore -= weight;

      if (categoryBreakdown[finding.category]) {
        categoryBreakdown[finding.category].count++;
        categoryBreakdown[finding.category].score -= weight;
      }
    }

    totalScore = Math.max(0, Math.round(totalScore));
    for (const cat of categories) {
      categoryBreakdown[cat].score = Math.max(0, Math.round(categoryBreakdown[cat].score));
    }

    const suggestions = this.buildSuggestions(sortedFindings);

    const summary = this.buildSummary(sortedFindings, totalScore);

    return {
      chapterNumber,
      totalFindings: sortedFindings.length,
      findings: sortedFindings.slice(0, 50),
      score: totalScore,
      breakdown: categoryBreakdown,
      suggestions,
      summary,
    };
  }

  private buildSuggestions(findings: ClicheFinding[]): string[] {
    const suggestions: string[] = [];
    const categoryGroups: Record<string, ClicheFinding[]> = {};

    for (const finding of findings) {
      if (!categoryGroups[finding.category]) {
        categoryGroups[finding.category] = [];
      }
      categoryGroups[finding.category].push(finding);
    }

    for (const [category, categoryFindings] of Object.entries(categoryGroups)) {
      const topFindings = categoryFindings.slice(0, 3);
      const firstFinding = topFindings[0];

      if (topFindings.length > 0) {
        suggestions.push(`${this.getCategoryLabel(category)}：${topFindings.length}处问题，${firstFinding.suggestion}`);
      }
    }

    if (findings.length === 0) {
      suggestions.push('未检测到明显的套路化表达，继续保持！');
    }

    return suggestions.slice(0, 10);
  }

  private getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      expression: '表达套路',
      narrative: '叙事套路',
      plot: '情节套路',
      character: '角色套路',
      scene: '场景套路',
      dialogue: '对话套路',
      world: '世界观套路',
    };
    return labels[category] || category;
  }

  private buildSummary(findings: ClicheFinding[], score: number): string {
    if (findings.length === 0) {
      return '本章未检测到套路化表达';
    }

    const severityGroups: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const finding of findings) {
      severityGroups[finding.severity]++;
    }

    const parts: string[] = [];
    if (severityGroups.critical > 0) parts.push(`${severityGroups.critical}处严重`);
    if (severityGroups.high > 0) parts.push(`${severityGroups.high}处高`);
    if (severityGroups.medium > 0) parts.push(`${severityGroups.medium}处中`);
    if (severityGroups.low > 0) parts.push(`${severityGroups.low}处低`);

    const scoreLevel = score >= 80 ? '优秀' : score >= 60 ? '良好' : score >= 40 ? '一般' : '较差';

    return `${parts.join('、')}套路问题，反套路评分${score}分（${scoreLevel}）`;
  }

  async evolve(): Promise<EvolutionResult> {
    return this.evolutionEngine.evolve();
  }

  async recordFeedback(ruleId: string, isFalsePositive: boolean, novelId?: string): Promise<void> {
    await this.evolutionEngine.recordFeedback(ruleId, isFalsePositive, novelId);
  }

  getRules(novelId?: string): ClicheRule[] {
    return novelId ? this.ruleStore.getNovelRules(novelId) : this.ruleStore.getGlobalRules();
  }

  addRule(rule: ClicheRule, novelId?: string): void {
    this.ruleStore.addRule(rule, novelId);
  }

  updateRule(ruleId: string, updates: Partial<ClicheRule>, novelId?: string): boolean {
    return this.ruleStore.updateRule(ruleId, updates, novelId);
  }

  deleteRule(ruleId: string, novelId?: string): boolean {
    return this.ruleStore.deleteRule(ruleId, novelId);
  }

  registerDetector(detector: Detector): void {
    this.detectors.set(detector.type, detector);
  }

  unregisterDetector(type: string): void {
    this.detectors.delete(type);
  }
}