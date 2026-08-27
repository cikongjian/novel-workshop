import { renderSummaryMarkdown } from './summary-markdown';

export interface ReaderReviewNarrativeItem {
  key: string;
  label: string;
  text: string;
}

export interface ReaderReviewView {
  scoreValue: number | null;
  scoreText: string;
  narratives: ReaderReviewNarrativeItem[];
  issues: string[];
  highlights: string[];
  suggestions: string[];
}

export type AgentCommentView =
  | { kind: 'empty' }
  | { kind: 'rich'; html: string }
  | { kind: 'reader-review'; review: ReaderReviewView };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseLooseJson(raw: string): unknown | null {
  const text = raw.trim();
  if (!text) return null;

  const candidates: string[] = [];
  if (text.startsWith('{') || text.startsWith('[')) candidates.push(text);

  const fencedMatches = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  for (const match of fencedMatches) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }

  if (candidates.length === 0) {
    const firstObj = text.indexOf('{');
    const lastObj = text.lastIndexOf('}');
    if (firstObj >= 0 && lastObj > firstObj) {
      candidates.push(text.slice(firstObj, lastObj + 1));
    }
    const firstArr = text.indexOf('[');
    const lastArr = text.lastIndexOf(']');
    if (firstArr >= 0 && lastArr > firstArr) {
      candidates.push(text.slice(firstArr, lastArr + 1));
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // ignore parse failures and continue
    }
  }
  return null;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item ?? '').trim())
    .filter(Boolean);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatScoreText(score: number | null): string {
  if (score === null) return '-';
  const rounded = Math.round(score * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded.toFixed(0)} / 10`;
  return `${rounded.toFixed(1)} / 10`;
}

function parseReaderReview(raw: string): ReaderReviewView | null {
  const parsed = parseLooseJson(raw);
  const record = asRecord(parsed);
  if (!record) return null;

  const hasReviewShape = (
    'overallScore' in record
    || 'issues' in record
    || 'highlights' in record
    || 'suggestions' in record
    || 'pacing' in record
    || 'engagement' in record
    || 'characterization' in record
    || 'emotion' in record
    || 'prose' in record
  );
  if (!hasReviewShape) return null;

  const narrativeFieldMap: Array<{ key: string; label: string }> = [
    { key: 'pacing', label: '节奏' },
    { key: 'engagement', label: '吸引力' },
    { key: 'characterization', label: '角色塑造' },
    { key: 'emotion', label: '情绪张力' },
    { key: 'prose', label: '文笔' },
  ];

  const narratives = narrativeFieldMap
    .map((field) => {
      const value = String(record[field.key] ?? '').trim();
      if (!value) return null;
      return { key: field.key, label: field.label, text: value };
    })
    .filter((item): item is ReaderReviewNarrativeItem => item !== null);

  const scoreValue = toFiniteNumber(record.overallScore);

  return {
    scoreValue,
    scoreText: formatScoreText(scoreValue),
    narratives,
    issues: toStringList(record.issues),
    highlights: toStringList(record.highlights),
    suggestions: toStringList(record.suggestions),
  };
}

function humanizeJsonKey(key: string): string {
  const dict: Record<string, string> = {
    summary: '总结',
    overview: '概览',
    score: '评分',
    issues: '问题',
    risks: '风险',
    strengths: '亮点',
    weaknesses: '不足',
    suggestions: '建议',
    actions: '行动建议',
    actionItems: '行动项',
    nextStep: '下一步',
    nextSteps: '下一步',
    reason: '原因',
    reasons: '原因',
    evidence: '依据',
    notes: '说明',
    continuity: '连贯性',
    conflict: '冲突点',
    details: '细节',
    metrics: '指标',
    status: '状态',
    title: '标题',
    name: '名称',
    value: '内容',
  };
  if (dict[key]) return dict[key];
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/^./, ch => ch.toUpperCase());
}

function formatJsonPrimitive(value: unknown): string {
  if (value === null) return '空';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '无效数字';
  if (typeof value === 'string') return value.trim() || '空';
  return String(value);
}

function formatJsonValueMarkdown(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return formatJsonPrimitive(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '空';
    const lines = value.map((item) => {
      if (item === null || typeof item !== 'object') {
        return `- ${formatJsonPrimitive(item)}`;
      }
      const inner = formatJsonValueMarkdown(item).trim();
      if (!inner) return '- 空';
      const indented = inner.split('\n').map((line) => `  ${line}`).join('\n');
      return `- 条目\n${indented}`;
    });
    return lines.join('\n');
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '空';
  const lines: string[] = [];
  for (const [key, val] of entries) {
    const label = humanizeJsonKey(key);
    if (val === null || typeof val !== 'object') {
      lines.push(`- **${label}**：${formatJsonPrimitive(val)}`);
      continue;
    }
    lines.push(`#### ${label}`);
    lines.push(formatJsonValueMarkdown(val));
    lines.push('');
  }
  return lines.join('\n').trim();
}

function formatAgentCommentMarkdown(raw: string): string {
  const text = raw.trim();
  if (!text) return '';

  const parsed = parseLooseJson(text);
  if (parsed !== null) {
    const body = formatJsonValueMarkdown(parsed);
    return body ? `### 结构化结果\n${body}` : '';
  }

  return text
    .replace(/^```(?:json)?\s*/gi, '')
    .replace(/```$/g, '')
    .replace(/^[【\[]([^】\]]+)[】\]]\s*[:：]?\s*$/gm, '### $1');
}

export function normalizeAgentRoleValue(role: string): string {
  const normalized = role.trim().toLowerCase().replace(/_/g, '-');
  const aliasMap: Record<string, string> = {
    world: 'world-builder',
    worldbuilder: 'world-builder',
    'character-builder': 'character',
    characterdesigner: 'character',
    reviewer: 'reader',
    review: 'reader',
    editing: 'editor',
    'writer-editor': 'editor',
    writereditor: 'editor',
  };
  return aliasMap[normalized] ?? normalized;
}

export function buildAgentCommentView(raw: string): AgentCommentView {
  const text = raw.trim();
  if (!text) return { kind: 'empty' };

  const review = parseReaderReview(text);
  if (review) {
    return { kind: 'reader-review', review };
  }

  const html = renderSummaryMarkdown(formatAgentCommentMarkdown(text));
  if (!html.trim()) return { kind: 'empty' };
  return { kind: 'rich', html };
}
