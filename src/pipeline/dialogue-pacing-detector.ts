import { EvolvableDetector } from './evolvable-detector.js';
import type { DetectorRule, DetectorFinding } from './evolvable-detector-types.js';
import { featureCache } from './feature-cache.js';
import { DEFAULT_DIALOGUE_PACING_RULES } from './dialogue-pacing-rules.js';
import { analyzePacing, detectMonotony } from './pacing-analyzer.js';
import type { PacingProfile } from '../novel/types.js';

export type DialoguePacingFinding = DetectorFinding & {
  code:
    | 'dialogue-ratio-high'
    | 'dialogue-ratio-low'
    | 'dialogue-monologue'
    | 'said-bookism'
    | 'pacing-monotony'
    | 'paragraph-too-short'
    | 'paragraph-too-long'
    | 'action-ratio-low'
    | 'description-ratio-high';
  level: 'warn';
};

export type DialoguePacingReport = {
  findings: DialoguePacingFinding[];
  passed: boolean;
  summary: string;
  pacing: PacingProfile;
  dialogueRatio: number;
  avgParagraphLength: number;
  score: number;
  totalRules: number;
  triggeredRules: number;
};

const DIALOGUE_RE = /[\u201c\u300c][\s\S]*?[\u201d\u300d]/g;

const SAID_WORDS = [
  '道', '说', '说道', '笑道', '冷笑道', '淡淡道', '沉声道', '轻声道',
  '问道', '答道', '回答', '低语', '喃喃', '嘟囔', '喊', '叫', '喝道',
  '怒斥', '冷笑', '笑骂', '叹道', '哼道', '暗道', '心想',
];

export class DialoguePacingDetector extends EvolvableDetector<DialoguePacingFinding> {
  protected readonly detectorType = 'dialogue-pacing';
  private pacingHistory: Map<string, PacingProfile[]> = new Map();

  protected registerDefaultRules(): void {
    this.addDefaultRules(DEFAULT_DIALOGUE_PACING_RULES);
  }

  protected buildFinding(
    rule: DetectorRule,
    chapter: number,
    message: string,
    confidence: number,
    details?: Record<string, unknown>,
  ): DialoguePacingFinding {
    const base = super.buildFinding(rule, chapter, message, confidence, details);
    return {
      ...base,
      code: rule.id as DialoguePacingFinding['code'],
      level: 'warn',
    };
  }

  protected detectInternal(
    content: string,
    chapterNumber: number,
    rules: DetectorRule[],
  ): DialoguePacingFinding[] {
    const findings: DialoguePacingFinding[] = [];
    const paragraphs = featureCache.getSemanticParagraphs(content);
    if (paragraphs.length === 0) return findings;

    const pacing = analyzePacing(content);
    const dialogueRatio = pacing.dialogue;
    const avgParagraphLength = Math.round(
      paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length,
    );

    const ratioHighRule = rules.find((r: DetectorRule) => r.id === 'dialogue-ratio-high');
    const ratioLowRule = rules.find((r: DetectorRule) => r.id === 'dialogue-ratio-low');
    const monologueRule = rules.find((r: DetectorRule) => r.id === 'dialogue-monologue');
    const saidRule = rules.find((r: DetectorRule) => r.id === 'said-bookism');
    const actionLowRule = rules.find((r: DetectorRule) => r.id === 'action-ratio-low');
    const descHighRule = rules.find((r: DetectorRule) => r.id === 'description-ratio-high');
    const paraShortRule = rules.find((r: DetectorRule) => r.id === 'paragraph-too-short');
    const paraLongRule = rules.find((r: DetectorRule) => r.id === 'paragraph-too-long');
    const monotonyRule = rules.find((r: DetectorRule) => r.id === 'pacing-monotony');

    if (ratioHighRule && dialogueRatio > ratioHighRule.threshold) {
      const confidence = this._calcConfidence(dialogueRatio, ratioHighRule.threshold, 'high');
      findings.push(this.buildFinding(
        ratioHighRule,
        chapterNumber,
        `对话占比过高（${Math.round(dialogueRatio * 100)}%），建议增加动作描写和环境烘托，避免全章对话`,
        confidence,
        { ratio: dialogueRatio },
      ));
    } else if (ratioLowRule && dialogueRatio < ratioLowRule.threshold) {
      const confidence = this._calcConfidence(dialogueRatio, ratioLowRule.threshold, 'low');
      findings.push(this.buildFinding(
        ratioLowRule,
        chapterNumber,
        `对话占比过低（${Math.round(dialogueRatio * 100)}%），建议适当增加角色对话互动，让角色更鲜活`,
        confidence,
        { ratio: dialogueRatio },
      ));
    }

    if (monologueRule) {
      const longDialogueStretches = this._countLongDialogueStretches(paragraphs);
      if (longDialogueStretches >= monologueRule.threshold) {
        const confidence = this._calcConfidence(longDialogueStretches, monologueRule.threshold, 'high');
        findings.push(this.buildFinding(
          monologueRule,
          chapterNumber,
          `存在 ${longDialogueStretches} 处连续大段对话，建议穿插动作、神态和心理描写，打破对话流的单调感`,
          confidence,
          { count: longDialogueStretches },
        ));
      }
    }

    if (saidRule) {
      const saidBookismScore = this._detectSaidBookism(content);
      if (saidBookismScore > saidRule.threshold) {
        const confidence = this._calcConfidence(saidBookismScore, saidRule.threshold, 'high');
        findings.push(this.buildFinding(
          saidRule,
          chapterNumber,
          `对话标签过于密集（每百字 ${Math.round(saidBookismScore * 100) / 100} 个），建议通过动作、神态、语气暗示说话人`,
          confidence,
          { density: saidBookismScore },
        ));
      }
    }

    if (actionLowRule && pacing.action < actionLowRule.threshold && dialogueRatio < 0.3) {
      const confidence = this._calcConfidence(pacing.action, actionLowRule.threshold, 'low');
      findings.push(this.buildFinding(
        actionLowRule,
        chapterNumber,
        `动作描写偏少（${Math.round(pacing.action * 100)}%），建议增加角色动作细节，让场景更有画面感`,
        confidence,
        { actionRatio: pacing.action },
      ));
    }

    if (descHighRule && pacing.description > descHighRule.threshold) {
      const confidence = this._calcConfidence(pacing.description, descHighRule.threshold, 'high');
      findings.push(this.buildFinding(
        descHighRule,
        chapterNumber,
        `环境描写偏多（${Math.round(pacing.description * 100)}%），建议精简环境描写，把笔墨集中在推动剧情和刻画角色上`,
        confidence,
        { descRatio: pacing.description },
      ));
    }

    if (paraShortRule && avgParagraphLength < paraShortRule.threshold && paragraphs.length > 20) {
      const confidence = this._calcConfidence(avgParagraphLength, paraShortRule.threshold, 'low');
      findings.push(this.buildFinding(
        paraShortRule,
        chapterNumber,
        `段落平均长度过短（${avgParagraphLength} 字），碎片化严重，建议适当合并相关段落，增加叙事连贯性`,
        confidence,
        { avgLength: avgParagraphLength },
      ));
    } else if (paraLongRule && avgParagraphLength > paraLongRule.threshold) {
      const confidence = this._calcConfidence(avgParagraphLength, paraLongRule.threshold, 'high');
      findings.push(this.buildFinding(
        paraLongRule,
        chapterNumber,
        `段落平均长度过长（${avgParagraphLength} 字），阅读压力大，建议拆分长段落，增加呼吸感`,
        confidence,
        { avgLength: avgParagraphLength },
      ));
    }

    return findings;
  }

