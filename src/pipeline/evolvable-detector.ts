import { EvolvableRuleStore } from './evolvable-rule-store.js';
import type {
  DetectorRule,
  DetectorFinding,
  DetectorReport,
  EvolutionStrategy,
} from './evolvable-detector-types.js';

export abstract class EvolvableDetector<F extends DetectorFinding = DetectorFinding> {
  protected abstract readonly detectorType: string;
  protected ruleStore: EvolvableRuleStore;
  protected genre: string = 'default';
  private initialized = false;

  constructor() {
    this.ruleStore = EvolvableRuleStore.getInstance();
  }

  protected ensureInitialized(): void {
    if (!this.initialized) {
      this.initialized = true;
      this.registerDefaultRules();
    }
  }

  protected abstract registerDefaultRules(): void;

  protected abstract detectInternal(content: string, chapterNumber: number, rules: DetectorRule[]): F[];

  setGenre(genre: string): void {
    this.genre = genre;
    this.ensureInitialized();
    this.ruleStore.applyGenreBaseline(this.detectorType, genre);
  }

  getStrategy(): EvolutionStrategy {
    this.ensureInitialized();
    return this.ruleStore.getStrategy(this.detectorType);
  }

  setStrategy(strategy: EvolutionStrategy): void {
    this.ensureInitialized();
    this.ruleStore.setStrategy(this.detectorType, strategy);
  }

  getRules(): DetectorRule[] {
    this.ensureInitialized();
    return this.ruleStore.getEnabledRules(this.detectorType);
  }

  getEffectiveThreshold(rule: DetectorRule): number {
    this.ensureInitialized();
    return this.ruleStore.getEffectiveThreshold(rule, this.detectorType);
  }

  getGenreMetric(metric: string, defaultValue: number): number {
    return this.ruleStore.getGenreMetric(this.genre, metric, defaultValue);
  }

  detect(content: string, chapterNumber: number): DetectorReport<F> {
    this.ensureInitialized();
    const rules = this.getRules();
    const findings = this.detectInternal(content, chapterNumber, rules);

    for (const finding of findings) {
      this.ruleStore.recordHit(finding.ruleId, this.detectorType);
    }

    const errorCount = findings.filter(f => f.level === 'error').length;
    const warnCount = findings.filter(f => f.level === 'warn').length;
    const passed = errorCount === 0;

    const totalSeverity = findings.reduce((sum, f) => {
      const severityWeight = f.level === 'error' ? 3 : f.level === 'warn' ? 1 : 0.3;
      return sum + severityWeight * f.confidence;
    }, 0);
    const maxPossibleScore = rules.filter(r => r.enabled).length * 3;
    const score = maxPossibleScore > 0
      ? Math.max(0, Math.min(100, 100 - (totalSeverity / maxPossibleScore) * 100))
      : 100;

    const summary = findings.length === 0
      ? '通过'
      : `${findings.length} 项检测结果（${errorCount} 错误，${warnCount} 警告）`;

    return {
      findings,
      passed,
      summary,
      score,
      totalRules: rules.length,
      triggeredRules: new Set(findings.map(f => f.ruleId)).size,
    };
  }

  recordFalsePositive(ruleId: string): void {
    this.ensureInitialized();
    this.ruleStore.recordFalsePositive(ruleId, this.detectorType);
  }

  recordTruePositive(ruleId: string): void {
    this.ensureInitialized();
    this.ruleStore.recordTruePositive(ruleId, this.detectorType);
  }

  updateRule(ruleId: string, updates: Partial<DetectorRule>): boolean {
    this.ensureInitialized();
    return this.ruleStore.updateRule(ruleId, updates, this.detectorType);
  }

  getStats(): {
    totalRules: number;
    enabledRules: number;
    totalHits: number;
    avgPrecision: number;
  } {
    this.ensureInitialized();
    return this.ruleStore.getRuleStats(this.detectorType);
  }

  protected addDefaultRules(rules: DetectorRule[]): void {
    this.ruleStore.registerDefaultRules(this.detectorType, rules);
  }

  protected buildFinding(
    rule: DetectorRule,
    chapter: number,
    message: string,
    confidence: number,
    details?: Record<string, unknown>,
  ): F {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      level: rule.severity,
      message,
      confidence: Math.max(0, Math.min(1, confidence)),
      chapter,
      details,
    } as F;
  }
}
