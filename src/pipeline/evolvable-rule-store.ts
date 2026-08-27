import type { DetectorRule, DetectorRuleStore, EvolutionStrategy } from './evolvable-detector-types.js';
import { getGenreBaseline, type GenreBaseline } from './genre-baselines.js';

type RuleMap = Map<string, DetectorRule>;
type DetectorRuleMap = Map<string, RuleMap>;

const STRATEGY_THRESHOLD_MULTIPLIERS: Record<EvolutionStrategy, number> = {
  precision: 1.3,
  recall: 0.7,
  balanced: 1.0,
};

const DEFAULT_GENRE_BASELINES: Record<string, Record<string, number>> = {
  'default': {
    hookTension: 5,
    dialogueRatioHigh: 0.55,
    dialogueRatioLow: 0.1,
    avgParagraphShort: 25,
    avgParagraphLong: 200,
    costCombatIntensity: 0.02,
  },
  '甜宠': {
    dialogueRatioHigh: 0.65,
    dialogueRatioLow: 0.2,
    avgParagraphShort: 20,
    avgParagraphLong: 150,
    hookTension: 4,
  },
  '玄幻': {
    dialogueRatioHigh: 0.4,
    dialogueRatioLow: 0.1,
    avgParagraphShort: 30,
    avgParagraphLong: 250,
    costCombatIntensity: 0.025,
    hookTension: 6,
  },
  '科幻': {
    dialogueRatioHigh: 0.4,
    dialogueRatioLow: 0.08,
    avgParagraphShort: 30,
    avgParagraphLong: 250,
    hookTension: 5,
  },
  '悬疑': {
    dialogueRatioHigh: 0.5,
    dialogueRatioLow: 0.1,
    avgParagraphShort: 25,
    avgParagraphLong: 200,
    hookTension: 6,
  },
  '都市': {
    dialogueRatioHigh: 0.55,
    dialogueRatioLow: 0.12,
    avgParagraphShort: 25,
    avgParagraphLong: 180,
    hookTension: 4.5,
  },
};

export class EvolvableRuleStore implements DetectorRuleStore {
  private static instance: EvolvableRuleStore | null = null;
  private detectorRules: DetectorRuleMap = new Map();
  private strategies: Map<string, EvolutionStrategy> = new Map();
  private genreBaselines: Record<string, Record<string, number>> = { ...DEFAULT_GENRE_BASELINES };
  private defaultThresholds: Map<string, Map<string, number>> = new Map();

  private constructor() {}

  public static getInstance(): EvolvableRuleStore {
    if (!EvolvableRuleStore.instance) {
      EvolvableRuleStore.instance = new EvolvableRuleStore();
    }
    return EvolvableRuleStore.instance;
  }

  registerDefaultRules(detectorType: string, rules: DetectorRule[]): void {
    if (!this.detectorRules.has(detectorType)) {
      const ruleMap = new Map<string, DetectorRule>();
      const thresholdMap = new Map<string, number>();
      for (const rule of rules) {
        ruleMap.set(rule.id, { ...rule });
        thresholdMap.set(rule.id, rule.threshold);
      }
      this.detectorRules.set(detectorType, ruleMap);
      this.defaultThresholds.set(detectorType, thresholdMap);
    }
    if (!this.strategies.has(detectorType)) {
      this.strategies.set(detectorType, 'balanced');
    }
  }

  getRules(detectorType: string): DetectorRule[] {
    const ruleMap = this.detectorRules.get(detectorType);
    if (!ruleMap) return [];
    return Array.from(ruleMap.values());
  }

  getEnabledRules(detectorType: string): DetectorRule[] {
    return this.getRules(detectorType).filter(r => r.enabled);
  }

  getEffectiveThreshold(rule: DetectorRule, detectorType: string): number {
    const strategy = this.strategies.get(detectorType) ?? 'balanced';
    const multiplier = STRATEGY_THRESHOLD_MULTIPLIERS[strategy];
    return rule.threshold * multiplier;
  }

  updateRule(ruleId: string, updates: Partial<DetectorRule>, detectorType?: string): boolean {
    if (detectorType) {
      const ruleMap = this.detectorRules.get(detectorType);
      if (ruleMap?.has(ruleId)) {
        const existing = ruleMap.get(ruleId)!;
        ruleMap.set(ruleId, { ...existing, ...updates, lastUpdated: Date.now() });
        return true;
      }
      return false;
    }
    for (const ruleMap of this.detectorRules.values()) {
      if (ruleMap.has(ruleId)) {
        const existing = ruleMap.get(ruleId)!;
        ruleMap.set(ruleId, { ...existing, ...updates, lastUpdated: Date.now() });
        return true;
      }
    }
    return false;
  }

  recordHit(ruleId: string, detectorType: string): void {
    const ruleMap = this.detectorRules.get(detectorType);
    const rule = ruleMap?.get(ruleId);
    if (rule) {
      rule.hitCount++;
      rule.lastUpdated = Date.now();
      this.updatePrecision(rule);
    }
  }

  recordFalsePositive(ruleId: string, detectorType: string): void {
    const ruleMap = this.detectorRules.get(detectorType);
    const rule = ruleMap?.get(ruleId);
    if (rule) {
      rule.falsePositiveCount++;
      rule.lastUpdated = Date.now();
      this.updatePrecision(rule);
      this.autoAdjustThreshold(rule, detectorType, 'falsePositive');
    }
  }

