const AUTHOR_NOTE_META_PATTERNS = [
  /^[-—]*\s*来自作者的补充[：:]/u,
  /^[-—]*\s*作者补充[：:]/u,
  /^[-—]*\s*作者的话[：:]/u,
  /^[-—]*\s*作者有话说[：:]/u,
  /^[-—]*\s*作者小声说/u,
  /^[（(]\s*作者(?:小声|补充|的话|有话说|插一句)?(?:补一句)?[：:]/u,
];

const AUTHOR_NOTE_META_SENTENCE_PATTERNS = [
  /写第\s*[0-9０-９一二三四五六七八九十百千万两]+\s*章/u,
  /写这[一]?章/u,
  /这一章写到/u,
  /这一章的/u,
  /今天这章/u,
  /你们看(?:的)?时候/u,
  /故事自己长出来/u,
  /作者.*(?:编|意外)/u,
  /我这个作者/u,
  /停了笔/u,
  /全章/u,
  /正文里/u,
  /在正文/u,
  /读者反馈/u,
  /情感分/u,
  /我承认/u,
  /下一章我/u,
  /写这段/u,
  /写.*那段/u,
  /写.*时候/u,
  /写小说/u,
  /有没有人想问/u,
  /肯定有人想问/u,
  /我.*删了/u,
  /原文删了/u,
  /我.*查了/u,
  /我.*反复想象/u,
  /我觉得/u,
  /我.*喜欢/u,
  /我比/u,
  /我写(?!的)/u,
  /我.*干过/u,
  /我自己写/u,
  /我自己最喜欢/u,
  /自己回头翻/u,
  /我本来写/u,
  /我一开始写/u,
  /要(?:是)?我/u,
  /比我/u,
  /我得去/u,
  /我.*写下来.*舒服/u,
  /我的感受/u,
  /我那时候/u,
  /我第一次/u,
  /我问/u,
  /我说/u,
  /我跟(?:他|她|他们|她们|TA|ta)学/u,
  /我家/u,
  /我妈/u,
  /我爸/u,
  /我躲到/u,
  /我才知道/u,
  /我见过/u,
  /我去/u,
  /我再也没/u,
  /我一直记着/u,
  /我到现在.*记得/u,
  /以前在[^。！？\n]{0,30}(?:实习|工作)/u,
  /带我的[^。！？\n]{0,12}师傅/u,
  /从我.*记忆/u,
  /小时候.*记忆/u,
  /小时候我/u,
  /从小学.*高中/u,
  /小学/u,
  /高中/u,
  /期末考试/u,
  /有一回/u,
  /每次去/u,
  /十多年.*没擦/u,
  /记不记得.*第一次/u,
  /你爸/u,
  /那时候一碗/u,
  /后来有一年/u,
  /后来.*带进/u,
  /大学暑假/u,
  /菜市场/u,
  /老太太/u,
  /陈叔/u,
  /老板姓/u,
  /现实里/u,
  /原型/u,
  /自己脑补/u,
  /看视频写/u,
  /写进文里/u,
  /原样搬/u,
  /小彩蛋/u,
  /谢谢那本/u,
  /谢谢.*笔记本/u,
  /细节.*折磨节奏/u,
  /掐掉了/u,
  /创作/u,
  /构思/u,
  /灵感/u,
  /不剧透/u,
  /不能剧透/u,
  /怕.*读者.*笑.*外行/u,
  /懂什么/u,
  /缠着.*帮我.*才敢写/u,
  /实不相瞒/u,
  /写[\u4e00-\u9fa5]{0,8}文/u,
  /扣\s*[0-9０-９一二三四五六七八九十]/u,
  /评论区.*(?:扣|报数)/u,
  /继续去?码字/u,
  /我.*码字/u,
  /明天见/u,
  /^你们的[\u4e00-\u9fa5A-Za-z0-9_·-]{1,12}$/u,
  /^爱你们的作者$/u,
];
const AUTHOR_NOTE_UNSAFE_RESIDUE_PATTERNS = [
  /我.*(?:写(?!的)|查|问|见过|喜欢|干过|觉得|脑补|想象|到现在.*记得)/u,
  /(?:创作|构思|灵感|原型|现实里|大学暑假|后来有一年|小学|高中|期末考试)/u,
  /(?:以前在[^。！？\n]{0,30}(?:实习|工作)|带我的[^。！？\n]{0,12}师傅)/u,
  /(?:故事自己长出来|作者.*(?:编|意外)|我这个作者|停了笔)/u,
  /(?:写进文里|带进.*角色|代签)/u,
  /(?:扣\s*[0-9０-９一二三四五六七八九十]|评论区.*(?:扣|报数)|继续去?码字|明天见)/u,
];
const AUTHOR_NOTE_RAW_REJECT_PATTERNS = [
  /原文删了/u,
  /细节.*折磨节奏/u,
  /掐掉了/u,
  /各位追更|追更的朋友/u,
  /后台问/u,
  /这章写的是/u,
  /这一章的/u,
  /你们看(?:的)?时候/u,
  /故事自己长出来/u,
  /作者.*(?:编|意外)/u,
  /我这个作者/u,
  /停了笔/u,
  /读者反馈/u,
  /情感分/u,
  /我承认/u,
  /下一章我/u,
  /你们有没有/u,
  /有没有注意/u,
  /这一章的提问/u,
  /谢谢.*你们/u,
  /(?:纪录员|敬上)/u,
  /作者你是不是/u,
  /后面你会看到|后续慢慢|具体.*先不说|先不说/u,
  /这能力确实像开挂/u,
  /工具人/u,
  /没有纯粹的.*恶人/u,
  /下章.*我只能说/u,
  /我只能说/u,
  /只能说/u,
  /冷知识/u,
  /是不是觉得/u,
  /将来会/u,
  /以后会/u,
  /会在.*反复引用/u,
  /这句话背后/u,
  /看着真解气/u,
  /真想快进/u,
  /起鸡皮疙瘩/u,
  /从来不是巧合/u,
  /格外完好/u,
  /扣\s*[0-9０-９一二三四五六七八九十]/u,
  /评论区.*(?:报数|扣)/u,
  /继续去?码字/u,
  /我.*码字/u,
  /(?:是我我也|换(?:成)?我(?:也|就|都)?|我要是|我都替|急死我|憋死我|我也憋|我也急|我也忍不住)/u,
];
const MAX_AUTHOR_NOTE_PARAGRAPHS = 4;
const MAX_AUTHOR_NOTE_CHARS = 380;

function splitSentences(text: string): string[] {
  const parts = text.match(/[^。！？!?]+[。！？!?]?/gu) ?? [];
  return parts.map(part => part.trim()).filter(Boolean);
}

function stripMetaPrefix(sentence: string): string {
  return sentence
    .replace(/^别问我为什么[—-]*/u, '')
    .trim();
}

function sanitizeParagraph(paragraph: string): string {
  if (AUTHOR_NOTE_META_PATTERNS.some(pattern => pattern.test(paragraph))) return '';
  if (!AUTHOR_NOTE_META_SENTENCE_PATTERNS.some(pattern => pattern.test(paragraph))) return paragraph;
  const answerPrefix = paragraph.match(/^(答[：:]\s*)/u)?.[1] ?? '';
  const sanitized = splitSentences(paragraph)
    .map(stripMetaPrefix)
    .filter(sentence => !AUTHOR_NOTE_META_SENTENCE_PATTERNS.some(pattern => pattern.test(sentence)))
    .join('')
    .replace(/^[”」』'"]+/u, '')
    .replace(/^[，,。！？!?；;：:\s]+/u, '')
    .trim();
  if (!sanitized || !answerPrefix || sanitized.startsWith(answerPrefix)) return sanitized;
  return `${answerPrefix}${sanitized}`;
}

function truncateVisibleChars(text: string, maxChars: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars.slice(0, Math.max(0, maxChars - 1)).join('').trimEnd()}…`;
}

function compactAuthorNote(note: string): string {
  const paragraphs = note.split(/\n+/u).map(line => line.trim()).filter(Boolean);
  const compacted = paragraphs.length <= MAX_AUTHOR_NOTE_PARAGRAPHS
    ? paragraphs
    : [...paragraphs.slice(0, MAX_AUTHOR_NOTE_PARAGRAPHS - 1), paragraphs[paragraphs.length - 1]];
  return truncateVisibleChars(compacted.join('\n\n'), MAX_AUTHOR_NOTE_CHARS).trim();
}

export function sanitizeAuthorNote(rawNote: string): string {
  if (AUTHOR_NOTE_RAW_REJECT_PATTERNS.some(pattern => pattern.test(rawNote))) {
    return '';
  }
  const sanitized = rawNote
    .trim()
    .split(/\n+/u)
    .map(line => line.trim())
    .map(sanitizeParagraph)
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const compacted = compactAuthorNote(sanitized);
  if (AUTHOR_NOTE_UNSAFE_RESIDUE_PATTERNS.some(pattern => pattern.test(compacted))) {
    return '';
  }
  return compacted;
}
