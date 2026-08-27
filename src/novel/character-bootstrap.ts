const OUTLINE_CHARACTER_LINE_RE = /出场角色[^\n：:]{0,20}[：:]\s*([^\n]+)/g;
const INLINE_SPEAKER_MARKER_RE = /[\(\uFF08]\s*[#\uFF03]\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]/g;
const CHARACTER_NAME_SPLIT_RE = /[、，,\/\\\s和与及]+/;
const LEADING_CHARACTER_QUANTIFIER_RE = /^(?:一位|一名|一个|一只|某位|某名|某个|某只)/;

const NON_CHARACTER_TOKENS = new Set([
  '角色',
  '角色群像',
  '主角',
  '配角',
  '反派',
  '路人',
  '无',
  '未知',
  '系统',
  '宿主',
  '旁白',
  '提示音',
  '广播',
  '感染者',
  '幸存者',
  '怪物',
  '蹒跚者',
]);

function normalizeBootstrapCharacterName(rawName: string): string {
  return String(rawName ?? '')
    .trim()
    .replace(/^[\-\*\d\.\)\(]+/, '')
    .replace(/[【】\[\]「」『』“”"']/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(LEADING_CHARACTER_QUANTIFIER_RE, '')
    .trim();
}

function isLikelyBootstrapCharacterName(name: string): boolean {
  if (!name) return false;
  if (name.length < 2 || name.length > 12) return false;
  if (!/[\u4e00-\u9fa5A-Za-z]/.test(name)) return false;
  if (NON_CHARACTER_TOKENS.has(name)) return false;
  if (/感染者|蹒跚者|怪物|系统|旁白|宿主/.test(name)) return false;
  if (/[，。,\.]/.test(name)) return false;
  return true;
}

export function extractBootstrapCharacterNames(params: {
  chapterContent: string;
  chapterOutlineSummary?: string;
  limit?: number;
}): string[] {
  const { chapterContent, chapterOutlineSummary, limit = 4 } = params;
  const names: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (rawName: string) => {
    const normalized = normalizeBootstrapCharacterName(rawName);
    if (!isLikelyBootstrapCharacterName(normalized)) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    names.push(normalized);
  };

  if (chapterOutlineSummary) {
    OUTLINE_CHARACTER_LINE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = OUTLINE_CHARACTER_LINE_RE.exec(chapterOutlineSummary)) !== null) {
      match[1]
        .split(CHARACTER_NAME_SPLIT_RE)
        .forEach(pushCandidate);
    }
  }

  INLINE_SPEAKER_MARKER_RE.lastIndex = 0;
  let markerMatch: RegExpExecArray | null;
  while ((markerMatch = INLINE_SPEAKER_MARKER_RE.exec(chapterContent)) !== null) {
    pushCandidate(markerMatch[1]);
  }

  return names.slice(0, limit);
}

