/**
 * 标题生成策略 — 精简版
 *
 * 只保留基础检查（清洗、套路检测、重复检测），
 * 具体的题材策略、维度推理、包装方案等全部交给 LLM 的三层思考链处理。
 */

export interface TitleStrategyParams {
  genre?: string;
  novelTitle?: string;
  novelSynopsis?: string;
  novelTags?: string[];
  constitutionTags?: string[];
  chapterNumber?: number;
  recentTitles?: string[];
  fullContent?: string;
}

const DIRECT_CLICHES = new Set([
  '真相竟是如此',
  '谁是幕后黑手',
  '意外的访客',
  '生死对决',
  '反击开始',
  '绝地反杀',
  '计划失败',
  '意外收获',
  '峰回路转',
  '久别重逢',
  '心碎时刻',
  '温柔陷阱',
  '实力暴涨',
  '一鸣惊人',
  '碾压全场',
  '身份曝光',
  '强势回归',
  '谁笑到最后',
  '末日降临',
  '基因觉醒',
  '最后的堡垒',
  '第二现场',
  '完美谎言',
]);

const GENERIC_PATTERNS = [
  /^第\s*\d+\s*章$/u,
  /^第\s*\d+\s*章[:：\-]/u,
  /^(继续|后续|开始了|新开始|终局将至)$/u,
  /^(真相|危机|反击|逆袭|守护|希望|曝光|回归|降临|反转|惊变|抉择|秘密)$/u,
  /^[\u4e00-\u9fa5]{2,4}vs[\u4e00-\u9fa5]{2,4}$/u,
];

const ABSTRACT_KEYWORDS = ['真相', '危机', '反击', '逆袭', '守护', '希望', '曝光', '回归', '降临', '反转', '惊变'];

