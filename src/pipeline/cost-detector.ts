/**
 * 代价感检测器（进化版）
 *
 * 检测战斗/冲突场景中主角是否"无伤碾压"。
 * 纯算法实现，基于文本特征分析。
 *
 * 优化改进：
 * - 可进化：阈值、权重可根据反馈动态调整
 * - 置信度：每条结果附带置信度
 * - 题材自适应：不同题材有不同战斗代价基准
 */

import { EvolvableDetector } from './evolvable-detector.js';
import type { DetectorRule } from './evolvable-detector-types.js';
import { featureCache } from './feature-cache.js';

export type CostFinding = {
  code: 'no-cost-combat' | 'overpowered-protagonist' | 'missing-consequences' | 'unearned-victory';
  level: 'warn' | 'error';
  message: string;
  chapter: number;
  confidence: number;
  ruleId: string;
  ruleName: string;
  details?: Record<string, unknown>;
};

export type CostReport = {
  findings: CostFinding[];
  passed: boolean;
  summary: string;
  score: number;
  totalRules: number;
  triggeredRules: number;
};

const DAMAGE_KEYWORDS = [
  '受伤', '流血', '伤口', '血', '痛', '疼', '伤', '骨折', '擦伤', '淤青',
  '力竭', '虚弱', '喘息', '汗', '呼吸困难', '疲惫', '透支', '消耗',
];

const VICTORY_KEYWORDS = [
  '击败', '杀死', '消灭', '击退', '战胜', '赢', '胜利', '解决', '制服', '放倒',
];

const WEAPON_KEYWORDS = [
  '枪', '刀', '剑', '弓', '箭', '弹', '炮', '斧', '锤', '匕首', '狙击', '步枪',
];

const ACTION_KEYWORDS = [
  '冲', '扑', '抓', '推', '拉', '砸', '撞', '拔', '刺', '躲', '追', '跑',
  '挡', '闪', '避', '防', '守', '攻', '击', '砍', '劈', '挥', '射', '打',
  '斩', '杀', '刺', '戳', '扫', '踢', '摔', '扔', '丢', '爆', '炸',
];

const RESOURCE_MENTION_WORDS = ['弹药', '子弹', '药', '体力', '灵力', '真气', '法力', '能量'];
const RESOURCE_DEPLETED_WORDS = ['耗尽', '用完', '不够', '只剩', '不足', '见底'];

const DEFAULT_COST_RULES: DetectorRule[] = [
  {
    id: 'no-cost-combat',
    name: '无代价战斗',
    description: '战斗场景中主角取得胜利但未付出明显代价',
    category: 'combat-cost',
    severity: 'warn',
    enabled: true,
    priority: 1,
    threshold: 1,
    weight: 1.0,
    hitCount: 0,
    falsePositiveCount: 0,
    truePositiveCount: 0,
    lastUpdated: Date.now(),
  },
  {
    id: 'overpowered-protagonist',
    name: '主角过强',
    description: '敌人有攻击但主角完全未受伤',
    category: 'combat-cost',
    severity: 'warn',
    enabled: true,
    priority: 2,
    threshold: 1,
    weight: 0.8,
    hitCount: 0,
    falsePositiveCount: 0,
    truePositiveCount: 0,
    lastUpdated: Date.now(),
  },
  {
    id: 'unearned-victory',
    name: '胜利来得太容易',
    description: '连续多次胜利但主角未付出任何代价',
    category: 'combat-cost',
    severity: 'error',
    enabled: true,
    priority: 3,
    threshold: 2,
    weight: 1.2,
    hitCount: 0,
    falsePositiveCount: 0,
    truePositiveCount: 0,
    lastUpdated: Date.now(),
  },
  {
    id: 'missing-consequences',
    name: '缺少后果',
    description: '提及了资源但未展示消耗或限制',
    category: 'resource-cost',
    severity: 'warn',
    enabled: true,
    priority: 4,
    threshold: 1,
    weight: 0.6,
    hitCount: 0,
    falsePositiveCount: 0,
    truePositiveCount: 0,
    lastUpdated: Date.now(),
  },
];

