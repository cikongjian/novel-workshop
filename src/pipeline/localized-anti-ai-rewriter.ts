import { templatePatternsByCategory } from './template-patterns.js';

export type LocalizedAntiAiRewriteReport = {
  applied: boolean;
  replacementCount: number;
  touchedSentenceCount: number;
  touchedParagraphCount: number;
  summary: string;
  rewrittenText: string;
};

export type ContrastPhrasingSanitizeReport = {
  applied: boolean;
  replacementCount: number;
  summary: string;
  rewrittenText: string;
};

export type LocalizedAntiAiRewriteOptions = {
  maxWindows: number;
};

const AI_TELL_PATTERNS = templatePatternsByCategory('ai-tell').map(item => new RegExp(item.pattern.source));
const CONTRAST_PATTERNS = templatePatternsByCategory('cliche')
  .filter(item => item.label.includes('对照句'))
  .map(item => new RegExp(item.pattern.source));

const SAFE_REPLACEMENTS: Array<{ pattern: RegExp; to: string }> = [
  { pattern: /指(?:节|关节)发白/g, to: '手上力道不自觉加重' },
  { pattern: /指尖(?:微微)?泛白/g, to: '指尖绷得发僵' },
  { pattern: /(?:脸色|面色|唇色|嘴唇)(?:瞬间|骤然|一下子)?发白/g, to: '脸上的血色迅速褪去' },
  { pattern: /脸(?:色)?(?:一下子|瞬间|骤然)?白了/g, to: '脸上的血色几乎褪尽' },
  { pattern: /呼吸(?:一)?(?:滞|窒)/g, to: '呼吸乱了半拍' },
  { pattern: /喉咙(?:发紧|发干)/g, to: '嗓子发涩' },
  { pattern: /背脊(?:一)?凉/g, to: '后背骤然绷紧' },
  { pattern: /脊背(?:发凉|发寒|一凉)/g, to: '脊背泛起紧绷感' },
  { pattern: /掌心(?:渗出|冒出)?冷汗/g, to: '掌心湿了一层' },
  { pattern: /冷汗(?:涔涔)?(?:冒出|渗出)/g, to: '额角冒起细汗' },
  { pattern: /拳头(?:不由得)?(?:攥|握)紧/g, to: '手指收拢成拳' },
  { pattern: /指尖(?:发凉|冰凉)/g, to: '指尖发僵' },
  { pattern: /血液仿佛凝固/g, to: '整个人像被钉在原地' },
  { pattern: /时间仿佛(?:静止|停滞)/g, to: '那一瞬被拉得极慢' },
  { pattern: /四周一片死寂/g, to: '四下安静得只剩细碎动静' },
  { pattern: /沉默(?:在|于)空气中(?:蔓延|扩散)/g, to: '谁都没有先开口' },
  { pattern: /心里(?:咯噔|一沉)/g, to: '心头警铃猛地一响' },
  { pattern: /五味杂陈/g, to: '情绪一下子涌了上来' },
  { pattern: /脑海中(?:闪过|浮现)/g, to: '念头迅速掠过' },
];

function splitSentences(line: string): string[] {
  const matches = line.match(/[^。！？!?]+[。！？!?]?/g);
  if (!matches) return line ? [line] : [];
  return matches;
}

function hasAiTexture(sentence: string): boolean {
  return AI_TELL_PATTERNS.some(pattern => pattern.test(sentence))
    || CONTRAST_PATTERNS.some(pattern => pattern.test(sentence));
}

function replaceAiTell(sentence: string): { text: string; count: number } {
  let text = sentence;
  let count = 0;
  for (const item of SAFE_REPLACEMENTS) {
    const before = text;
    text = text.replace(item.pattern, () => {
      count += 1;
      return item.to;
    });
    if (before === text) continue;
  }
  return { text, count };
}

function joinContrastSubject(subject: string, outcome: string): string {
  const trimmedOutcome = outcome.trim();
  if (!trimmedOutcome) return subject;
  if (subject === '这' || subject === '那' || subject === '它') {
    return /^(?:是|像|更像|只是)/.test(trimmedOutcome)
      ? `${subject}${trimmedOutcome}`
      : `${subject}是${trimmedOutcome}`;
  }
  if (/^(?:在|正|会|能|要|想|该|已|已经|只是|仍|还|更|先|也|偏|开始|直接|终于|立刻|当场|忽然|随后|将|把)/.test(trimmedOutcome)) {
    return `${subject}${trimmedOutcome}`;
  }
  return `${subject}是${trimmedOutcome}`;
}

