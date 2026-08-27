import type { ChapterOutline, Foreshadowing } from '../novel/types.js';

const STOP_WORDS = new Set([
  '然后',
  '但是',
  '因为',
  '所以',
  '开始',
  '继续',
  '最后',
  '其中',
  '这个',
  '那个',
  '一些',
  '一个',
  '一种',
  '已经',
  '仍然',
  '可能',
  '需要',
  '事件',
  '场景',
  '章节',
]);

export type OutlineGateMode = 'off' | 'warn' | 'strict';

export type OutlineSignalSource = 'chapter-outline' | 'outline-agent' | 'foreshadowing';

export type OutlineContractItem = {
  source: OutlineSignalSource;
  text: string;
  keywords: string[];
};

export type OutlineContract = {
  chapterNumber: number;
  required: OutlineContractItem[];
  prompt: string;
};

export type OutlineGateFinding = {
  code: 'missing-outline-item';
  level: 'warn' | 'error';
  message: string;
  item: string;
  source: OutlineSignalSource;
};

export type OutlineContractFulfillment = {
  gateMode: OutlineGateMode;
  requiredTotal: number;
  requiredHit: number;
  matchedRequired: string[];
  missingRequired: string[];
  findings: OutlineGateFinding[];
  passed: boolean;
  summary: string;
};

export type OutlineGateRewriteReport = {
  attempted: boolean;
  applied: boolean;
  reason: string;
  before: OutlineContractFulfillment;
  after: OutlineContractFulfillment;
};

type BuildOutlineContractParams = {
  chapterNumber: number;
  chapterOutline?: ChapterOutline;
  outlineText: string;
  unresolvedForeshadowing?: Foreshadowing[];
  maxRequired?: number;
};

type EvalOutlineContractParams = {
  contract: OutlineContract;
  chapterContent: string;
  gateMode: OutlineGateMode;
};

function clip(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function dedupeByNormalized(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(item.trim());
  }
  return result;
}

