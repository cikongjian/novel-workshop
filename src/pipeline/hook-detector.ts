/**
 * 章末钩子强度检测器（进化版）
 *
 * 纯算法实现，零AI调用，毫秒级完成。
 *
 * 优化改进：
 * - 位置加权：越靠后的段落权重越高
 * - 长度归一化：按字数归一化，避免长文/短文偏差
 * - 题材自适应：不同题材有不同的强度基准
 * - 可进化：阈值、权重可根据反馈动态调整
 * - 置信度：每条结果附带置信度
 */

import { EvolvableDetector } from './evolvable-detector.js';
import type { DetectorRule } from './evolvable-detector-types.js';
import { featureCache } from './feature-cache.js';

export type HookType = 'suspense' | 'anticipation' | 'danger' | 'twist' | 'emotion' | 'mixed' | 'none';

export type HookStrength = 'strong' | 'medium' | 'weak' | 'none';

export type HookFinding = {
  code:
    | 'hook-weak'
    | 'hook-none'
    | 'hook-poor-position'
    | 'hook-low-tension';
  level: 'warn' | 'error';
  message: string;
  chapter: number;
  confidence: number;
  ruleId: string;
  ruleName: string;
  details?: Record<string, unknown>;
};

export type HookReport = {
  findings: HookFinding[];
  passed: boolean;
  summary: string;
  hookType: HookType;
  hookStrength: HookStrength;
  tensionScore: number;
  hasEndingHook: boolean;
  score: number;
  totalRules: number;
  triggeredRules: number;
};

const SUSPENSE_WORDS = [
  '突然', '就在这时', '猛然', '赫然', '竟', '竟然', '居然', '意想不到',
  '不可思议', '难以置信', '万万没想到', '谁知', '哪知道', '不料',
  '秘密', '真相', '内情', '隐情', '谜团', '疑惑', '不解', '蹊跷',
  '难道', '莫非', '究竟', '到底', '怎么回事', '为什么',
  '暗道', '心中一动', '心头一震', '暗叫不好', '暗吃一惊', '心中暗惊',
  '隐隐', '隐约', '似乎', '仿佛', '感觉不对', '不对劲', '异常',
  '沉默', '半晌', '良久', '久久', '过了许久',
];

const DANGER_WORDS = [
  '危险', '危机', '陷阱', '埋伏', '伏击', '追杀', '围杀', '绝境',
  '死', '亡', '杀', '斩', '灭', '碎', '崩', '毁',
  '致命', '生死', '危在旦夕', '命悬一线', '千钧一发', '岌岌可危',
  '惊恐', '骇然', '色变', '心惊', '胆寒', '恐惧', '绝望',
  '伤势', '受伤', '流血', '剧痛', '筋疲力尽', '体力不支', '摇摇欲坠',
  '杀气', '寒意', '压迫感', '窒息', '冷汗', '脊背发凉', '毛骨悚然',
  '寡不敌众', '四面楚歌', '走投无路', '进退两难', '凶多吉少',
];

const ANTICIPATION_WORDS = [
  '明日', '次日', '明天', '下月', '来年', '届时', '到时候',
  '终将', '终究', '必将', '注定', '即将', '正要', '就要',
  '好戏', '精彩', '好戏开场', '拭目以待', '等着瞧',
  '约定', '赌约', '承诺', '誓言', '秘约',
  '下一步', '接下来', '此后', '从今以后', '从今天起',
  '计划', '布局', '谋划', '筹谋', '暗中准备', '蓄势待发',
  '只要', '一旦', '等到', '待到',
];

const TWIST_WORDS = [
  '原来', '竟然是', '居然是', '不曾想', '没想到', '恍然大悟',
  '真相是', '原来如此', '难怪', '怪不得',
  '身份', '真面目', '真实身份', '伪装', '假扮',
  '反转', '逆转', '翻盘', '局面反转', '形势逆转',
  '不是…而是', '并非', '实则', '实际上',
];

const EMOTION_WORDS = [
  '绝笔', '遗书', '遗言', '最后一封信', '诀别', '永别',
  '发抖', '颤抖', '颤栗', '战栗', '浑身一颤', '全身一震',
  '僵住', '愣住', '呆住', '怔在原地', '呆立当场',
  '心碎', '心痛', '心如刀绞', '肝肠寸断', '痛彻心扉',
  '崩溃', '崩塌', '失控', '失声', '哽咽', '泣不成声',
  '恨意', '仇恨', '怨', '不甘', '悔恨', '懊悔',
  '死死攥着', '攥紧', '紧握', '咬牙', '咬紧', '指甲掐入',
  '沉默了很久', '久久不语', '一言不发', '半晌没说话',
  '眼泪', '泪水', '眼眶发红', '红了眼眶', '湿了眼角',
];

