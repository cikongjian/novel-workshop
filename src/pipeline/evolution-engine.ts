import type { ClicheRule, EvolutionStrategy, EvolutionResult, ClicheFinding, DetectorType, ClicheCategory } from './anti-cliche-types.js';
import { ClicheRuleStore } from './cliche-rule-store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('evolution-engine');

const PRECISION_THRESHOLD = 0.6;
const FALSE_POSITIVE_THRESHOLD = 5;
const MIN_HIT_COUNT_FOR_EVAL = 10;
const MAX_RULES_PER_TYPE = 50;

export class EvolutionEngine {
  private ruleStore: ClicheRuleStore;

  constructor(ruleStore: ClicheRuleStore) {
    this.ruleStore = ruleStore;
  }

  async evolve(): Promise<EvolutionResult> {
    const strategies = this.ruleStore.getStrategies().filter(s => s.enabled);
    const result: EvolutionResult = {
      updatedRules: [],
      newRules: [],
      removedRules: [],
      adjustedThresholds: [],
      strategyApplied: '',
      statistics: { precisionImprovement: 0, recallImprovement: 0 },
    };

    if (strategies.length === 0) {
      return result;
    }

    const primaryStrategy = strategies[0];
    result.strategyApplied = primaryStrategy.id;

    const rules = this.ruleStore.getGlobalRules();
    let precisionSum = 0;
    let precisionCount = 0;

    for (const rule of rules) {
      const beforePrecision = rule.precision || 0;

      this.applyStrategy(rule, primaryStrategy);
      this.adjustThreshold(rule);
      this.pruneLowQualityRules(rule, result);

      const afterPrecision = rule.precision || 0;
      if (beforePrecision > 0) {
        precisionSum += afterPrecision - beforePrecision;
        precisionCount++;
      }

      if (this.ruleStore.updateRule(rule.id, rule)) {
        result.updatedRules.push(rule);
      }
    }

    result.statistics.precisionImprovement = precisionCount > 0 ? precisionSum / precisionCount : 0;

    await this.learnNewRulesFromFindings();

    log.info('进化策略执行完成', {
      strategy: primaryStrategy.name,
      updatedRules: result.updatedRules.length,
      removedRules: result.removedRules.length,
      adjustedThresholds: result.adjustedThresholds.length,
      precisionImprovement: result.statistics.precisionImprovement.toFixed(3),
    });

    return result;
  }

  private applyStrategy(rule: ClicheRule, strategy: EvolutionStrategy): void {
    const total = rule.hitCount + rule.falsePositiveCount;
    if (total === 0) return;

    const precision = rule.hitCount / total;
    rule.precision = precision;

    if (strategy.targetMetric === 'precision') {
      if (precision < strategy.thresholds.minPrecision) {
        if (rule.falsePositiveCount >= FALSE_POSITIVE_THRESHOLD) {
          rule.enabled = false;
        } else {
          rule.threshold = Math.min(rule.threshold + 1, 10);
        }
      }
    } else if (strategy.targetMetric === 'recall') {
      if (rule.hitCount < MIN_HIT_COUNT_FOR_EVAL) {
        rule.threshold = Math.max(rule.threshold - 1, 1);
      }
    } else if (strategy.targetMetric === 'f1') {
      const recall = total > 0 ? rule.hitCount / total : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

      if (f1 < strategy.thresholds.minF1) {
        if (precision < strategy.thresholds.minPrecision) {
          rule.threshold = Math.min(rule.threshold + 1, 10);
        } else if (recall < strategy.thresholds.minRecall) {
          rule.threshold = Math.max(rule.threshold - 1, 1);
        }
      }
    }
  }

  private adjustThreshold(rule: ClicheRule): void {
    const total = rule.hitCount + rule.falsePositiveCount;
    if (total < MIN_HIT_COUNT_FOR_EVAL) return;

    const precision = rule.hitCount / total;

    if (precision < PRECISION_THRESHOLD) {
      rule.threshold = Math.min(rule.threshold + 1, 10);
    } else if (precision > 0.9 && rule.threshold > 1) {
      rule.threshold = rule.threshold - 1;
    }
  }

  private pruneLowQualityRules(rule: ClicheRule, result: EvolutionResult): void {
    const total = rule.hitCount + rule.falsePositiveCount;

    if (total >= MIN_HIT_COUNT_FOR_EVAL) {
      const precision = rule.hitCount / total;

      if (precision < 0.3) {
        this.ruleStore.deleteRule(rule.id);
        result.removedRules.push(rule.id);
        log.info('移除低质量规则', { ruleId: rule.id, name: rule.name, precision: precision.toFixed(2) });
      }
    }
  }