  recordTruePositive(ruleId: string, detectorType: string): void {
    const ruleMap = this.detectorRules.get(detectorType);
    const rule = ruleMap?.get(ruleId);
    if (rule) {
      rule.truePositiveCount++;
      rule.lastUpdated = Date.now();
      this.updatePrecision(rule);
      this.autoAdjustThreshold(rule, detectorType, 'truePositive');
    }
  }

  private updatePrecision(rule: DetectorRule): void {
    const total = rule.truePositiveCount + rule.falsePositiveCount;
    if (total > 0) {
      rule.precision = rule.truePositiveCount / total;
    }
  }

  private autoAdjustThreshold(rule: DetectorRule, detectorType: string, type: 'truePositive' | 'falsePositive'): void {
    const totalFeedback = rule.truePositiveCount + rule.falsePositiveCount;
    if (totalFeedback < 5) return;

    const precision = rule.precision ?? 0.5;
    const strategy = this.strategies.get(detectorType) ?? 'balanced';

    if (type === 'falsePositive' && precision < 0.4) {
      rule.threshold = Math.min(rule.threshold * 1.1, rule.threshold * 3);
    } else if (type === 'truePositive' && precision > 0.85 && rule.hitCount < 3) {
      rule.threshold = Math.max(rule.threshold * 0.9, rule.threshold * 0.5);
    }

    if (strategy === 'precision') {
      rule.threshold *= 1.05;
    } else if (strategy === 'recall') {
      rule.threshold *= 0.95;
    }
  }

  getStrategy(detectorType: string): EvolutionStrategy {
    return this.strategies.get(detectorType) ?? 'balanced';
  }

  setStrategy(detectorType: string, strategy: EvolutionStrategy): void {
    this.strategies.set(detectorType, strategy);
  }

  getGenreBaseline(genre: string): Record<string, number> | undefined {
    return this.genreBaselines[genre] ?? this.genreBaselines['default'];
  }

  getGenreMetric(genre: string, metric: string, defaultValue: number): number {
    const baseline = this.getGenreBaseline(genre);
    return baseline?.[metric] ?? defaultValue;
  }

  setGenreBaseline(genre: string, metrics: Record<string, number>): void {
    this.genreBaselines[genre] = { ...this.genreBaselines[genre], ...metrics };
  }

  applyGenreBaseline(detectorType: string, genre: string): void {
    const baseline = getGenreBaseline(genre);
    const rules = this.getRules(detectorType);
    const defaultThresholds = this.defaultThresholds.get(detectorType);

    for (const rule of rules) {
      if (defaultThresholds?.has(rule.id)) {
        rule.threshold = defaultThresholds.get(rule.id)!;
      }
      const adjusted = this._adjustThresholdForGenre(rule, detectorType, baseline);
      if (adjusted !== null) {
        rule.threshold = adjusted;
      }
    }
  }

  private _adjustThresholdForGenre(
    rule: DetectorRule,
    detectorType: string,
    baseline: GenreBaseline,
  ): number | null {
    const defaultBaseline = getGenreBaseline('default');

    switch (detectorType) {
      case 'hook-detector': {
        if (rule.id === 'hook-none') {
          return baseline.hook.weakThreshold;
        }
        if (rule.id === 'hook-weak') {
          return baseline.hook.mediumThreshold;
        }
        if (rule.id === 'hook-low-tension') {
          return baseline.hook.strongThreshold;
        }
        break;
      }
      case 'dialogue-pacing': {
        if (rule.id === 'dialogue-ratio-high') {
          return baseline.dialogue.maxRatio;
        }
        if (rule.id === 'dialogue-ratio-low') {
          return baseline.dialogue.minRatio;
        }
        if (rule.id === 'paragraph-too-short') {
          return baseline.pacing.avgParagraphLength * 0.5;
        }
        if (rule.id === 'paragraph-too-long') {
          return baseline.pacing.avgParagraphLength * 2;
        }
        if (rule.id === 'description-ratio-high') {
          return baseline.pacing.descriptionRatio;
        }
        if (rule.id === 'action-ratio-low') {
          return baseline.pacing.actionRatio;
        }
        break;
      }
      case 'cost-detector': {
        break;
      }
    }

    return null;
  }

  getRuleStats(detectorType: string): {
    totalRules: number;
    enabledRules: number;
    totalHits: number;
    avgPrecision: number;
  } {
    const rules = this.getRules(detectorType);
    const enabled = rules.filter(r => r.enabled);
    const totalHits = rules.reduce((sum, r) => sum + r.hitCount, 0);
    const rulesWithPrecision = rules.filter(r => typeof r.precision === 'number');
    const avgPrecision = rulesWithPrecision.length > 0
      ? rulesWithPrecision.reduce((sum, r) => sum + (r.precision ?? 0), 0) / rulesWithPrecision.length
      : 0;

    return {
      totalRules: rules.length,
      enabledRules: enabled.length,
      totalHits,
      avgPrecision,
    };
  }

  pruneLowQualityRules(detectorType: string, minPrecision = 0.2, minHitCount = 10): string[] {
    const ruleMap = this.detectorRules.get(detectorType);
    if (!ruleMap) return [];

    const pruned: string[] = [];
    for (const [id, rule] of ruleMap.entries()) {
      if (rule.hitCount >= minHitCount && rule.precision !== undefined && rule.precision < minPrecision) {
        rule.enabled = false;
        pruned.push(id);
      }
    }
    return pruned;
  }
}
