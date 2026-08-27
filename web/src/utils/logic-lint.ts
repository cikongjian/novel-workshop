import type { ContinuityFinding } from '../api';

const ROLE_WORDS = [
  '奴才',
  '下人',
  '家丁',
  '仆人',
  '仆役',
  '随从',
  '跟班',
  '狗腿子',
  '小厮',
  '丫鬟',
  '奴婢',
] as const;

const SPEECH_VERBS = [
  '说',
  '问',
  '喊',
  '叫',
  '骂',
  '嘀咕',
  '心想',
  '暗想',
  '想着',
] as const;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSpeakerRegex(name: string): RegExp {
  const verbAlt = SPEECH_VERBS.map(escapeRegExp).join('|');
  return new RegExp(
    `(^|[^\\u4e00-\\u9fff])(${escapeRegExp(name)})\\s*(?:${verbAlt})\\s*[：:]`,
    'g',
  );
}

function buildSelfRoleRegex(name: string): RegExp {
  const roleAlt = ROLE_WORDS.map(escapeRegExp).join('|');
  const maybeQuotes = `[“"‘']?\\s*`;
  const maybeDeictic = `(?:这|那|这个|那个|本|此)?\\s*`;
  return new RegExp(
    `${maybeQuotes}${escapeRegExp(name)}\\s*${maybeDeictic}(?:${roleAlt})`,
    'g',
  );
}

function buildSelfToSelfRegex(name: string): RegExp {
  return new RegExp(`${escapeRegExp(name)}\\s*对\\s*${escapeRegExp(name)}\\s*说`, 'g');
}

function uniqueFindings(findings: ContinuityFinding[]): ContinuityFinding[] {
  const seen = new Set<string>();
  const out: ContinuityFinding[] = [];
  for (const item of findings) {
    const key = `${item.code}|${item.level}|${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function detectIntraChapterLogicConflicts(params: {
  content: string;
  knownCharacterNames?: string[];
  maxFindings?: number;
}): ContinuityFinding[] {
  const { content, knownCharacterNames = [], maxFindings = 12 } = params;
  const text = (content ?? '').trim();
  if (!text) return [];

  const findings: ContinuityFinding[] = [];

  const candidateNames = knownCharacterNames
    .map(n => (n ?? '').trim())
    .filter(n => n.length >= 2 && n.length <= 8);

  for (const name of candidateNames) {
    if (findings.length >= maxFindings) break;
    if (!text.includes(name)) continue;

    const speakerRe = buildSpeakerRegex(name);
    const selfRoleRe = buildSelfRoleRegex(name);
    const selfToSelfRe = buildSelfToSelfRegex(name);

    if (selfToSelfRe.test(text)) {
      findings.push({
        code: 'self-talk',
        level: 'warn',
        message: `疑似自指/指代错误：出现“${name}对${name}说…”，可能把人名写重复了。`,
      });
    }

    let speakerMatch: RegExpExecArray | null;
    while ((speakerMatch = speakerRe.exec(text)) !== null) {
      const idx = speakerMatch.index + speakerMatch[0].length;
      const windowText = text.slice(idx, idx + 160);
      if (!windowText) continue;

      if (selfRoleRe.test(windowText)) {
        findings.push({
          code: 'self-reference-role-mismatch',
          level: 'warn',
          message: `疑似逻辑冲突：${name}发言后紧接着出现“${name}…${ROLE_WORDS.join('/')}”式称呼，可能把“他/那/某人”的名字写成了说话人的名字。`,
        });
        break;
      }
    }
  }

  return uniqueFindings(findings).slice(0, maxFindings);
}

