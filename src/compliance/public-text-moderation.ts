import type { ContentAuditService } from '../bookstore/content-audit-service.js';
import type { AuditResultDetail, Violation } from '../bookstore/types.js';

type AbuseRule = {
  keyword: string;
  confidence: number;
};

export type PublicTextAuditField = {
  field: string;
  label: string;
  value?: string | null;
};

export type PublicTextAuditMatch = {
  field: string;
  label: string;
  value: string;
  result: AuditResultDetail;
};

const ABUSE_RULES: AbuseRule[] = [
  { keyword: '傻逼', confidence: 96 },
  { keyword: '傻x', confidence: 94 },
  { keyword: '脑残', confidence: 94 },
  { keyword: '智障', confidence: 92 },
  { keyword: '废物', confidence: 90 },
  { keyword: '杂种', confidence: 98 },
  { keyword: '贱人', confidence: 94 },
  { keyword: '狗东西', confidence: 92 },
  { keyword: '死妈', confidence: 99 },
  { keyword: '去死', confidence: 96 },
  { keyword: '滚远点', confidence: 88 },
  { keyword: '滚出去', confidence: 88 },
];

function extractContext(content: string, start: number, end: number): string {
  const left = Math.max(0, start - 20);
  const right = Math.min(content.length, end + 20);
  return content.slice(left, right);
}

function detectAbuseViolations(content: string): Violation[] {
  const violations: Violation[] = [];

  for (const rule of ABUSE_RULES) {
    let searchFrom = 0;
    while (true) {
      const start = content.indexOf(rule.keyword, searchFrom);
      if (start === -1) break;
      const end = start + rule.keyword.length;
      violations.push({
        type: 'abuse',
        confidence: rule.confidence,
        position: { start, end },
        keyword: rule.keyword,
        context: extractContext(content, start, end),
      });
      searchFrom = end;
    }
  }

  return violations;
}

function dedupeViolations(violations: Violation[]): Violation[] {
  const seen = new Set<string>();
  return violations.filter((item) => {
    const key = `${item.type}:${item.position.start}:${item.position.end}:${item.keyword ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveSuggestion(overallScore: number): AuditResultDetail['suggestion'] {
  if (overallScore < 60) return 'pass';
  if (overallScore < 80) return 'review';
  return 'block';
}

export async function auditPublicTextContent(params: {
  content: string;
  contentAuditService?: ContentAuditService;
  novelId?: string;
  operationKey?: string;
  operationLabel?: string;
}): Promise<AuditResultDetail> {
  const abuseViolations = detectAbuseViolations(params.content);
  const baseResult = params.contentAuditService
    ? await params.contentAuditService.auditText(params.content, {
        novelId: params.novelId,
        operationKey: params.operationKey ?? 'system.public-text-audit',
        operationLabel: params.operationLabel ?? '公开文本审核',
      })
    : { violations: [], overallScore: 0, suggestion: 'pass' as const };

  const mergedViolations = dedupeViolations([
    ...baseResult.violations,
    ...abuseViolations,
  ]);
  const overallScore = mergedViolations.length > 0
    ? Math.max(...mergedViolations.map((item) => item.confidence))
    : 0;

  return {
    violations: mergedViolations,
    overallScore,
    suggestion: resolveSuggestion(overallScore),
  };
}

export async function auditPublicTextFields(params: {
  fields: PublicTextAuditField[];
  contentAuditService?: ContentAuditService;
  novelId?: string;
  operationKey?: string;
  operationLabel?: string;
}): Promise<PublicTextAuditMatch | null> {
  for (const field of params.fields) {
    const value = field.value?.trim();
    if (!value) {
      continue;
    }

    const result = await auditPublicTextContent({
      content: value,
      contentAuditService: params.contentAuditService,
      novelId: params.novelId,
      operationKey: params.operationKey,
      operationLabel: params.operationLabel,
    });
    if (result.suggestion !== 'pass') {
      return {
        field: field.field,
        label: field.label,
        value,
        result,
      };
    }
  }

  return null;
}

export function buildPublicTextBlockMessage(
  result: AuditResultDetail,
  options?: {
    subjectLabel?: string;
    actionLabel?: string;
  },
): string {
  const subjectLabel = options?.subjectLabel ?? '内容';
  const actionLabel = options?.actionLabel ?? '提交';
  const hasAbuse = result.violations.some((item) => item.type === 'abuse');
  if (hasAbuse) {
    return `${subjectLabel}包含辱骂、攻击或不友善内容，暂不支持${actionLabel}`;
  }
  return `${subjectLabel}包含违规或高风险内容，暂不支持${actionLabel}`;
}
