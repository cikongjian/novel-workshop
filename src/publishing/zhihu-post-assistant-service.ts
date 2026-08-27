import { runWithAiUsageContextAsync } from '../ai/usage-context.js';
import { getAvailableFeatures, type FeatureCategory } from '../config/feature-flags.js';
import type { ModelClient, ChatMessage } from '../models/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { NovelMetadata } from '../novel/types.js';
import type { BookStoreManager } from '../bookstore/bookstore-manager.js';
import type { BookStore, PublishStatus } from '../bookstore/types.js';

const MAX_HISTORY_MESSAGES = 8;
const MAX_FEATURES = 12;
const MAX_NOVELS = 8;
const MAX_BOOKS = 8;

const FEATURE_CATEGORY_LABELS: Record<FeatureCategory, string> = {
  public: '对外功能',
  advanced: '进阶能力',
  internal: '内部能力',
};

const GENRE_LABELS: Record<string, string> = {
  fantasy: '玄幻',
  mystery: '悬疑',
  modern: '都市',
  scifi: '科幻',
  historical: '历史',
  romance: '言情',
  custom: '自定义',
};

const NOVEL_STATUS_LABELS: Record<string, string> = {
  planning: '构思中',
  writing: '连载中',
  paused: '暂停',
  completed: '完结',
  published: '已发布',
};

const PUBLISH_STATUS_LABELS: Record<PublishStatus, string> = {
  draft: '草稿',
  pending: '待审核',
  approved: '已上架',
  rejected: '已拒绝',
  offline: '已下架',
};

const ZHIHU_ASSISTANT_SYSTEM_PROMPT = [
  '你是管理员专用的知乎发文助手。',
  '你的工作是把平台当前功能、作品动态和管理员意图，转成适合知乎发布的中文内容。',
  '',
  '工作原则：',
  '1. 只能基于给定的平台事实写内容，不要虚构数据、用户量、营收、合作方、排名和媒体报道。',
  '2. 写作优先像真人经验分享，不像广告。少用空话，多用场景、问题、限制、取舍和实际观察。',
  '3. 默认避免模板腔。优先在这些角度里轮换：教程、排坑、对比、复盘、产品观察、功能更新解读、小说上新观察。',
  '4. 不要诱导点赞关注，不要写夸张标题党，不要把平台包装成“全网第一”“颠覆行业”。',
  '5. 如果用户要求“直接可发”，就输出完整知乎草稿；如果用户还在想方向，先给 3 到 5 个选题，再给推荐方向。',
  '6. 如果缺少关键意图，只允许追问一个最关键的问题；如果信息已经够，就直接写。',
  '7. 可以主动引用最近更新的小说和书城作品，但要区分哪些是平台内已有、哪些只是建议写法。',
  '',
  '输出偏好：',
  '- 标题要具体，避免口号。',
  '- 开头先给结论或问题，不要长铺垫。',
  '- 正文优先段落化，便于直接贴到知乎。',
  '- 如果合适，可以顺带给 2 到 3 个备选标题或开头版本。',
].join('\n');

export type ZhihuAssistantHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ZhihuAssistantOutputMode = 'topics' | 'outline' | 'answer' | 'polish';

export type ZhihuAssistantFeature = {
  id: string;
  label: string;
  category: FeatureCategory;
  categoryLabel: string;
  description: string;
};