function sanitizeSignal(raw: string): string {
  return raw
    .replace(/\*+/g, '')
    .replace(/^[#\-\d.\s、)）(（]+/, '')
    .replace(/[【】「」"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSceneSignals(outlineText: string): string[] {
  const results: string[] = [];
  const scenePattern = /#{1,4}\s*场景\s*\d+[：:]\s*(.+)/g;
  let match: RegExpExecArray | null;
  while ((match = scenePattern.exec(outlineText)) !== null) {
    const value = sanitizeSignal(match[1] ?? '');
    if (value.length >= 4 && value.length <= 48) {
      results.push(value);
    }
  }
  return results;
}

function extractBulletSignals(outlineText: string): string[] {
  const lines = outlineText.split(/\r?\n/).map(line => sanitizeSignal(line));
  return lines
    .filter((line) => /冲突|转折|高潮|揭示|反转|危机|抉择|代价|目标|回收|伏笔/.test(line))
    .filter((line) => line.length >= 6 && line.length <= 48)
    .slice(0, 8);
}

function buildKeywords(text: string): string[] {
  const words = text.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,8}/g) ?? [];
  const filtered = words
    .map(word => word.trim())
    .filter(word => word.length >= 2 && !STOP_WORDS.has(word));
  return dedupeByNormalized(filtered).slice(0, 4);
}

const SIGNAL_CONNECTOR_RE = /[\u4e4b\u4e0e\u548c\u53ca\u7684\u4e8e\u5728\u5e76]/g;

function buildKeywordVariants(keyword: string): string[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return [];

  const variants: string[] = [normalized];
  const isCjk = /^[\u4e00-\u9fa5]+$/.test(normalized);

  if (isCjk) {
    const parts = normalized
      .split(SIGNAL_CONNECTOR_RE)
      .map(part => part.trim())
      .filter(part => part.length >= 2);
    variants.push(...parts);

    if (normalized.length >= 4) {
      for (let size = 2; size <= 4; size += 1) {
        if (normalized.length > size) {
          variants.push(normalized.slice(0, size));
          variants.push(normalized.slice(normalized.length - size));
        }
      }
    }
  }

  return dedupeByNormalized(variants).filter(token => token.length >= 2 && !STOP_WORDS.has(token));
}

function resolveKeywordThreshold(signal: OutlineContractItem): number {
  const total = signal.keywords.length;
  if (total <= 1) return total;

  if (signal.source === 'chapter-outline') {
    return total >= 3 ? 2 : 1;
  }

  return Math.min(2, total);
}

function containsSignal(chapterContent: string, signal: OutlineContractItem): boolean {
  const content = chapterContent.toLowerCase();
  const direct = signal.text.toLowerCase();
  if (direct.length >= 4 && content.includes(direct)) {
    return true;
  }

  if (signal.keywords.length === 0) {
    return false;
  }

  const hit = signal.keywords.filter((keyword) => {
    const keywordNormalized = keyword.toLowerCase();
    if (keywordNormalized.length >= 4 && content.includes(keywordNormalized)) {
      return true;
    }
    const variants = buildKeywordVariants(keywordNormalized);
    return variants.some(variant => content.includes(variant));
  }).length;
  const threshold = resolveKeywordThreshold(signal);
  return hit >= threshold;
}

function renderOutlineContractPrompt(contract: OutlineContract): string {
  if (contract.required.length === 0) return '';
  const lines: string[] = [
    `以下是第 ${contract.chapterNumber} 章的大纲兑现清单（优先满足）：`,
    '',
    '【必达要点】',
  ];

  for (const item of contract.required) {
    const sourceLabel = item.source === 'chapter-outline'
      ? '主线大纲'
      : item.source === 'foreshadowing'
        ? '未回收伏笔'
        : '本章细纲';
    lines.push(`- (${sourceLabel}) ${item.text}`);
  }

  lines.push('');
  lines.push('【执行要求】');
  lines.push('- 每个要点都必须在正文中形成可感知事件或角色决策，不可只提名词。');
  lines.push('- 允许重排顺序，但不能跳过关键冲突或关键转折。');
  lines.push('- 未满足要点必须通过后续段落补齐。');
  return lines.join('\n');
}

export function buildOutlineContract(params: BuildOutlineContractParams): OutlineContract {
  const {
    chapterNumber,
    chapterOutline,
    outlineText,
    unresolvedForeshadowing = [],
    maxRequired = 6,
  } = params;

  const required: OutlineContractItem[] = [];
  const pushSignal = (source: OutlineSignalSource, text: string) => {
    const cleaned = sanitizeSignal(text);
    if (cleaned.length < 4 || cleaned.length > 64) return;
    required.push({
      source,
      text: cleaned,
      keywords: buildKeywords(cleaned),
    });
  };

  for (const item of chapterOutline?.keyEvents ?? []) {
    pushSignal('chapter-outline', item);
  }

  for (const item of extractSceneSignals(outlineText)) {
    pushSignal('outline-agent', item);
  }

  for (const item of extractBulletSignals(outlineText)) {
    pushSignal('outline-agent', item);
  }

  for (const hint of unresolvedForeshadowing.slice(0, 2)) {
    pushSignal('foreshadowing', hint.hint);
  }

  const deduped = dedupeByNormalized(required.map(item => item.text))
    .slice(0, maxRequired);

  const finalRequired = deduped.map((text) => {
    const matched = required.find(item => item.text.toLowerCase() === text.toLowerCase());
    return matched ?? {
      source: 'outline-agent' as const,
      text,
      keywords: buildKeywords(text),
    };
  });

  const contract: OutlineContract = {
    chapterNumber,
    required: finalRequired,
    prompt: '',
  };
  contract.prompt = renderOutlineContractPrompt(contract);
  return contract;
}

export function evaluateOutlineContractFulfillment(
  params: EvalOutlineContractParams,
): OutlineContractFulfillment {
  const { contract, chapterContent, gateMode } = params;
  const requiredTotal = contract.required.length;
  const matchedRequired: string[] = [];
  const missingRequired: string[] = [];
  const findings: OutlineGateFinding[] = [];

  for (const item of contract.required) {
    if (containsSignal(chapterContent, item)) {
      matchedRequired.push(item.text);
      continue;
    }
    missingRequired.push(item.text);
    findings.push({
      code: 'missing-outline-item',
      level: gateMode === 'strict' ? 'error' : 'warn',
      message: `Outline checkpoint not fulfilled: ${item.text}`,
      item: item.text,
      source: item.source,
    });
  }

  const requiredHit = matchedRequired.length;
  const passed = gateMode !== 'strict' || missingRequired.length === 0;
  const summary = [
    `大纲要点命中 ${requiredHit}/${requiredTotal}`,
    missingRequired.length > 0 ? `缺失 ${missingRequired.length}` : '无缺失',
  ].join('；');

  return {
    gateMode,
    requiredTotal,
    requiredHit,
    matchedRequired,
    missingRequired,
    findings,
    passed,
    summary: clip(summary, 120),
  };
}
