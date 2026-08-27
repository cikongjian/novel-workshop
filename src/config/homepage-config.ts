import { brand, formatCopyright } from './brand.js';

export type HomePageHighlight = {
  title: string;
  description: string;
};

export type HomePageShowcaseItem = {
  novelId: string;
  displayTitle: string;
  authorName: string;
  genreLabel: string;
  logline: string;
  synopsis: string;
  chapterNumbers: number[];
};

export type HomePageShowcaseSection = {
  eyebrow: string;
  title: string;
  description: string;
  items: HomePageShowcaseItem[];
};

export type HomePageVariant = {
  heroTitle: string;
  heroDescription: string;
  primaryActionLabel: string;
  primaryActionRoute: string;
  secondaryActionLabel: string;
  secondaryActionRoute: string;
  capabilities: string[];
  highlights: HomePageHighlight[];
};

export type HomePageFooterContactType =
  | 'email'
  | 'qq'
  | 'wechat'
  | 'wecom'
  | 'telegram'
  | 'phone'
  | 'other';

export type HomePageFooterContact = {
  type: HomePageFooterContactType;
  label: string;
  value: string;
  href: string;
};

export type HomePageFooter = {
  companyName: string;
  copyrightText: string;
  icpNumber: string;
  icpLink: string;
  policeNumber: string;
  policeLink: string;
  supportEmail: string;
  address: string;
  privacyLabel: string;
  privacyLink: string;
  termsLabel: string;
  termsLink: string;
  contactLabel: string;
  contactLink: string;
  contacts: HomePageFooterContact[];
  navGroups: HomePageFooterNavGroup[];
};

export type HomePageFooterNavLink = {
  label: string;
  href: string;
};

export type HomePageFooterNavGroup = {
  title: string;
  links: HomePageFooterNavLink[];
};

export type HomePageConfig = {
  brandSubtitle: string;
  variant: HomePageVariant;
  showcase: HomePageShowcaseSection;
  footer: HomePageFooter;
};

const LEGACY_SHOWCASE_TITLE = '首页样品小说';
const LEGACY_SHOWCASE_DESCRIPTION = '管理员可挑选样品小说与指定章节，用于对外展示平台生成与打磨能力。';
const DEFAULT_SHOWCASE_TITLE = '代表作品试读';
const DEFAULT_SHOWCASE_DESCRIPTION = '用真实样章直接展示长篇生成、批量改写与长线一致性的成稿效果。';
const LEGACY_HERO_TITLE = '一句话灵感，也能一路推到百章长篇';
const LEGACY_HERO_DESCRIPTION = '不是只帮你润色一章，而是支持百章蓝图、批量生成、分支续写、质量门禁和一致性体检，让长篇创作真正能持续推进。';
const DEFAULT_HERO_TITLE = '从一句话灵感，到多章故事线与长篇成稿';
const DEFAULT_HERO_DESCRIPTION = '先推演百章节奏与数章故事线，再批量生成正文；需要换路线时可从任意章节分支续写，并用一致性检查把长篇稳住。';
const LEGACY_CAPABILITIES = ['百章蓝图', '批量生成', '质量体检'];
const DEFAULT_CAPABILITIES = ['故事线推演', '批量生成', '分支续写', '一致性体检'];

const LEGACY_HIGHLIGHTS: HomePageHighlight[] = [
  {
    title: '一句话灵感可扩成百章蓝图',
    description: '可先把长篇节奏、关键节点和伏笔布局规划出来，不是直接盲写正文。',
  },
  {
    title: '支持批量生成与批量改写',
    description: '既能连续推进多章初稿，也能对多章节统一改写，效率更适合长篇连载。',
  },
  {
    title: '可从任意章节分支续写',
    description: '中途想测试不同剧情走向时，可直接从指定章节拉出新分支，并继续往后写。',
  },
  {
    title: '8 道门禁持续检查一致性',
    description: '世界观、大纲、结构、文风和情绪等关键维度会持续校验，减少后期大改成本。',
  },
];