export type ZhihuAssistantNovel = {
  id: string;
  title: string;
  genre: string;
  genreLabel: string;
  status: string;
  statusLabel: string;
  synopsis: string;
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ZhihuAssistantBook = {
  id: string;
  novelId: string;
  title: string;
  category: string;
  publishStatus: PublishStatus;
  publishStatusLabel: string;
  description: string;
  tags: string[];
  publishTime: string;
  updateTime: string;
  viewCount: number;
};

export type ZhihuAssistantKnowledgeSnapshot = {
  generatedAt: string;
  counts: {
    publicFeatures: number;
    internalHighlights: number;
    novels: number;
    books: number;
    approvedBooks: number;
  };
  publicFeatures: ZhihuAssistantFeature[];
  internalHighlights: ZhihuAssistantFeature[];
  recentNovels: ZhihuAssistantNovel[];
  recentBooks: ZhihuAssistantBook[];
};

type ZhihuAssistantChatInput = {
  message: string;
  history?: ZhihuAssistantHistoryMessage[];
  outputMode?: ZhihuAssistantOutputMode;
  selectedFeatureIds?: string[];
  selectedNovelIds?: string[];
  selectedBookIds?: string[];
};

type NovelListSource = Pick<NovelManager, 'listNovels'>;
type BookListSource = Pick<BookStoreManager, 'adminListBooks'>;

function formatFeature(feature: ReturnType<typeof getAvailableFeatures>[number]): ZhihuAssistantFeature {
  return {
    id: feature.id,
    label: feature.label,
    category: feature.category,
    categoryLabel: FEATURE_CATEGORY_LABELS[feature.category],
    description: feature.description ?? '',
  };
}

function formatNovel(novel: NovelMetadata): ZhihuAssistantNovel {
  return {
    id: novel.id,
    title: novel.title,
    genre: novel.genre,
    genreLabel: GENRE_LABELS[novel.genre] ?? novel.genre,
    status: novel.status,
    statusLabel: NOVEL_STATUS_LABELS[novel.status] ?? novel.status,
    synopsis: novel.synopsis ?? '',
    chapterCount: novel.chapterCount ?? 0,
    createdAt: novel.createdAt,
    updatedAt: novel.updatedAt,
  };
}

function formatBook(book: BookStore): ZhihuAssistantBook {
  return {
    id: book.id,
    novelId: book.novelId,
    title: book.title,
    category: book.category,
    publishStatus: book.publishStatus,
    publishStatusLabel: PUBLISH_STATUS_LABELS[book.publishStatus],
    description: book.description,
    tags: book.tags,
    publishTime: book.publishTime.toISOString(),
    updateTime: book.updateTime.toISOString(),
    viewCount: book.viewCount,
  };
}

function formatSnapshotContext(snapshot: ZhihuAssistantKnowledgeSnapshot): string {
  const lines: string[] = [];

  lines.push('## 平台知识快照');
  lines.push(`- 生成时间: ${snapshot.generatedAt}`);
  lines.push(`- 对外功能数: ${snapshot.counts.publicFeatures}`);
  lines.push(`- 内部能力数: ${snapshot.counts.internalHighlights}`);
  lines.push(`- 小说总数: ${snapshot.counts.novels}`);
  lines.push(`- 书城作品总数: ${snapshot.counts.books}`);
  lines.push(`- 已上架书城作品: ${snapshot.counts.approvedBooks}`);
  lines.push('');

  lines.push('## 当前对外功能');
  for (const feature of snapshot.publicFeatures) {
    lines.push(`- ${feature.label}（${feature.categoryLabel}）: ${feature.description || '暂无补充描述'}`);
  }
  lines.push('');

  if (snapshot.internalHighlights.length > 0) {
    lines.push('## 当前内部/管理员能力');
    for (const feature of snapshot.internalHighlights) {
      lines.push(`- ${feature.label}（${feature.categoryLabel}）: ${feature.description || '暂无补充描述'}`);
    }
    lines.push('');
  }

  if (snapshot.recentNovels.length > 0) {
    lines.push('## 最近更新的小说');
    for (const novel of snapshot.recentNovels) {
      lines.push(`- ${novel.title}｜${novel.genreLabel}｜${novel.statusLabel}｜章节 ${novel.chapterCount}｜更新于 ${novel.updatedAt}`);
      if (novel.synopsis.trim()) {
        lines.push(`  简介: ${novel.synopsis.slice(0, 120)}`);
      }
    }
    lines.push('');
  }

  if (snapshot.recentBooks.length > 0) {
    lines.push('## 最近书城作品动态');
    for (const book of snapshot.recentBooks) {
      const tagSuffix = book.tags.length > 0 ? `｜标签 ${book.tags.slice(0, 3).join('、')}` : '';
      lines.push(`- ${book.title}｜${book.category}｜${book.publishStatusLabel}｜浏览 ${book.viewCount}｜更新于 ${book.updateTime}${tagSuffix}`);
      if (book.description.trim()) {
        lines.push(`  简介: ${book.description.slice(0, 120)}`);
      }
    }
  }

  return lines.join('\n').trim();
}

function normalizeIds(ids: string[] | undefined, maxItems: number): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, maxItems);
}

function buildOutputModeInstruction(mode: ZhihuAssistantOutputMode | undefined): string {
  switch (mode) {
    case 'topics':
      return [
        '本次输出模式：知乎选题。',
        '请优先输出 5 个选题，每个选题都要包含：适合回答的问题场景、推荐角度、为什么值得写。',
        '最后只推荐 1 个最值得先发的方向。',
      ].join('\n');
    case 'outline':
      return [
        '本次输出模式：知乎提纲。',
        '请输出一个可直接写成长回答的提纲。',
        '结构至少包含：标题建议、开头切入、正文 3 到 5 个主体段、小结。',
      ].join('\n');
    case 'polish':
      return [
        '本次输出模式：知乎润色。',
        '如果用户贴来的是草稿，请保留原意做重写和去模板化。',
        '优先消除广告腔、空话和重复句式，让内容更像真人经验分享。',
      ].join('\n');
    case 'answer':
    default:
      return [
        '本次输出模式：知乎回答。',
        '请直接给出一篇可发布的知乎回答草稿。',
        '必要时可以顺带给 2 个备选标题，但正文必须完整。',
      ].join('\n');
  }
}

