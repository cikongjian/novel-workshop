import { generateSmartTitle } from './smart-title-generator.js';

export type TitleAuditLevel = 'good' | 'improve' | 'fix';

export interface TitleAuditReport {
  chapterNumber: number;
  currentTitle: string;
  level: TitleAuditLevel;
  score: number;
  reasons: string[];
  suggestedTitle?: string;
}

export interface AuditChapterInput {
  chapterNumber: number;
  title: string;
  content: string;
  outline?: string;
  recentTitles?: string[];
  genre?: string;
}

/**
 * 标题质量审计：纯算法评估现有标题质量，分级 good/improve/fix 并给出建议标题。
 *
 * - good  : 标题已经是智能标题风格，无需修改
 * - improve: 标题可用但不够吸引人（太长/含前缀/平铺直叙）
 * - fix   : 标题明显糟糕（残句/时间数字/通用词/极短），必须修复
 */
export function auditChapterTitle(input: AuditChapterInput): TitleAuditReport {
  const { chapterNumber, title, content, outline, recentTitles = [], genre } = input;
  const reasons: string[] = [];
  let score = 100;
  let level: TitleAuditLevel = 'good';

  const trimmed = (title || '').trim();
  const clean = stripChapterPrefix(trimmed);

  // === 必改 (fix) 级别判定 ===

  // 空标题或极短
  if (!clean || clean.length < 2) {
    reasons.push('标题为空或过短');
    return finalize(chapterNumber, title, 'fix', 20, reasons, content, outline, recentTitles, genre);
  }

  // 残句结尾词
  const incompleteEndings = ['已经', '便', '就', '才', '曾', '正', '刚', '将', '欲', '还', '尚'];
  for (const ending of incompleteEndings) {
    if (clean.endsWith(ending)) {
      reasons.push(`残句结尾："…${ending}"`);
      score -= 60;
      level = 'fix';
    }
  }

  // 虚词结尾（短标题）
  const weakEndChars = ['的', '了', '着', '过', '在', '向', '于', '得', '地', '是', '为', '被', '把'];
  if (clean.length <= 6) {
    for (const char of weakEndChars) {
      if (clean.endsWith(char)) {
        reasons.push(`句子片段结尾："…${char}"`);
        score -= 50;
        level = 'fix';
        break;
      }
    }
  }

  // 时间数字类
  const compoundTimeUnit = /(分钟|秒钟|小时|个钟头|个时辰|刻钟|个半|余分)/;
  const hasNum = /[一二三四五六七八九十百千万两零多几\d]/;
  if (compoundTimeUnit.test(clean) && hasNum.test(clean)) {
    reasons.push('含时间数字描述');
    score -= 60;
    level = 'fix';
  }

  const basicTimeWithModifier = /^(每|早|晚|又|再|还|休息|停|等|隔|打|用|花|过|剩|差|少|多|近|约|大约|大概|不到|超过|前|后)?[一二三四五六七八九十百千万两零多几\d]+(多|余|几|到[一二三四五六七八九十百千万两零多几\d]+)?(天|年|月|日|周)(之?(前|后|以)?)?$/;
  if (basicTimeWithModifier.test(clean)) {
    reasons.push('时间数字类标题');
    score -= 55;
    level = 'fix';
  }

  // 章节号 / 纯数字
  if (/^[第]?[一二三四五六七八九十百千万两\d]+[章节回卷]$/.test(clean)) {
    reasons.push('纯章节号');
    score -= 60;
    level = 'fix';
  }

  // 通用词
  const genericWords = new Set([
    '一个', '一只', '一种', '一些', '自己', '他们', '我们', '你们',
    '什么', '怎么', '已经', '但是', '然后', '因为', '所以', '突然', '终于',
  ]);
  if (genericWords.has(clean)) {
    reasons.push('通用词作为标题');
    score -= 60;
    level = 'fix';
  }

  // 含 ASCII 数字 / 字母（标题应为纯中文）
  if (!/^[\u4e00-\u9fa5]+$/.test(clean)) {
    reasons.push('标题含非中文字符');
    score -= 30;
    if (level !== 'fix') level = 'improve';
  }

  // === 可改 (improve) 级别判定 ===

  // 过长
  if (clean.length > 12) {
    reasons.push(`标题过长（${clean.length}字）`);
    score -= 25;
    if (level !== 'fix') level = 'improve';
  } else if (clean.length > 8) {
    reasons.push(`标题偏长（${clean.length}字）`);
    score -= 10;
    if (level !== 'fix') level = 'improve';
  }

  // 仍残留"章节主题""大纲"等大纲标记词
  const outlineLabelWords = ['章节主题', '开头设计', '场景列表', '内容要点', '正文大纲', '章节大纲', '大纲', '纲要', '梗概', '正文'];
  for (const word of outlineLabelWords) {
    if (clean === word || clean.startsWith(word)) {
      reasons.push(`残留大纲标记词："${word}"`);
      score -= 40;
      level = 'fix';
      break;
    }
  }

  // 大纲截断（含"·"或"800-9"类行号）
  if (/[·•]/.test(clean) || /\d{2,}-\d*$/.test(clean)) {
    reasons.push('疑似大纲行截断');
    score -= 30;
    if (level !== 'fix') level = 'improve';
  }

  // 章节号前缀未去除（"第N章"开头但后面有内容）
  if (/^第\s*[一二三四五六七八九十百千万两\d]+\s*章/.test(trimmed) && trimmed !== clean) {
    reasons.push('标题残留"第N章"前缀');
    score -= 10;
    if (level !== 'fix') level = 'improve';
  }

  // 平铺直叙（含完整标点或人名+长动词描述）
  if (/[，,。.！!？?；;：:、]/.test(trimmed)) {
    reasons.push('标题含句内标点');
    score -= 15;
    if (level !== 'fix') level = 'improve';
  }

  return finalize(chapterNumber, title, level, score, reasons, content, outline, recentTitles, genre);
}

function finalize(
  chapterNumber: number,
  currentTitle: string,
  level: TitleAuditLevel,
  score: number,
  reasons: string[],
  content: string,
  outline: string | undefined,
  recentTitles: string[],
  genre: string | undefined,
): TitleAuditReport {
  const finalScore = Math.max(0, Math.min(100, score));
  const report: TitleAuditReport = {
    chapterNumber,
    currentTitle,
    level,
    score: finalScore,
    reasons,
  };

  // 非 good 级别都给出建议标题
  if (level !== 'good') {
    try {
      const suggested = generateSmartTitle({
        content,
        outline: outline || '',
        chapterNumber,
        genre,
        recentTitles,
      });
      // 仅当建议标题与当前不同时才返回
      if (suggested && suggested !== currentTitle) {
        report.suggestedTitle = suggested;
      }
    } catch {
      // 生成失败不影响审计结果
    }
  }

  return report;
}

function stripChapterPrefix(title: string): string {
  return title
    .replace(/^第\s*[0-9０-９一二三四五六七八九十百千万两]+\s*章\s*[:：、，,.\-—–\s]*/u, '')
    .replace(/^(?:章节)?标题\s*[:：、，,.\-—–\s]+/u, '')
    .trim();
}

export interface AuditSummary {
  total: number;
  good: number;
  improve: number;
  fix: number;
  reports: TitleAuditReport[];
}

export function summarizeAuditReports(reports: TitleAuditReport[]): AuditSummary {
  const summary: AuditSummary = {
    total: reports.length,
    good: 0,
    improve: 0,
    fix: 0,
    reports,
  };
  for (const r of reports) {
    summary[r.level] += 1;
  }
  return summary;
}