type CombatScene = { title: string; content: string; startIndex: number; intensity: number };
type CombatAnalysis = {
  hasVictory: boolean;
  hasCost: boolean;
  victoryCount: number;
  costCount: number;
  enemyActionCount: number;
  protagonistDamageCount: number;
  intensity: number;
};

export class CostDetector extends EvolvableDetector<CostFinding> {
  protected readonly detectorType = 'cost-detector';

  protected registerDefaultRules(): void {
    this.addDefaultRules(DEFAULT_COST_RULES);
  }

  protected buildFinding(
    rule: DetectorRule,
    chapter: number,
    message: string,
    confidence: number,
    details?: Record<string, unknown>,
  ): CostFinding {
    const base = super.buildFinding(rule, chapter, message, confidence, details);
    return {
      ...base,
      code: rule.id as CostFinding['code'],
    };
  }

  protected detectInternal(content: string, chapterNumber: number, rules: DetectorRule[]): CostFinding[] {
    const findings: CostFinding[] = [];
    const paragraphs = featureCache.getParagraphs(content);

    const noCostRule = rules.find(r => r.id === 'no-cost-combat');
    const overpoweredRule = rules.find(r => r.id === 'overpowered-protagonist');
    const unearnedRule = rules.find(r => r.id === 'unearned-victory');
    const missingConsequencesRule = rules.find(r => r.id === 'missing-consequences');

    const combatScenes = this.extractCombatScenes(paragraphs);

    for (const scene of combatScenes) {
      const analysis = this.analyzeCombatScene(scene);
      const intensityFactor = Math.min(1, scene.intensity / 0.03);

      if (noCostRule && analysis.hasVictory && !analysis.hasCost) {
        const confidence = 0.4 + intensityFactor * 0.4;
        findings.push(this.buildFinding(noCostRule, chapterNumber,
          `战斗场景"${scene.title}"中主角取得胜利但未付出明显代价（无受伤/消耗描写）`,
          confidence,
          { scene: scene.title, intensity: scene.intensity }
        ));
      }

      if (overpoweredRule && analysis.enemyActionCount > 0 && analysis.protagonistDamageCount === 0) {
        const confidence = 0.3 + intensityFactor * 0.4;
        findings.push(this.buildFinding(overpoweredRule, chapterNumber,
          `战斗场景"${scene.title}"中敌人有${analysis.enemyActionCount}次攻击动作，但主角未受伤`,
          confidence,
          { scene: scene.title, enemyActions: analysis.enemyActionCount }
        ));
      }

      if (unearnedRule && analysis.victoryCount >= this.getEffectiveThreshold(unearnedRule) && analysis.costCount === 0) {
        const confidence = 0.5 + intensityFactor * 0.3;
        findings.push(this.buildFinding(unearnedRule, chapterNumber,
          `连续${analysis.victoryCount}次胜利但主角未付出任何代价，建议增加受伤或资源消耗`,
          confidence,
          { victoryCount: analysis.victoryCount, intensity: scene.intensity }
        ));
      }
    }

    if (missingConsequencesRule) {
      const resourceMentioned = RESOURCE_MENTION_WORDS.some(k => content.includes(k));
      const resourceDepleted = RESOURCE_DEPLETED_WORDS.some(k => content.includes(k));
      if (resourceMentioned && !resourceDepleted) {
        const mentionCount = RESOURCE_MENTION_WORDS.filter(k => content.includes(k)).length;
        const confidence = Math.min(0.7, 0.3 + mentionCount * 0.1);
        findings.push(this.buildFinding(missingConsequencesRule, chapterNumber,
          '提及了资源但未展示消耗或限制，建议增加资源压力',
          confidence
        ));
      }
    }

    return findings;
  }

  detect(content: string, chapterNumber: number): CostReport {
    this.ensureInitialized();
    const report = super.detect(content, chapterNumber);
    return {
      ...report,
      summary: report.findings.length > 0
        ? `代价感检测：${report.findings.filter(f => f.level === 'error').length} 个错误，${report.findings.filter(f => f.level === 'warn').length} 个警告`
        : '代价感检测通过',
    };
  }