const DEFAULT_HIGHLIGHTS: HomePageHighlight[] = [
  {
    title: '一句话灵感可推演成数章到百章蓝图',
    description: '先把主线节奏、关键节点和伏笔布局推出来，再进入正文推进，长篇开局更稳。',
  },
  {
    title: '多章连续生成与统一改写',
    description: '可按章节范围连续产出初稿，也能一次性对多章统一改写，更适合连载节奏。',
  },
  {
    title: '可从任意章节拉出新分支',
    description: '写到中段想验证另一条路线时，直接从当前章节继续分支，不必从头重来。',
  },
  {
    title: '8 道门禁持续稳住长线质量',
    description: '世界观、大纲、结构、情绪与对话一致性会持续复检，减少后期大改。',
  },
];

const DEFAULT_HOME_PAGE_CONFIG: HomePageConfig = {
  brandSubtitle: '把灵感、故事线与成稿推进放进同一条长篇流程',
  variant: {
    heroTitle: DEFAULT_HERO_TITLE,
    heroDescription: DEFAULT_HERO_DESCRIPTION,
    primaryActionLabel: '立即开始创作',
    primaryActionRoute: '/',
    secondaryActionLabel: '查看商业方案',
    secondaryActionRoute: '/pricing',
    capabilities: DEFAULT_CAPABILITIES,
    highlights: DEFAULT_HIGHLIGHTS,
  },
  showcase: {
    eyebrow: 'FEATURED NOVELS',
    title: DEFAULT_SHOWCASE_TITLE,
    description: DEFAULT_SHOWCASE_DESCRIPTION,
    items: [],
  },
  footer: {
    companyName: brand.displayName,
    copyrightText: formatCopyright(),
    icpNumber: '',
    icpLink: '',
    policeNumber: '',
    policeLink: '',
    supportEmail: '',
    address: '',
    privacyLabel: '隐私政策',
    privacyLink: '/privacy',
    termsLabel: '用户协议',
    termsLink: '/terms',
    contactLabel: '联系我们',
    contactLink: '',
    contacts: [],
    navGroups: [
      {
        title: '产品',
        links: [
          { label: '首页', href: '/' },
          { label: '登录', href: '/login' },
          { label: '工作台', href: '/dashboard' },
        ],
      },
      {
        title: '帮助',
        links: [],
      },
      {
        title: '法务',
        links: [
          { label: '隐私政策', href: '/privacy' },
          { label: '用户协议', href: '/terms' },
        ],
      },
    ],
  },
};

function sanitizeText(input: unknown, fallback: string, maxLen: number): string {
  if (typeof input !== 'string') return fallback;
  const normalized = input.replace(/[\r\n]+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLen);
}

function sanitizeRoute(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const normalized = input.trim();
  if (!normalized) return fallback;
  return normalized.startsWith('/') ? normalized : fallback;
}

function sanitizeUrl(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const normalized = input.trim();
  if (!normalized) return fallback;
  return /^https?:\/\//i.test(normalized) ? normalized : fallback;
}

function sanitizeFooterLink(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const normalized = input.trim();
  if (!normalized) return fallback;
  return /^(https?:\/\/|mailto:|\/)/i.test(normalized) ? normalized : fallback;
}

function sanitizeFooterContactType(input: unknown, fallback: HomePageFooterContactType): HomePageFooterContactType {
  if (typeof input !== 'string') return fallback;
  const normalized = input.trim();
  const allowed: HomePageFooterContactType[] = ['email', 'qq', 'wechat', 'wecom', 'telegram', 'phone', 'other'];
  return allowed.includes(normalized as HomePageFooterContactType)
    ? (normalized as HomePageFooterContactType)
    : fallback;
}

function sanitizeUuid(input: unknown): string {
  if (typeof input !== 'string') return '';
  const normalized = input.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : '';
}

function sanitizeChapterNumbers(input: unknown, fallback: number[]): number[] {
  if (!Array.isArray(input)) return [...fallback];
  const next = [...new Set(
    input
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 1 && item <= 9999),
  )].sort((a, b) => a - b).slice(0, 6);
  return next.length > 0 ? next : [...fallback];
}

function sanitizeCapabilities(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) return fallback;
  const list = input
    .map((item) => sanitizeText(item, '', 24))
    .filter(Boolean)
    .slice(0, 6);
  return list.length > 0 ? list : fallback;
}