  private async learnNewRulesFromFindings(): Promise<void> {
    const existingRules = this.ruleStore.getGlobalRules();
    const existingPatterns = new Set<string>();

    for (const rule of existingRules) {
      if (!rule.pattern) continue;
      if (Array.isArray(rule.pattern)) {
        rule.pattern.forEach(p => { if (p) existingPatterns.add(p); });
      } else {
        existingPatterns.add(rule.pattern);
      }
    }

    const potentialNewPatterns = this.extractPotentialNewPatterns(existingRules);

    for (const pattern of potentialNewPatterns) {
      if (!existingPatterns.has(pattern.text)) {
        const newRule: ClicheRule = {
          id: this.ruleStore.generateRuleId(pattern.type),
          type: pattern.type as DetectorType,
          category: pattern.category as ClicheCategory,
          name: pattern.name,
          description: pattern.description,
          pattern: pattern.text,
          severity: 'low',
          threshold: 2,
          enabled: true,
          priority: 50,
          lastUpdated: new Date().toISOString(),
          hitCount: 0,
          falsePositiveCount: 0,
          tags: ['auto-learned', ...pattern.tags],
        };

        this.ruleStore.addRule(newRule);
        this.ruleStore.addEvolutionEvent({
          type: 'auto-learn',
          ruleId: newRule.id,
          data: { source: pattern.source, confidence: pattern.confidence },
        });

        log.info('自动学习新规则', { ruleId: newRule.id, name: newRule.name, pattern: newRule.pattern });
      }
    }
  }

  private extractPotentialNewPatterns(rules: ClicheRule[]): Array<{
    text: string;
    type: string;
    category: string;
    name: string;
    description: string;
    tags: string[];
    source: string;
    confidence: number;
  }> {
    const patterns: Array<{
      text: string;
      type: string;
      category: string;
      name: string;
      description: string;
      tags: string[];
      source: string;
      confidence: number;
    }> = [];

    const highHitRules = rules.filter(r => r.hitCount >= 10 && r.enabled);

    for (const rule of highHitRules) {
      if (!rule.pattern) continue;
      const existingPatterns = Array.isArray(rule.pattern) ? rule.pattern : [rule.pattern];

      const relatedPatterns = this.findRelatedPatterns(existingPatterns, rule.category);
      for (const related of relatedPatterns) {
        if (!existingPatterns.includes(related)) {
          patterns.push({
            text: related,
            type: rule.type,
            category: rule.category,
            name: `${rule.name}-变体`,
            description: `与"${rule.name}"相关的套路化表达`,
            tags: rule.tags,
            source: 'pattern-expansion',
            confidence: 0.7,
          });
        }
      }
    }

    return patterns.slice(0, 10);
  }

  private findRelatedPatterns(basePatterns: string[], category: string): string[] {
    const patternExpansions: Record<string, string[]> = {
      expression: [
        '深吸一口气', '深吸了一口气', '深深吸了一口气',
        '眉头微皱', '眉头一皱', '皱起眉头',
        '嘴角上扬', '嘴角微微上扬', '勾起嘴角',
        '眼神一闪', '眼神微闪', '目光一闪',
        '心中一动', '心念一动', '心中暗道',
        '冷笑一声', '一声冷笑', '冷笑连连',
        '沉默片刻', '沉默了片刻', '陷入沉默',
        '脸色一变', '面色一变', '脸色骤变',
      ],
      plot: [
        '不自量力', '自取其辱', '螳臂当车',
        '震惊全场', '震惊四座', '全场震惊',
        '不敢置信', '难以置信', '无法置信',
        '跪地求饶', '求饶不已', '苦苦哀求',
        '落荒而逃', '仓皇而逃', '狼狈逃窜',
      ],
      dialogue: [
        '厉声说道', '沉声说道', '冷冷说道',
        '淡淡说道', '缓缓说道', '轻轻说道',
        '怒吼道', '咆哮道', '嘶喊道',
        '质问道', '反驳道', '辩解道',
      ],
      narrative: [
        '话分两头', '花开两朵', '暂且不提',
        '光阴似箭', '日月如梭', '时光飞逝',
        '欲知后事', '下回分解', '敬请期待',
      ],
    };

    const expansions = patternExpansions[category] || [];
    const results: string[] = [];

    for (const expansion of expansions) {
      let hasOverlap = false;
      for (const base of basePatterns) {
        if (expansion.includes(base) || base.includes(expansion)) {
          hasOverlap = true;
          break;
        }
      }
      if (!hasOverlap) {
        results.push(expansion);
      }
    }

    return results;
  }

  async recordFeedback(ruleId: string, isFalsePositive: boolean, novelId?: string): Promise<void> {
    if (isFalsePositive) {
      this.ruleStore.recordFalsePositive(ruleId, novelId);
      this.ruleStore.addEvolutionEvent({
        type: 'feedback',
        ruleId,
        data: { isFalsePositive: true },
      });
    } else {
      this.ruleStore.recordHit(ruleId, novelId);
    }

    await this.triggerConditionalEvolution();
  }

  private async triggerConditionalEvolution(): Promise<void> {
    const events = this.ruleStore.getState().evolutionEvents;
    const recentFeedbackEvents = events.filter(e => e.type === 'feedback').slice(-20);

    if (recentFeedbackEvents.length >= 10) {
      log.info('反馈积累达到阈值，触发进化');
      await this.evolve();
    }
  }

  async autoLearnFromFindings(findings: ClicheFinding[]): Promise<void> {
    for (const finding of findings) {
      this.ruleStore.recordHit(finding.ruleId);
    }

    const rules = this.ruleStore.getGlobalRules();
    for (const rule of rules) {
      if (rule.hitCount >= MIN_HIT_COUNT_FOR_EVAL) {
        this.ruleStore.addEvolutionEvent({
          type: 'rule-update',
          ruleId: rule.id,
          data: { hitCount: rule.hitCount, precision: rule.precision },
        });
      }
    }
  }
}