function normalizeStandaloneContrast(outcome: string): string {
  const trimmedOutcome = outcome.trim();
  if (!trimmedOutcome) return outcome;
  return /^(?:在|正|会|能|要|想|该|已|已经|只是|仍|还|更|先|也|偏|开始|直接|终于|立刻|当场|忽然|随后|将|把|被|从|换|动|烫|亮|开|裂|落|停|转|响|按|坐|站|走|进|出)/.test(trimmedOutcome)
    ? trimmedOutcome
    : `这是${trimmedOutcome}`;
}

function isQuotedOrReportedContrast(context: string, offset: number, match: string): boolean {
  const prefix = context.slice(Math.max(0, offset - 18), offset);
  return /(?:说|问|喊|答|写|刻|指|指的是|意思是|要的是|听到|听见|原话是|话是|说的|问的)[^。！？；\n]{0,12}$/.test(prefix)
    || /不是[^。！？；\n]{1,24}(?:话|字|命令|原话|意思|目标|名字|称呼|口令|暗号)/.test(match);
}

function hasImmediateSubjectBeforeContrast(context: string, offset: number): boolean {
  const prefix = context.slice(Math.max(0, offset - 12), offset);
  const match = prefix.match(/([\u4e00-\u9fa5A-Za-z0-9]{1,8})$/u);
  if (!match?.[1]) return false;
  return !new Set([
    '这',
    '那',
    '他',
    '她',
    '它',
    '我',
    '你',
    '不是',
    '但是',
    '只是',
    '如果',
    '因为',
    '所以',
  ]).has(match[1]);
}

function replaceContrastPhrasing(sentence: string): { text: string; count: number } {
  let count = 0;
  let text = sentence;

  text = text.replace(
    /(他|她|我|你|它|这|那)?并非因为[^，。；！？\n]{1,20}而([^，。；！？\n]{1,12})[，,]而是因为([^。；！？\n]{1,30})/g,
    (_match, subject: string | undefined, action: string, cause: string) => {
      count += 1;
      return subject ? `${subject}因为${cause}而${action}` : `因为${cause}而${action}`;
    },
  );
  text = text.replace(
    /(他|她|我|你|它|这|那)?不是[^，。；！？\n]{1,20}[，,]不是[^，。；！？\n]{1,20}[，,](?:而)?是([^。；！？\n]{1,30})/g,
    (_match, subject: string | undefined, outcome: string) => {
      count += 1;
      return subject ? joinContrastSubject(subject, outcome) : normalizeStandaloneContrast(outcome);
    },
  );
  text = text.replace(
    /(他|她|我|你|它|这|那)不是[^，。；！？\n]{1,20}[，,]而是([^。；！？\n]{1,30})/g,
    (_match, subject: string, outcome: string) => {
      count += 1;
      return joinContrastSubject(subject, outcome);
    },
  );
  text = text.replace(
    /(他|她|我|你|它|这|那)不是[^，。；！？\n]{1,20}[，,]是([^。；！？\n]{1,30})/g,
    (_match, subject: string, outcome: string) => {
      count += 1;
      return joinContrastSubject(subject, outcome);
    },
  );
  text = text.replace(
    /所谓[^。；！？\n]{1,16}不是[^，。；！？\n]{1,20}而是([^。；！？\n]{1,30})/g,
    (_match, outcome: string) => {
      count += 1;
      return normalizeStandaloneContrast(outcome);
    },
  );
  text = text.replace(
    /(他|她|我|你|它|这|那)?并非[^，。；！？\n]{1,20}[，,]而是([^。；！？\n]{1,30})/g,
    (_match, subject: string | undefined, outcome: string) => {
      count += 1;
      return subject ? joinContrastSubject(subject, outcome) : normalizeStandaloneContrast(outcome);
    },
  );
  text = text.replace(
    /(他|她|我|你|它|这|那)?与其说[^，。；！？\n]{1,20}[，,]不如说([^。；！？\n]{1,30})/g,
    (_match, subject: string | undefined, outcome: string) => {
      count += 1;
      return subject ? joinContrastSubject(subject, outcome) : normalizeStandaloneContrast(outcome);
    },
  );
  text = text.replace(
    /不是[^，。；！？\n]{1,20}[，,](?:而)?是([^。；！？\n]{1,30})/g,
    (match: string, outcome: string, offset: number, context: string) => {
      if (isQuotedOrReportedContrast(context, offset, match)) return match;
      count += 1;
      if (hasImmediateSubjectBeforeContrast(context, offset)) {
        return /^(?:在|正|会|能|要|想|该|已|已经|只是|仍|还|更|先|也|偏|开始|直接|终于|立刻|当场|忽然|随后|将|把|被)/.test(outcome.trim())
          ? outcome.trim()
          : `是${outcome.trim()}`;
      }
      return normalizeStandaloneContrast(outcome);
    },
  );

  return { text, count };
}