const CHAPTER_PREFIX_PATTERN = /^第\s*[0-9０-９一二三四五六七八九十百千万两]+\s*章\s*[:：、，,.\-—–\s]*/u;
const TITLE_LABEL_PATTERN = /^(?:章节)?标题\s*[:：、，,.\-—–]+/u;
const OUTLINE_LABEL_PATTERN = /^(?:章节)?(?:大纲|纲要|梗概|正文大纲)\s*[:：、，,.\-—–\s]*["“”'‘’`《【「『（(\[]*/u;
const TRAILING_WORD_COUNT_HINT_PATTERN = /(?:约|大约)?[0-9０-９一二三四五六七八九十百千万两]{1,5}字$/u;
const LEADING_DECORATION_PATTERN = /^[\s"'“”‘’`《【「『（(\[#:：、，,。.!！?？;；\-_—–·|]+/u;
const TRAILING_DECORATION_PATTERN = /[\s"'“”‘’`》】」』）)\]]+$/u;
const TEMPLATE_TITLE_PATTERNS = [
  /(?:的|上的)第一[^，,！？?!：:；;、\s]{1,8}$/u,
  /^第一[个场口局次道封座件][^，,！？?!：:；;、\s]{1,8}$/u,
];
const SUMMARY_STYLE_PATTERNS = [
  /^[\u4e00-\u9fa5]{2,6}与[\u4e00-\u9fa5]{2,6}$/u,
  /^[\u4e00-\u9fa5]{2,6}和[\u4e00-\u9fa5]{2,6}$/u,
  /^[\u4e00-\u9fa5]{2,6}及[\u4e00-\u9fa5]{2,6}$/u,
  /[：:]/u,
  /[·•]/u,
  /[-—–]{2,}/u,
  /如何/u,
  /(?:用|靠).{2,14}(?:实现|完成|达成|解决|拿到|获得)/u,
  /(?:实现|完成|达成).{2,12}(?:成交|翻身|开摊|首单|反超|签约|升级)/u,
  /面对.{2,16}(?:压力|规则|危机|阻力|难题)/u,
  /^[\u4e00-\u9fa5]{2,4}(?:正面|公开|当场)?回应.{2,12}(?:质疑|压力|要求)$/u,
  /(?:规则|压力|危机|阻力|难题).*(?:压力|选择|应对|解决|反击)/u,
  /(策略|经营|突围|模式|方案|成本|危机).*(如何|更好|反而|成功|验证)/u,
  /(如何|为什么|怎么).*(更好|成功|解决|突围)/u,
  /[\u4e00-\u9fa5]{2,4}(?:带领|率领|组织|推进).{0,12}(?:团队|小组|项目组).{0,8}(?:联调|测试|验收|复审)/u,
  /^(?:公开战场|会议现场|客户现场).{0,6}(?:拿回|夺回|收回).{0,8}(?:测试环境|权限|资源|预算|项目)/u,
  /(?:提前|主动)?介入的.{1,12}(?:标准|方案|结果|流程|验收)$/u,
  /(?:测试|验收|复审|验证|评审).{0,12}(?:结果)?出炉$/u,
];
const REPEATED_TAIL_WORD_PATTERNS = [
  /前.{1,12}前$/u,
  /后.{1,12}后$/u,
];
const INCOMPLETE_TITLE_PATTERNS = [
  /(?:的|地|得|把|被|向|给|为|与|和|及|或)$/u,
  /(?:开张|摆摊)(?:卖|买)$/u,
  /(?:会议|会场|现场|办公室|工位|客户处|走廊|后台)(?:上|中|里|内)$/u,
  /(?:推进|进入|完成|启动).{0,8}第[一二三四五六七八九十百]+阶$/u,
  /.{8,}开$/u,
];
const ROLE_PLACEHOLDER_TITLE_PATTERN = /(?:^|[^\u4e00-\u9fa5])(?:主角|男主|女主)(?=$|[^\u4e00-\u9fa5])|^(?:主角|男主|女主)/u;

export function sanitizeGeneratedTitle(rawTitle: string): string {
  let title = rawTitle
    .trim()
    .replace(/\s+/gu, '');

  for (let index = 0; index < 4; index += 1) {
    const before = title;
    title = title
      .replace(CHAPTER_PREFIX_PATTERN, '')
      .replace(TITLE_LABEL_PATTERN, '')
      .replace(OUTLINE_LABEL_PATTERN, '')
      .replace(TRAILING_WORD_COUNT_HINT_PATTERN, '')
      .replace(LEADING_DECORATION_PATTERN, '')
      .replace(TRAILING_DECORATION_PATTERN, '');

    if (title === before) break;
  }

  const withoutPunctuation = title.replace(/[。！!？?]+$/u, '');
  return hasUnbalancedQuote(withoutPunctuation)
    ? withoutPunctuation.replace(/["“”‘’「」『』]/gu, '')
    : withoutPunctuation;
}

function hasUnbalancedQuote(title: string): boolean {
  const pairs: Array<[string, string]> = [
    ['“', '”'],
    ['‘', '’'],
    ['「', '」'],
    ['『', '』'],
    ['"', '"'],
  ];
  return pairs.some(([open, close]) => {
    const openCount = countChar(title, open);
    const closeCount = countChar(title, close);
    return openCount !== closeCount;
  });
}

function countChar(text: string, char: string): number {
  return [...text].filter(item => item === char).length;
}

function titleShapeSignature(rawTitle: string): string {
  const title = sanitizeGeneratedTitle(rawTitle);
  if (/^.+?(?:的|上的)第一[^，,！？?!：:；;、\s]{1,8}$/u.test(title)) {
    return '某处的第一某事';
  }
  return title;
}

function sharesShape(title: string, recentTitle: string): boolean {
  if (title.length < 4 || recentTitle.length < 4) return false;
  const titleShape = titleShapeSignature(title);
  const recentShape = titleShapeSignature(recentTitle);
  if (titleShape !== title && titleShape === recentShape) return true;
  return title.slice(0, 2) === recentTitle.slice(0, 2)
    || title.slice(-2) === recentTitle.slice(-2)
    || title === recentTitle;
}

export function inspectGeneratedTitle(title: string, recentTitles: string[] = []): { mechanical: boolean; reasons: string[] } {
  const normalized = sanitizeGeneratedTitle(title);
  const reasons: string[] = [];

  if (!normalized) reasons.push('标题为空');
  if (normalized.length < 4) reasons.push('标题过短');
  if (normalized.length > 18) reasons.push('标题过长');

  if (DIRECT_CLICHES.has(normalized)) {
    reasons.push('命中常见 AI 套路标题');
  }

  // XXvsXX模式专项检测
  const vsPattern = /^[\u4e00-\u9fa5]{2,4}vs[\u4e00-\u9fa5]{2,4}$/u;
  if (vsPattern.test(normalized)) {
    reasons.push('XXvsXX格式套路标题');
  }

  for (const pattern of GENERIC_PATTERNS) {
    if (pattern.test(normalized)) {
      reasons.push('标题过于泛化');
      break;
    }
  }

  if (TEMPLATE_TITLE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    reasons.push('标题句式像模板');
  }

  if (SUMMARY_STYLE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    reasons.push('标题像摘要小标题');
  }

  if (REPEATED_TAIL_WORD_PATTERNS.some((pattern) => pattern.test(normalized))) {
    reasons.push('标题尾词重复');
  }

  if (INCOMPLETE_TITLE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    reasons.push('标题疑似残句');
  }

  if (ROLE_PLACEHOLDER_TITLE_PATTERN.test(normalized)) {
    reasons.push('标题含角色占位词');
  }

  const abstractCount = ABSTRACT_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length;
  if (abstractCount >= 2) {
    reasons.push('堆砌抽象刺激词');
  }

  const recent = recentTitles.map(sanitizeGeneratedTitle).filter(Boolean);
  if (recent.some((item) => item === normalized)) {
    reasons.push('与最近标题重复');
  }
  if (recent.some((item) => sharesShape(normalized, item))) {
    reasons.push('与最近标题句式过近');
  }

  return {
    mechanical: reasons.length > 0,
    reasons,
  };
}