const UNKNOWN_ENDING_PATTERNS = [
  /没有答案/,
  /不知道/,
  /谁也不知道/,
  /没有人知道/,
  /成了一个谜/,
  /成了谜团/,
  /永远的秘密/,
  /就当从未/,
  /就当没/,
  /……$/,
  /\.\.\.$/,
];

const QUESTION_PATTERNS = [
  /[？?]/,
  /难道/,
  /莫非/,
  /究竟/,
  /到底/,
  /怎么回事/,
  /为什么/,
];

const POSITION_WEIGHTS = [1.0, 0.85, 0.7, 0.55, 0.4];
const ENDING_ZONE_PARAGRAPHS = 2;
const TENSION_NORMALIZE_BASE = 500;

const DEFAULT_HOOK_RULES: DetectorRule[] = [
  {
    id: 'hook-none',
    name: '章末无钩子',
    description: '章节末尾缺少钩子元素',
    category: 'hook-strength',
    severity: 'warn',
    enabled: true,
    priority: 1,
    threshold: 0.5,
    weight: 1.0,
    hitCount: 0,
    falsePositiveCount: 0,
    truePositiveCount: 0,
    lastUpdated: Date.now(),
  },
  {
    id: 'hook-weak',
    name: '章末钩子偏弱',
    description: '章节末尾钩子强度不足',
    category: 'hook-strength',
    severity: 'warn',
    enabled: true,
    priority: 2,
    threshold: 2.0,
    weight: 0.8,
    hitCount: 0,
    falsePositiveCount: 0,
    truePositiveCount: 0,
    lastUpdated: Date.now(),
  },
  {
    id: 'hook-poor-position',
    name: '钩子位置不佳',
    description: '钩子不在章节最末尾，收尾冲击力不足',
    category: 'hook-position',
    severity: 'warn',
    enabled: true,
    priority: 3,
    threshold: 0.5,
    weight: 0.6,
    hitCount: 0,
    falsePositiveCount: 0,
    truePositiveCount: 0,
    lastUpdated: Date.now(),
  },
  {
    id: 'hook-low-tension',
    name: '钩子张力不足',
    description: '中等钩子的情感张力偏低',
    category: 'hook-quality',
    severity: 'warn',
    enabled: true,
    priority: 4,
    threshold: 7.0,
    weight: 0.5,
    hitCount: 0,
    falsePositiveCount: 0,
    truePositiveCount: 0,
    lastUpdated: Date.now(),
  },
];

export class HookDetector extends EvolvableDetector<HookFinding> {
  protected readonly detectorType = 'hook-detector';

  protected registerDefaultRules(): void {
    this.addDefaultRules(DEFAULT_HOOK_RULES);
  }

  protected buildFinding(
    rule: DetectorRule,
    chapter: number,
    message: string,
    confidence: number,
    details?: Record<string, unknown>,
  ): HookFinding {
    const base = super.buildFinding(rule, chapter, message, confidence, details);
    return {
      ...base,
      code: rule.id as HookFinding['code'],
    };
  }

