import type { Detector, ClicheRule, ClicheFinding, DetectionContext } from './anti-cliche-types.js';

function findPatternMatches(text: string, patterns: string[]): Array<{ pattern: string; index: number }> {
  const matches: Array<{ pattern: string; index: number }> = [];
  for (const pattern of patterns) {
    let idx = 0;
    while ((idx = text.indexOf(pattern, idx)) !== -1) {
      matches.push({ pattern, index: idx });
      idx += pattern.length;
    }
  }
  return matches;
}

function findRegexMatches(text: string, regexStr: string): Array<{ pattern: string; index: number; match: string }> {
  try {
    const regex = new RegExp(regexStr, 'g');
    const matches: Array<{ pattern: string; index: number; match: string }> = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ pattern: regexStr, index: match.index, match: match[0] });
    }
    return matches;
  } catch {
    return [];
  }
}

function getContext(text: string, index: number, length: number, contextSize: number = 50): string {
  const start = Math.max(0, index - contextSize);
  const end = Math.min(text.length, index + length + contextSize);
  return text.slice(start, end);
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter(p => p.trim().length > 0);
}

function splitSentences(text: string): string[] {
  return text.split(/[。！？；\n]+/).filter(s => s.trim().length > 5);
}

export class ExpressionPatternDetector implements Detector {
  type = 'expression-pattern' as const;
  name = '表达套路检测器';

  async detect(context: DetectionContext, rules: ClicheRule[]): Promise<ClicheFinding[]> {
    const findings: ClicheFinding[] = [];
    const relevantRules = rules.filter(r => r.type === 'expression-pattern' && r.enabled);
    const content = context.content;

    for (const rule of relevantRules) {
      if (rule.pattern) {
        const patterns = Array.isArray(rule.pattern) ? rule.pattern : [rule.pattern];
        const matches = findPatternMatches(content, patterns);

        if (matches.length >= rule.threshold) {
          const firstMatch = matches[0];
          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            type: rule.type,
            category: rule.category,
            severity: rule.severity,
            pattern: matches.slice(0, 3).map(m => m.pattern).join('、'),
            location: {
              chapterNumber: context.chapterNumber,
              start: firstMatch.index,
              end: firstMatch.index + firstMatch.pattern.length,
            },
            context: getContext(content, firstMatch.index, firstMatch.pattern.length),
            message: `${rule.name}：本章出现${matches.length}次`,
            suggestion: `减少使用"${matches[0].pattern}"等表达，尝试用更具体的动作或描写替代`,
            confidence: Math.min(0.95, matches.length / 5),
          });
        }
      }

      if (rule.regex) {
        const regexMatches = findRegexMatches(content, rule.regex);
        if (regexMatches.length >= rule.threshold) {
          const firstMatch = regexMatches[0];
          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            type: rule.type,
            category: rule.category,
            severity: rule.severity,
            pattern: firstMatch.match,
            location: {
              chapterNumber: context.chapterNumber,
              start: firstMatch.index,
              end: firstMatch.index + firstMatch.match.length,
            },
            context: getContext(content, firstMatch.index, firstMatch.match.length),
            message: `${rule.name}：本章出现${regexMatches.length}次`,
            suggestion: rule.description,
            confidence: Math.min(0.95, regexMatches.length / 5),
          });
        }
      }
    }

    return findings;
  }
}

export class NarrativeStructureDetector implements Detector {
  type = 'narrative-structure' as const;
  name = '叙事结构检测器';

  async detect(context: DetectionContext, rules: ClicheRule[]): Promise<ClicheFinding[]> {
    const findings: ClicheFinding[] = [];
    const relevantRules = rules.filter(r => r.type === 'narrative-structure' && r.enabled);
    const content = context.content;

    for (const rule of relevantRules) {
      if (rule.regex) {
        const regexMatches = findRegexMatches(content, rule.regex);
        if (regexMatches.length >= rule.threshold) {
          const firstMatch = regexMatches[0];
          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            type: rule.type,
            category: rule.category,
            severity: rule.severity,
            pattern: firstMatch.match,
            location: {
              chapterNumber: context.chapterNumber,
              start: firstMatch.index,
              end: firstMatch.index + firstMatch.match.length,
            },
            context: getContext(content, firstMatch.index, firstMatch.match.length),
            message: `${rule.name}：本章出现${regexMatches.length}次`,
            suggestion: '尝试用更自然的方式过渡或结尾',
            confidence: Math.min(0.95, regexMatches.length / 3),
          });
        }
      }

      if (rule.pattern) {
        const patterns = Array.isArray(rule.pattern) ? rule.pattern : [rule.pattern];
        const matches = findPatternMatches(content, patterns);

        if (matches.length >= rule.threshold) {
          const firstMatch = matches[0];
          const paragraphIndex = splitParagraphs(content).findIndex(p => p.includes(firstMatch.pattern));

          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            type: rule.type,
            category: rule.category,
            severity: rule.severity,
            pattern: matches.slice(0, 3).map(m => m.pattern).join('、'),
            location: {
              chapterNumber: context.chapterNumber,
              paragraphIndex: paragraphIndex >= 0 ? paragraphIndex : undefined,
              start: firstMatch.index,
              end: firstMatch.index + firstMatch.pattern.length,
            },
            context: getContext(content, firstMatch.index, firstMatch.pattern.length),
            message: `${rule.name}：本章出现${matches.length}次`,
            suggestion: '尝试变化叙事节奏和结构',
            confidence: Math.min(0.95, matches.length / 4),
          });
        }
      }
    }

    return findings;
  }
}