  detect(
    content: string,
    chapterNumber: number,
    novelId: string = 'default',
  ): DialoguePacingReport {
    this.ensureInitialized();
    const rules = this.ruleStore.getRules(this.detectorType);
    const enabledRules = rules.filter(r => r.enabled);

    const paragraphs = featureCache.getSemanticParagraphs(content);
    if (paragraphs.length === 0) {
      return {
        findings: [],
        passed: true,
        summary: '通过',
        pacing: { dialogue: 0, action: 0, description: 0, psychology: 0, narration: 0 },
        dialogueRatio: 0,
        avgParagraphLength: 0,
        score: 100,
        totalRules: enabledRules.length,
        triggeredRules: 0,
      };
    }

    const findings = this.detectInternal(content, chapterNumber, enabledRules);
    const pacing = analyzePacing(content);
    const dialogueRatio = pacing.dialogue;
    const avgParagraphLength = Math.round(
      paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length,
    );

    const monotonyRule = enabledRules.find(r => r.id === 'pacing-monotony');
    if (monotonyRule) {
      const history = this.pacingHistory.get(novelId) || [];
      if (history.length >= 2) {
        const recentHistory = history.slice(-3);
        if (detectMonotony([...recentHistory, pacing])) {
          findings.push(this.buildFinding(
            monotonyRule,
            chapterNumber,
            `连续 ${recentHistory.length + 1} 章节奏分布高度相似，建议本章调整节奏配比，避免阅读疲劳`,
            0.6,
          ));
        }
      }
      this.pacingHistory.set(novelId, [...history, pacing].slice(-5));
    }

    const score = this._calcScore(findings.length, enabledRules.length);

    return {
      findings,
      passed: true,
      summary: findings.length > 0
        ? `${findings.length} 项节奏/对话优化建议`
        : '通过',
      pacing,
      dialogueRatio,
      avgParagraphLength,
      score,
      totalRules: enabledRules.length,
      triggeredRules: findings.length,
    };
  }

  private _countLongDialogueStretches(paragraphs: string[]): number {
    let count = 0;
    let consecutive = 0;

    for (const p of paragraphs) {
      const dialogueMatches = p.match(DIALOGUE_RE) || [];
      const dialogueLen = dialogueMatches.reduce((sum, m) => sum + m.length, 0);
      const dialogueRatio = p.length > 0 ? dialogueLen / p.length : 0;

      if (dialogueRatio > 0.7) {
        consecutive++;
      } else {
        if (consecutive >= 4) {
          count++;
        }
        consecutive = 0;
      }
    }

    if (consecutive >= 4) count++;
    return count;
  }

  private _detectSaidBookism(content: string): number {
    const dialogueMatches = content.match(DIALOGUE_RE) || [];
    if (dialogueMatches.length === 0) return 0;

    let saidCount = 0;
    for (const word of SAID_WORDS) {
      const re = new RegExp(word, 'g');
      const matches = content.match(re);
      if (matches) saidCount += matches.length;
    }

    const dialogueCharCount = dialogueMatches.reduce((sum, m) => sum + m.length, 0);
    if (dialogueCharCount === 0) return 0;

    return (saidCount / dialogueCharCount) * 100;
  }

  private _calcConfidence(value: number, threshold: number, direction: 'high' | 'low'): number {
    if (direction === 'high') {
      const ratio = value / threshold;
      return Math.min(0.95, 0.5 + (ratio - 1) * 0.5);
    } else {
      const ratio = threshold / Math.max(0.001, value);
      return Math.min(0.95, 0.5 + (ratio - 1) * 0.3);
    }
  }

  private _calcScore(findingCount: number, totalRules: number): number {
    if (totalRules === 0) return 100;
    const penalty = findingCount * 8;
    return Math.max(40, 100 - penalty);
  }
}