function sanitizeHighlights(input: unknown, fallback: HomePageHighlight[]): HomePageHighlight[] {
  if (!Array.isArray(input)) return fallback;

  const next = input
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const title = sanitizeText(record.title, '', 30);
      const description = sanitizeText(record.description, '', 120);
      if (!title || !description) return null;
      return { title, description };
    })
    .filter((item): item is HomePageHighlight => Boolean(item))
    .slice(0, 8);

  return next.length > 0 ? next : fallback;
}

function sanitizeFooter(input: unknown, fallback: HomePageFooter): HomePageFooter {
  const source = (input && typeof input === 'object')
    ? (input as Record<string, unknown>)
    : {};
  return {
    companyName: sanitizeText(source.companyName, fallback.companyName, 60),
    copyrightText: sanitizeText(source.copyrightText, fallback.copyrightText, 120),
    icpNumber: sanitizeText(source.icpNumber, fallback.icpNumber, 40),
    icpLink: sanitizeUrl(source.icpLink, fallback.icpLink),
    policeNumber: sanitizeText(source.policeNumber, fallback.policeNumber, 48),
    policeLink: sanitizeUrl(source.policeLink, fallback.policeLink),
    supportEmail: sanitizeText(source.supportEmail, fallback.supportEmail, 80),
    address: sanitizeText(source.address, fallback.address, 120),
    privacyLabel: sanitizeText(source.privacyLabel, fallback.privacyLabel, 20),
    privacyLink: sanitizeFooterLink(source.privacyLink, fallback.privacyLink),
    termsLabel: sanitizeText(source.termsLabel, fallback.termsLabel, 20),
    termsLink: sanitizeFooterLink(source.termsLink, fallback.termsLink),
    contactLabel: sanitizeText(source.contactLabel, fallback.contactLabel, 20),
    contactLink: sanitizeFooterLink(source.contactLink, fallback.contactLink),
    contacts: sanitizeFooterContacts(source.contacts, fallback.contacts),
    navGroups: sanitizeFooterNavGroups(source.navGroups, fallback.navGroups),
  };
}

function sanitizeFooterContacts(input: unknown, fallback: HomePageFooterContact[]): HomePageFooterContact[] {
  if (!Array.isArray(input)) {
    return fallback.map((item) => ({ ...item }));
  }
  const next = input
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const type = sanitizeFooterContactType(record.type, 'other');
      const label = sanitizeText(record.label, '', 20);
      const value = sanitizeText(record.value, '', 80);
      const href = sanitizeFooterLink(record.href, '');
      if (!value) return null;
      return {
        type,
        label,
        value,
        href,
      };
    })
    .filter((item): item is HomePageFooterContact => Boolean(item))
    .slice(0, 8);
  return next.length > 0 ? next : fallback.map((item) => ({ ...item }));
}

function sanitizeFooterNavGroups(input: unknown, fallback: HomePageFooterNavGroup[]): HomePageFooterNavGroup[] {
  if (!Array.isArray(input)) {
    return fallback.map((group) => ({
      title: group.title,
      links: group.links.map((link) => ({ ...link })),
    }));
  }
  const next = input
    .map((group) => {
      if (!group || typeof group !== 'object') return null;
      const record = group as Record<string, unknown>;
      const title = sanitizeText(record.title, '', 20);
      if (!title) return null;
      const links = Array.isArray(record.links)
        ? record.links
          .map((link) => {
            if (!link || typeof link !== 'object') return null;
            const linkRecord = link as Record<string, unknown>;
            const label = sanitizeText(linkRecord.label, '', 20);
            const href = sanitizeFooterLink(linkRecord.href, '');
            if (!label || !href) return null;
            return { label, href };
          })
          .filter((link): link is HomePageFooterNavLink => Boolean(link))
          .slice(0, 6)
        : [];
      return {
        title,
        links,
      };
    })
    .filter((group): group is HomePageFooterNavGroup => Boolean(group))
    .slice(0, 4);

  return next.length > 0
    ? next
    : fallback.map((group) => ({
      title: group.title,
      links: group.links.map((link) => ({ ...link })),
    }));
}