  protected detectInternal(content: string, chapterNumber: number, rules: DetectorRule[]): HookFinding[] {
    const findings: HookFinding[] = [];

    const paragraphs = featureCache.getSemanticParagraphs(content);
    if (paragraphs.length === 0) {
      return findings;
    }

    const { tensionScore, typeScores, hasEndingHook, hookTypes } = this.analyzeTension(paragraphs);

    const hookType = this.determineHookType(typeScores);
    const hookStrength = this.determineHookStrength(tensionScore, hasEndingHook);

    const weakRule = rules.find(r => r.id === 'hook-weak');
    const noneRule = rules.find(r => r.id === 'hook-none');
    const positionRule = rules.find(r => r.id === 'hook-poor-position');
    const tensionRule = rules.find(r => r.id === 'hook-low-tension');

    const weakThreshold = weakRule ? this.getEffectiveThreshold(weakRule) : 2.0;
    const noneThreshold = noneRule ? this.getEffectiveThreshold(noneRule) : 0.5;
    const positionThreshold = positionRule ? this.getEffectiveThreshold(positionRule) : 0.5;
    const tensionThreshold = tensionRule ? this.getEffectiveThreshold(tensionRule) : 7.0;

    if (hookStrength === 'none' || hookStrength === 'weak') {
      const rule = hookStrength === 'none' ? noneRule : weakRule;
      const threshold = hookStrength === 'none' ? noneThreshold : weakThreshold;
      if (rule) {
        const confidence = Math.min(1, (threshold - tensionScore) / threshold + 0.3);
        findings.push(this.buildFinding(rule, chapterNumber,
          hookStrength === 'none'
            ? '章末缺少钩子，建议在结尾设置悬念、危机或期待，吸引读者继续阅读'
            : '章末钩子强度较弱，建议增强结尾的张力（如增加危机感、悬念感或期待感）',
          confidence,
          { tensionScore, hookType }
        ));
      }
    }

    if (hookStrength !== 'none' && !hasEndingHook) {
      if (positionRule) {
        const confidence = Math.min(1, positionThreshold + 0.2);
        findings.push(this.buildFinding(positionRule, chapterNumber,
          '钩子不在章节最末尾，建议将最有张力的内容放在最后两段，强化收尾冲击力',
          confidence,
          { tensionScore }
        ));
      }
    }

    if (hookStrength === 'medium' && tensionScore < tensionThreshold) {
      if (tensionRule) {
        const confidence = Math.min(1, (tensionThreshold - tensionScore) / tensionThreshold + 0.3);
        findings.push(this.buildFinding(tensionRule, chapterNumber,
          '章末钩子情感张力一般，建议增加紧迫感词汇或直接抛出核心疑问，让读者更想看下一章',
          confidence,
          { tensionScore, hookType }
        ));
      }
    }

    return findings;
  }

 detect(content: string, chapterNumber: number): HookReport {
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

    const paragraphs = featureCache.getSemanticParagraphs(content);
    if (paragraphs.length === 0) {
      return {
        findings: [],
        passed: true,
        summary: '通过',
        hookType: 'none',
        hookStrength: 'none',
        tensionScore: 0,
        hasEndingHook: false,
        score: 100,
        totalRules: rules.length,
        triggeredRules: 0,
      };
    }

    const { tensionScore, hasEndingHook, typeScores } = this.analyzeTension(paragraphs);
    const hookType = this.determineHookType(typeScores);
    const hookStrength = this.determineHookStrength(tensionScore, hasEndingHook);

    const summary = findings.length > 0
      ? `${findings.length} 项钩子优化建议`
      : `钩子强度：${this._strengthLabel(hookStrength)}（${this._typeLabel(hookType)}）`;

    return {
      findings,
      passed,
      summary,
      score,
      totalRules: rules.length,
      triggeredRules: new Set(findings.map(f => f.ruleId)).size,
      hookType,
      hookStrength,
      tensionScore,
      hasEndingHook,
    };
  }

  private analyzeTension(paragraphs: string[]): {
    tensionScore: number;
    typeScores: Record<string, number>;
    hasEndingHook: boolean;
    hookTypes: string[];
  } {
    const endZoneParas = this._getEndZone(paragraphs);
    const endZoneText = endZoneParas.join('\n');
    const endZoneLen = endZoneText.length || 1;

    const suspenseScore = this._countKeywordsCached(endZoneText, SUSPENSE_WORDS) / (endZoneLen / 200);
    const dangerScore = this._countKeywordsCached(endZoneText, DANGER_WORDS) / (endZoneLen / 200);
    const anticipationScore = this._countKeywordsCached(endZoneText, ANTICIPATION_WORDS) / (endZoneLen / 200);
    const twistScore = this._countKeywordsCached(endZoneText, TWIST_WORDS) / (endZoneLen / 200);
    const emotionScore = this._countKeywordsCached(endZoneText, EMOTION_WORDS) / (endZoneLen / 200);

    let questionScore = 0;
    for (const pattern of QUESTION_PATTERNS) {
      if (pattern.test(endZoneText)) questionScore++;
    }
    questionScore = questionScore / (endZoneLen / 200);

    let unknownEndingScore = 0;
    for (const pattern of UNKNOWN_ENDING_PATTERNS) {
      if (pattern.test(endZoneText)) unknownEndingScore += 0.5;
    }

    const positionBonus = this._calculatePositionBonus(paragraphs);

    const tensionScore = (
      suspenseScore * 2.0 +
      dangerScore * 2.5 +
      anticipationScore * 1.5 +
      twistScore * 3.0 +
      questionScore * 1.5 +
      emotionScore * 2.2 +
      unknownEndingScore * 2.0
    ) * positionBonus;

    const typeScores: Record<string, number> = {
      suspense: suspenseScore,
      danger: dangerScore,
      anticipation: anticipationScore,
      twist: twistScore,
      emotion: emotionScore,
    };

    const hasEndingHook = this.detectEndingHook(endZoneText);

    const hookTypes = Object.entries(typeScores)
      .filter(([, score]) => score > 0.3)
      .map(([type]) => type);

    return { tensionScore, typeScores, hasEndingHook, hookTypes };
  }