function buildSelectionInstruction(params: {
  selectedFeatures: ZhihuAssistantFeature[];
  selectedNovels: ZhihuAssistantNovel[];
  selectedBooks: ZhihuAssistantBook[];
}): string {
  const lines: string[] = [];

  if (params.selectedFeatures.length > 0) {
    lines.push('## 本次指定引用的功能');
    for (const feature of params.selectedFeatures) {
      lines.push(`- ${feature.label}: ${feature.description || '暂无补充描述'}`);
    }
    lines.push('');
  }

  if (params.selectedNovels.length > 0) {
    lines.push('## 本次指定引用的小说');
    for (const novel of params.selectedNovels) {
      lines.push(`- ${novel.title}｜${novel.genreLabel}｜${novel.statusLabel}｜章节 ${novel.chapterCount}`);
      if (novel.synopsis.trim()) {
        lines.push(`  简介: ${novel.synopsis.slice(0, 160)}`);
      }
    }
    lines.push('');
  }

  if (params.selectedBooks.length > 0) {
    lines.push('## 本次指定引用的书城动态');
    for (const book of params.selectedBooks) {
      lines.push(`- ${book.title}｜${book.category}｜${book.publishStatusLabel}｜浏览 ${book.viewCount}`);
      if (book.description.trim()) {
        lines.push(`  简介: ${book.description.slice(0, 160)}`);
      }
    }
  }

  if (lines.length === 0) {
    return '本次没有指定引用范围。你可以自行从平台快照里选择最相关的事实来写。';
  }

  return lines.join('\n').trim();
}

export class ZhihuPostAssistantService {
  constructor(
    private readonly deps: {
      novelManager: NovelListSource;
      bookStoreManager?: BookListSource;
      modelClient: ModelClient;
    },
  ) {}

  async getKnowledgeSnapshot(): Promise<ZhihuAssistantKnowledgeSnapshot> {
    const [novels, books] = await Promise.all([
      this.deps.novelManager.listNovels(),
      this.deps.bookStoreManager?.adminListBooks() ?? Promise.resolve([]),
    ]);

    const publicFeatures = getAvailableFeatures('user')
      .slice(0, MAX_FEATURES)
      .map(formatFeature);
    const internalHighlights = getAvailableFeatures('admin')
      .filter((feature) => feature.category === 'internal' || feature.requiresAdmin)
      .slice(0, MAX_FEATURES)
      .map(formatFeature);

    return {
      generatedAt: new Date().toISOString(),
      counts: {
        publicFeatures: publicFeatures.length,
        internalHighlights: internalHighlights.length,
        novels: novels.length,
        books: books.length,
        approvedBooks: books.filter((book) => book.publishStatus === 'approved').length,
      },
      publicFeatures,
      internalHighlights,
      recentNovels: novels.slice(0, MAX_NOVELS).map(formatNovel),
      recentBooks: books.slice(0, MAX_BOOKS).map(formatBook),
    };
  }

  async chat(input: ZhihuAssistantChatInput): Promise<{
    reply: string;
    snapshot: ZhihuAssistantKnowledgeSnapshot;
  }> {
    const snapshot = await this.getKnowledgeSnapshot();
    const selectedFeatureIds = normalizeIds(input.selectedFeatureIds, MAX_FEATURES);
    const selectedNovelIds = normalizeIds(input.selectedNovelIds, MAX_NOVELS);
    const selectedBookIds = normalizeIds(input.selectedBookIds, MAX_BOOKS);
    const selectedFeatures = snapshot.publicFeatures.filter((item) => selectedFeatureIds.includes(item.id));
    const selectedNovels = snapshot.recentNovels.filter((item) => selectedNovelIds.includes(item.id));
    const selectedBooks = snapshot.recentBooks.filter((item) => selectedBookIds.includes(item.id));
    const messages: ChatMessage[] = [
      { role: 'system', content: ZHIHU_ASSISTANT_SYSTEM_PROMPT },
      { role: 'system', content: formatSnapshotContext(snapshot) },
      { role: 'system', content: buildOutputModeInstruction(input.outputMode) },
      {
        role: 'system',
        content: buildSelectionInstruction({
          selectedFeatures,
          selectedNovels,
          selectedBooks,
        }),
      },
      ...((input.history ?? []).slice(-MAX_HISTORY_MESSAGES).map((item) => ({
        role: item.role,
        content: item.content,
      }))),
      { role: 'user', content: input.message.trim() },
    ];

    const response = await runWithAiUsageContextAsync(
      { agentRole: 'zhihu-post-assistant' },
      () => this.deps.modelClient.chat(messages, {
        temperature: 0.85,
        maxTokens: 4096,
      }),
    );

    return {
      reply: response.content,
      snapshot,
    };
  }
}