function sanitizeShowcaseItem(input: unknown, fallback?: HomePageShowcaseItem): HomePageShowcaseItem | null {
  if (!input || typeof input !== 'object') return fallback ? { ...fallback, chapterNumbers: [...fallback.chapterNumbers] } : null;
  const source = input as Record<string, unknown>;
  const novelId = sanitizeUuid(source.novelId);
  if (!novelId) return null;
  const fallbackValue = fallback ?? {
    novelId,
    displayTitle: '',
    authorName: '',
    genreLabel: '',
    logline: '',
    synopsis: '',
    chapterNumbers: [1],
  };
  return {
    novelId,
    displayTitle: sanitizeText(source.displayTitle, fallbackValue.displayTitle, 60),
    authorName: sanitizeText(source.authorName, fallbackValue.authorName, 30),
    genreLabel: sanitizeText(source.genreLabel, fallbackValue.genreLabel, 20),
    logline: sanitizeText(source.logline, fallbackValue.logline, 80),
    synopsis: sanitizeText(source.synopsis, fallbackValue.synopsis, 220),
    chapterNumbers: sanitizeChapterNumbers(source.chapterNumbers, fallbackValue.chapterNumbers),
  };
}

function sanitizeShowcaseSection(input: unknown, fallback: HomePageShowcaseSection): HomePageShowcaseSection {
  const source = (input && typeof input === 'object')
    ? (input as Record<string, unknown>)
    : {};
  const items = Array.isArray(source.items)
    ? source.items
      .map((item) => sanitizeShowcaseItem(item))
      .filter((item): item is HomePageShowcaseItem => Boolean(item))
      .slice(0, 8)
    : fallback.items.map((item) => ({ ...item, chapterNumbers: [...item.chapterNumbers] }));
  const title = sanitizeText(source.title, fallback.title, 40);
  const description = sanitizeText(source.description, fallback.description, 160);
  return {
    eyebrow: sanitizeText(source.eyebrow, fallback.eyebrow, 30),
    title: shouldRewriteShowcaseTitle(title) ? DEFAULT_SHOWCASE_TITLE : title,
    description: shouldRewriteShowcaseDescription(description) ? DEFAULT_SHOWCASE_DESCRIPTION : description,
    items,
  };
}

function shouldRewriteShowcaseTitle(value: string): boolean {
  return value === LEGACY_SHOWCASE_TITLE || /样品小说|首页样品/i.test(value);
}

function shouldRewriteShowcaseDescription(value: string): boolean {
  return value === LEGACY_SHOWCASE_DESCRIPTION
    || /管理员|后台|对外展示|挑选样品|公开章节|样品小说/i.test(value);
}

function sanitizeVariant(input: unknown, fallback: HomePageVariant): HomePageVariant {
  const source = (input && typeof input === 'object')
    ? (input as Record<string, unknown>)
    : {};
  const capabilityFallback = [...fallback.capabilities];
  const highlightFallback = fallback.highlights.map((item) => ({ ...item }));
  const next = {
    heroTitle: sanitizeText(source.heroTitle, fallback.heroTitle, 60),
    heroDescription: sanitizeText(source.heroDescription, fallback.heroDescription, 220),
    primaryActionLabel: sanitizeText(source.primaryActionLabel, fallback.primaryActionLabel, 20),
    primaryActionRoute: sanitizeRoute(source.primaryActionRoute, fallback.primaryActionRoute),
    secondaryActionLabel: sanitizeText(source.secondaryActionLabel, fallback.secondaryActionLabel, 20),
    secondaryActionRoute: sanitizeRoute(source.secondaryActionRoute, fallback.secondaryActionRoute),
    capabilities: sanitizeCapabilities(source.capabilities, capabilityFallback),
    highlights: sanitizeHighlights(source.highlights, highlightFallback),
  };
  return rewriteLegacyVariantCopy(next);
}