export class PlotTemplateDetector implements Detector {
  type = 'plot-template' as const;
  name = '情节模板检测器';

  async detect(context: DetectionContext, rules: ClicheRule[]): Promise<ClicheFinding[]> {
    const findings: ClicheFinding[] = [];
    const relevantRules = rules.filter(r => r.type === 'plot-template' && r.enabled && r.pattern);
    const content = context.content;

    for (const rule of relevantRules) {
      const patterns = Array.isArray(rule.pattern) ? rule.pattern : [rule.pattern];
      let matchCount = 0;
      let firstMatch: { pattern: string; index: number } | null = null;

      for (const pattern of patterns) {
        if (!pattern) continue;
        const idx = content.indexOf(pattern);
        if (idx !== -1) {
          matchCount++;
          if (!firstMatch) firstMatch = { pattern, index: idx };
        }
      }

      if (matchCount >= rule.threshold && firstMatch) {
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          type: rule.type,
          category: rule.category,
          severity: rule.severity,
          pattern: patterns.join('→'),
          location: {
            chapterNumber: context.chapterNumber,
            start: firstMatch.index,
            end: firstMatch.index + firstMatch.pattern.length,
          },
          context: getContext(content, firstMatch.index, firstMatch.pattern.length),
          message: `${rule.name}：检测到${matchCount}/${patterns.length}个模板特征`,
          suggestion: `此情节模板(${rule.name})较为常见，建议增加独特的转折或细节`,
          confidence: Math.min(0.95, matchCount / patterns.length),
        });
      }
    }

    return findings;
  }
}

export class CharacterArcDetector implements Detector {
  type = 'character-arc' as const;
  name = '角色弧线检测器';

  async detect(context: DetectionContext, rules: ClicheRule[]): Promise<ClicheFinding[]> {
    const findings: ClicheFinding[] = [];
    const relevantRules = rules.filter(r => r.type === 'character-arc' && r.enabled);

    if (!context.previousChapters || context.previousChapters.length === 0) {
      return findings;
    }

    const content = context.content;
    const allPreviousContent = context.previousChapters.map(c => c.content).join('\n');

    for (const rule of relevantRules) {
      if (!rule.pattern) continue;
      const patterns = Array.isArray(rule.pattern) ? rule.pattern : [rule.pattern];

      const currentMatches = new Set<string>();
      const previousMatches = new Set<string>();

      for (const pattern of patterns) {
        if (!pattern) continue;
        if (content.includes(pattern)) currentMatches.add(pattern);
        if (allPreviousContent.includes(pattern)) previousMatches.add(pattern);
      }

      const conflictingPairs: string[] = [];
      const positiveTraits = ['温柔', '善良', '仁慈', '宽容', '随和'];
      const negativeTraits = ['暴躁', '冷酷', '残忍', '狠毒', '刻薄'];

      for (const pos of positiveTraits) {
        for (const neg of negativeTraits) {
          if ((currentMatches.has(pos) && previousMatches.has(neg)) ||
              (currentMatches.has(neg) && previousMatches.has(pos))) {
            conflictingPairs.push(`${pos}↔${neg}`);
          }
        }
      }

      if (conflictingPairs.length >= rule.threshold) {
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          type: rule.type,
          category: rule.category,
          severity: rule.severity,
          pattern: conflictingPairs.slice(0, 3).join('、'),
          location: {
            chapterNumber: context.chapterNumber,
          },
          context: `当前章特征: ${Array.from(currentMatches).join('、')}; 前章特征: ${Array.from(previousMatches).join('、')}`,
          message: `${rule.name}：检测到${conflictingPairs.length}处性格矛盾`,
          suggestion: '检查角色性格描写是否一致，如需转变请提供合理铺垫',
          confidence: Math.min(0.95, conflictingPairs.length / 4),
        });
      }
    }

    return findings;
  }
}

export class SceneRepetitionDetector implements Detector {
  type = 'scene-repetition' as const;
  name = '场景重复检测器';