  private determineHookType(typeScores: Record<string, number>): HookType {
    const entries = Object.entries(typeScores).filter(([, v]) => v > 0);
    if (entries.length === 0) return 'none';

    const aboveThreshold = entries.filter(([, v]) => v > 0.5);
    if (aboveThreshold.length >= 2) return 'mixed';

    const maxEntry = entries.reduce((a, b) => a[1] > b[1] ? a : b);
    return maxEntry[0] as HookType;
  }

  private determineHookStrength(tensionScore: number, hasEndingHook: boolean): HookStrength {
    const strongThreshold = this.getGenreMetric('hookStrong', 8);
    const mediumThreshold = this.getGenreMetric('hookMedium', 5);
    const weakThreshold = this.getGenreMetric('hookWeak', 2);

    if (tensionScore >= strongThreshold && hasEndingHook) return 'strong';
    if (tensionScore >= mediumThreshold && hasEndingHook) return 'medium';
    if (tensionScore >= weakThreshold) return 'weak';
    return 'none';
  }

  private _countKeywordsCached(text: string, words: string[]): number {
    const counts = featureCache.countKeywords(text, words);
    let total = 0;
    counts.forEach(v => { total += v; });
    return total;
  }

  private detectEndingHook(endingText: string): boolean {
    const allWords = [
      ...SUSPENSE_WORDS, ...DANGER_WORDS, ...ANTICIPATION_WORDS,
      ...TWIST_WORDS, ...EMOTION_WORDS,
    ];
    for (const word of allWords) {
      if (endingText.includes(word)) return true;
    }
    if (/[？?]/.test(endingText)) return true;
    for (const pattern of UNKNOWN_ENDING_PATTERNS) {
      if (pattern.test(endingText)) return true;
    }
    return false;
  }

  private _strengthLabel(strength: HookStrength): string {
    switch (strength) {
      case 'strong': return '强';
      case 'medium': return '中';
      case 'weak': return '弱';
      case 'none': return '无';
    }
  }

  private _typeLabel(type: HookType): string {
    switch (type) {
      case 'suspense': return '悬念型';
      case 'anticipation': return '期待型';
      case 'danger': return '危机型';
      case 'twist': return '反转型';
      case 'emotion': return '情感型';
      case 'mixed': return '复合型';
      case 'none': return '无';
    }
  }

  private _getEndZone(paragraphs: string[]): string[] {
    const totalLen = paragraphs.reduce((sum, p) => sum + p.length, 0);
    const targetLen = Math.min(600, Math.floor(totalLen * 0.25));
    let accumulated = 0;
    const result: string[] = [];
    for (let i = paragraphs.length - 1; i >= 0; i--) {
      result.unshift(paragraphs[i]);
      accumulated += paragraphs[i].length;
      if (accumulated >= targetLen) break;
    }
    return result.length > 0 ? result : paragraphs;
  }

  private _calculatePositionBonus(paragraphs: string[]): number {
    const totalLen = paragraphs.reduce((sum, p) => sum + p.length, 0);
    if (totalLen === 0) return 1;
    const lastPara = paragraphs[paragraphs.length - 1];
    const secondLast = paragraphs[paragraphs.length - 2] || '';
    const endLen = lastPara.length + secondLast.length * 0.5;
    const ratio = endLen / totalLen;
    if (ratio > 0.15) return 1.2;
    if (ratio > 0.08) return 1.0;
    if (ratio > 0.03) return 0.85;
    return 0.7;
  }
}