  private extractCombatScenes(paragraphs: string[]): CombatScene[] {
    const scenes: CombatScene[] = [];
    let inCombat = false;
    let combatStart = 0;
    let combatContent: string[] = [];
    let intensitySum = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const paraLen = p.length || 1;
      const hasAction = ACTION_KEYWORDS.some(k => p.includes(k));
      const hasWeapon = WEAPON_KEYWORDS.some(k => p.includes(k));
      const hasVictory = VICTORY_KEYWORDS.some(k => p.includes(k));
      const hasDamage = DAMAGE_KEYWORDS.some(k => p.includes(k));

      const actionCount = ACTION_KEYWORDS.filter(k => p.includes(k)).length;
      const intensity = actionCount / paraLen;

      const isCombatParagraph = hasAction && (hasWeapon || hasVictory || hasDamage);

      if (isCombatParagraph && !inCombat) {
        inCombat = true;
        combatStart = i;
        combatContent = [p];
        intensitySum = intensity;
      } else if (isCombatParagraph && inCombat) {
        combatContent.push(p);
        intensitySum += intensity;
      } else if (!isCombatParagraph && inCombat) {
        if (combatContent.length >= 2) {
          const avgIntensity = intensitySum / combatContent.length;
          scenes.push({
            title: combatContent[0].slice(0, 30) + (combatContent[0].length > 30 ? '...' : ''),
            content: combatContent.join('\n'),
            startIndex: combatStart,
            intensity: avgIntensity,
          });
        }
        inCombat = false;
        combatContent = [];
        intensitySum = 0;
      }
    }

    if (inCombat && combatContent.length >= 2) {
      const avgIntensity = intensitySum / combatContent.length;
      scenes.push({
        title: combatContent[0].slice(0, 30) + (combatContent[0].length > 30 ? '...' : ''),
        content: combatContent.join('\n'),
        startIndex: combatStart,
        intensity: avgIntensity,
      });
    }

    return scenes;
  }

  private analyzeCombatScene(scene: CombatScene): CombatAnalysis {
    const text = scene.content;

    const hasVictory = VICTORY_KEYWORDS.some(k => text.includes(k));
    const hasCost = DAMAGE_KEYWORDS.some(k => text.includes(k));

    let victoryCount = 0;
    for (const kw of VICTORY_KEYWORDS) {
      const re = new RegExp(kw, 'g');
      const matches = text.match(re);
      victoryCount += matches ? matches.length : 0;
    }

    let costCount = 0;
    for (const kw of DAMAGE_KEYWORDS) {
      const re = new RegExp(kw, 'g');
      const matches = text.match(re);
      costCount += matches ? matches.length : 0;
    }

    const enemyActionCount = this.countEnemyActions(text);
    const protagonistDamageCount = this.countProtagonistDamage(text);

    return {
      hasVictory,
      hasCost,
      victoryCount,
      costCount,
      enemyActionCount,
      protagonistDamageCount,
      intensity: scene.intensity,
    };
  }

  private countEnemyActions(text: string): number {
    let count = 0;
    const patterns = [
      /敌人(?:冲|扑|刺|砍|射|打|攻)/g,
      /对方(?:冲|扑|刺|砍|射|打|攻)/g,
      /(?:他|她|它)(?:冲|扑|刺|砍|射|打|攻)/g,
      /(?:子弹|箭矢|攻击)从/g,
      /(?:袭来|攻来|扑来|刺来|打来)/g,
    ];
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      count += matches ? matches.length : 0;
    }
    return count;
  }

  private countProtagonistDamage(text: string): number {
    let count = 0;
    const patterns = [
      /(?:我|主角|他|她)(?:受伤|流血|中枪|中弹|被刺|被砍)/g,
      /(?:肩膀|手臂|腿|胸口|腹部)(?:受伤|流血|中枪)/g,
      /(?:伤口|血)(?:在|从)(?:流|渗)/g,
    ];
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      count += matches ? matches.length : 0;
    }
    return count;
  }
}