  async detect(context: DetectionContext, rules: ClicheRule[]): Promise<ClicheFinding[]> {
    const findings: ClicheFinding[] = [];
    const relevantRules = rules.filter(r => r.type === 'scene-repetition' && r.enabled);

    if (!context.previousChapters || context.previousChapters.length < 2) {
      return findings;
    }

    const windowSize = 5;
    const recentChapters = context.previousChapters.slice(-windowSize);
    const currentParagraphs = splitParagraphs(context.content);

    const sceneKeywords: Record<string, string[]> = {
      '战斗': ['战斗', '对决', '交锋', '厮杀', '打斗', '激战'],
      '对话': ['说道', '问道', '回答', '质问', '反驳', '冷笑'],
      '内心': ['心想', '想到', '觉得', '认为', '疑惑', '感叹'],
      '描写': ['看着', '望着', '打量', '观察', '扫视', '凝视'],
      '行走': ['走', '跑', '飞', '行', '赶路', '前行'],
    };

    for (const rule of relevantRules) {
      const currentSceneCounts = new Map<string, number>();
      const recentSceneCounts = new Map<string, number>();

      for (const [sceneType, keywords] of Object.entries(sceneKeywords)) {
        for (const para of currentParagraphs) {
          for (const keyword of keywords) {
            if (para.includes(keyword)) {
              currentSceneCounts.set(sceneType, (currentSceneCounts.get(sceneType) || 0) + 1);
              break;
            }
          }
        }

        for (const chapter of recentChapters) {
          const paras = splitParagraphs(chapter.content);
          for (const para of paras) {
            for (const keyword of keywords) {
              if (para.includes(keyword)) {
                recentSceneCounts.set(sceneType, (recentSceneCounts.get(sceneType) || 0) + 1);
                break;
              }
            }
          }
        }
      }

      const dominantScene = Array.from(currentSceneCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0];

      if (dominantScene) {
        const recentDominantCount = recentSceneCounts.get(dominantScene) || 0;
        const currentCount = currentSceneCounts.get(dominantScene) || 0;

        if (recentDominantCount >= 3 && currentCount >= 2) {
          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            type: rule.type,
            category: rule.category,
            severity: 'medium',
            pattern: dominantScene,
            location: {
              chapterNumber: context.chapterNumber,
            },
            context: `当前章${dominantScene}场景占比高，最近${recentChapters.length}章也频繁出现`,
            message: `${rule.name}："${dominantScene}"场景连续出现，缺少变化`,
            suggestion: `尝试增加其他场景类型（${Object.keys(sceneKeywords).filter(k => k !== dominantScene).join('、')}）`,
            confidence: Math.min(0.9, (recentDominantCount + currentCount) / 10),
          });
        }
      }
    }

    return findings;
  }
}

export class DialogueClicheDetector implements Detector {
  type = 'dialogue-cliche' as const;
  name = '对话套路检测器';

  async detect(context: DetectionContext, rules: ClicheRule[]): Promise<ClicheFinding[]> {
    const findings: ClicheFinding[] = [];
    const relevantRules = rules.filter(r => r.type === 'dialogue-cliche' && r.enabled);
    const content = context.content;

    for (const rule of relevantRules) {
      if (rule.regex) {
        const regexMatches = findRegexMatches(content, rule.regex);
        if (regexMatches.length >= rule.threshold) {
          const firstMatch = regexMatches[0];
          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            type: rule.type,
            category: rule.category,
            severity: rule.severity,
            pattern: firstMatch.match,
            location: {
              chapterNumber: context.chapterNumber,
              start: firstMatch.index,
              end: firstMatch.index + firstMatch.match.length,
            },
            context: getContext(content, firstMatch.index, firstMatch.match.length),
            message: `${rule.name}：本章出现${regexMatches.length}次`,
            suggestion: '尝试用更自然的对话方式表达',
            confidence: Math.min(0.95, regexMatches.length / 5),
          });
        }
      }

      if (rule.pattern) {
        const patterns = Array.isArray(rule.pattern) ? rule.pattern : [rule.pattern];
        const matches = findPatternMatches(content, patterns);

        if (matches.length >= rule.threshold) {
          const firstMatch = matches[0];
          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            type: rule.type,
            category: rule.category,
            severity: rule.severity,
            pattern: matches.slice(0, 3).map(m => m.pattern).join('、'),
            location: {
              chapterNumber: context.chapterNumber,
              start: firstMatch.index,
              end: firstMatch.index + firstMatch.pattern.length,
            },
            context: getContext(content, firstMatch.index, firstMatch.pattern.length),
            message: `${rule.name}：本章出现${matches.length}次`,
            suggestion: '尝试变化对话表达方式',
            confidence: Math.min(0.95, matches.length / 4),
          });
        }
      }
    }

    return findings;
  }
}

export class WorldConsistencyDetector implements Detector {
  type = 'world-consistency' as const;
  name = '世界一致性检测器';

  async detect(context: DetectionContext, rules: ClicheRule[]): Promise<ClicheFinding[]> {
    const findings: ClicheFinding[] = [];
    const relevantRules = rules.filter(r => r.type === 'world-consistency' && r.enabled);

    return findings;
  }
}

export const ALL_DETECTORS: Detector[] = [
  new ExpressionPatternDetector(),
  new NarrativeStructureDetector(),
  new PlotTemplateDetector(),
  new CharacterArcDetector(),
  new SceneRepetitionDetector(),
  new DialogueClicheDetector(),
  new WorldConsistencyDetector(),
];

export function getDetectorByType(type: string): Detector | undefined {
  return ALL_DETECTORS.find(d => d.type === type);
}