function rewriteLegacyVariantCopy(variant: HomePageVariant): HomePageVariant {
  const next = {
    ...variant,
    capabilities: [...variant.capabilities],
    highlights: variant.highlights.map((item) => ({ ...item })),
  };

  if (next.heroTitle === LEGACY_HERO_TITLE) {
    next.heroTitle = DEFAULT_HERO_TITLE;
  }
  if (next.heroDescription === LEGACY_HERO_DESCRIPTION) {
    next.heroDescription = DEFAULT_HERO_DESCRIPTION;
  }
  if (isSameTextList(next.capabilities, LEGACY_CAPABILITIES)) {
    next.capabilities = [...DEFAULT_CAPABILITIES];
  }

  next.highlights = next.highlights.map((item) => {
    const index = LEGACY_HIGHLIGHTS.findIndex((legacy) =>
      legacy.title === item.title && legacy.description === item.description,
    );
    return index >= 0 ? { ...DEFAULT_HIGHLIGHTS[index] } : item;
  });

  return next;
}

function isSameTextList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function hasLegacyVariantShape(input: Record<string, unknown>): boolean {
  const keys = [
    'heroTitle',
    'heroDescription',
    'primaryActionLabel',
    'primaryActionRoute',
    'secondaryActionLabel',
    'secondaryActionRoute',
    'capabilities',
    'highlights',
  ];
  return keys.some((key) => key in input);
}

function resolveLegacyAuthorVariant(source: Record<string, unknown>): HomePageVariant {
  const fallback = DEFAULT_HOME_PAGE_CONFIG.variant;
  return sanitizeVariant(source, fallback);
}

function cloneHomePageConfig(config: HomePageConfig): HomePageConfig {
  return {
    brandSubtitle: config.brandSubtitle,
    variant: {
      ...config.variant,
      capabilities: [...config.variant.capabilities],
      highlights: config.variant.highlights.map((item) => ({ ...item })),
    },
    showcase: {
      eyebrow: config.showcase.eyebrow,
      title: config.showcase.title,
      description: config.showcase.description,
      items: config.showcase.items.map((item) => ({ ...item, chapterNumbers: [...item.chapterNumbers] })),
    },
    footer: {
      ...config.footer,
      contacts: config.footer.contacts.map((item) => ({ ...item })),
      navGroups: config.footer.navGroups.map((group) => ({
        title: group.title,
        links: group.links.map((link) => ({ ...link })),
      })),
    },
  };
}

export function getDefaultHomePageConfig(): HomePageConfig {
  return cloneHomePageConfig(DEFAULT_HOME_PAGE_CONFIG);
}

export function normalizeHomePageConfig(input: unknown): HomePageConfig {
  const source = (input && typeof input === 'object')
    ? (input as Record<string, unknown>)
    : {};
  const hasLegacy = hasLegacyVariantShape(source);
  const variantsSource = (source.variants && typeof source.variants === 'object')
    ? (source.variants as Record<string, unknown>)
    : {};
  const variantSource = (source.variant && typeof source.variant === 'object')
    ? source.variant
    : variantsSource.author;
  const variantFallback = hasLegacy
    ? resolveLegacyAuthorVariant(source)
    : DEFAULT_HOME_PAGE_CONFIG.variant;

  return {
    brandSubtitle: sanitizeText(source.brandSubtitle, DEFAULT_HOME_PAGE_CONFIG.brandSubtitle, 90),
    variant: sanitizeVariant(variantSource, variantFallback),
    showcase: sanitizeShowcaseSection(source.showcase, DEFAULT_HOME_PAGE_CONFIG.showcase),
    footer: sanitizeFooter(source.footer, DEFAULT_HOME_PAGE_CONFIG.footer),
  };
}

export function decodeHomePageConfigFromEnv(raw: string | undefined): HomePageConfig {
  if (!raw) return getDefaultHomePageConfig();
  try {
    const json = Buffer.from(raw, 'base64').toString('utf-8');
    const parsed = JSON.parse(json);
    return normalizeHomePageConfig(parsed);
  } catch {
    return getDefaultHomePageConfig();
  }
}

export function encodeHomePageConfigForEnv(config: HomePageConfig): string {
  const normalized = normalizeHomePageConfig(config);
  const json = JSON.stringify(normalized);
  return Buffer.from(json, 'utf-8').toString('base64');
}