export function sanitizeContrastPhrasing(text: string): ContrastPhrasingSanitizeReport {
  if (!text.trim()) {
    return {
      applied: false,
      replacementCount: 0,
      summary: '正文为空，跳过对照句清洗',
      rewrittenText: text,
    };
  }

  const lines = text.split('\n');
  let replacementCount = 0;
  const rewrittenLines = lines.map((line) => {
    if (!line.trim()) return line;
    const sentences = splitSentences(line);
    if (sentences.length === 0) return line;
    const rewritten = sentences.map((sentence) => {
      const result = replaceContrastPhrasing(sentence);
      replacementCount += result.count;
      return result.text;
    });
    return rewritten.join('');
  });

  const rewrittenText = rewrittenLines.join('\n');
  const applied = rewrittenText !== text;
  return {
    applied,
    replacementCount,
    summary: applied
      ? `对照句清洗已执行：替换 ${replacementCount} 处“不是/并非/与其说…不如说”类句式`
      : '未命中需要清洗的对照句',
    rewrittenText,
  };
}

function dedupeParagraphAiTell(sentences: string[]): { result: string[]; touched: number; replacements: number } {
  const hitIndexes = sentences
    .map((sentence, index) => ({ sentence, index }))
    .filter(item => hasAiTexture(item.sentence))
    .map(item => item.index);
  if (hitIndexes.length <= 1) {
    if (hitIndexes.length === 0) {
      return { result: sentences, touched: 0, replacements: 0 };
    }
    const single = sentences.map((sentence) => {
      let touched = 0;
      let replacements = 0;
      let text = sentence;
      const contrast = replaceContrastPhrasing(text);
      if (contrast.count > 0) {
        text = contrast.text;
        touched += 1;
        replacements += contrast.count;
      }
      return { text, touched, replacements };
    });
    return {
      result: single.map(item => item.text),
      touched: single.reduce((sum, item) => sum + item.touched, 0),
      replacements: single.reduce((sum, item) => sum + item.replacements, 0),
    };
  }

  const windows = new Set<number>();
  for (const idx of hitIndexes) {
    windows.add(Math.max(0, idx - 1));
    windows.add(idx);
    windows.add(Math.min(sentences.length - 1, idx + 1));
  }

  let touched = 0;
  let replacements = 0;
  const result = sentences.map((sentence, idx) => {
    if (!windows.has(idx)) return sentence;
    let text = sentence;
    let count = 0;

    const aiTell = replaceAiTell(text);
    if (aiTell.count > 0) {
      text = aiTell.text;
      count += aiTell.count;
    }

    const contrast = replaceContrastPhrasing(text);
    if (contrast.count > 0) {
      text = contrast.text;
      count += contrast.count;
    }

    if (count > 0) {
      touched += 1;
      replacements += count;
    }
    return text;
  });

  return { result, touched, replacements };
}

export function rewriteLocalizedAntiAiTells(
  text: string,
  options?: Partial<LocalizedAntiAiRewriteOptions>,
): LocalizedAntiAiRewriteReport {
  const maxWindows = Math.max(1, options?.maxWindows ?? 8);
  if (!text.trim()) {
    return {
      applied: false,
      replacementCount: 0,
      touchedSentenceCount: 0,
      touchedParagraphCount: 0,
      summary: '正文为空，跳过局部改写',
      rewrittenText: text,
    };
  }

  const lines = text.split('\n');
  let remainingWindows = maxWindows;
  let touchedSentenceCount = 0;
  let touchedParagraphCount = 0;
  let replacementCount = 0;

  const rewrittenLines = lines.map(line => {
    if (!line.trim() || remainingWindows <= 0) return line;
    const sentences = splitSentences(line);
    if (sentences.length === 0) return line;

    const hitCount = sentences.filter(hasAiTexture).length;
    if (hitCount === 0) return line;

    const { result, touched, replacements } = dedupeParagraphAiTell(sentences);
    if (replacements > 0) {
      touchedSentenceCount += touched;
      touchedParagraphCount += 1;
      replacementCount += replacements;
      remainingWindows -= 1;
      return result.join('');
    }
    return line;
  });

  const rewrittenText = rewrittenLines.join('\n');
  const applied = rewrittenText !== text;
  const summary = applied
    ? `局部改写已执行：${touchedParagraphCount}段、${touchedSentenceCount}句、替换${replacementCount}处模板纹理`
    : '未命中需要局部改写的 AI 纹理句';

  return {
    applied,
    replacementCount,
    touchedSentenceCount,
    touchedParagraphCount,
    summary,
    rewrittenText,
  };
}
