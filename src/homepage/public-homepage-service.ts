import { readSettings, type HomePageConfig } from '../config/index.js';
import { brand } from '../config/brand.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { NovelGenre } from '../novel/types.js';
import {
  cleanPublicFacingContent,
  makePublicFacingExcerpt,
} from '../utils/public-facing-content.js';

export type PublicHomepageShowcaseChapter = {
  chapterNumber: number;
  title: string;
  wordCount: number;
  excerpt: string;
};

export type PublicHomepageShowcaseNovel = {
  novelId: string;
  title: string;
  displayTitle: string;
  authorName: string;
  genreLabel: string;
  logline: string;
  synopsis: string;
  chapterCount: number;
  coverUrl?: string;
  chapters: PublicHomepageShowcaseChapter[];
};

export type PublicHomepagePayload = Omit<Pick<HomePageConfig, 'brandSubtitle' | 'variant' | 'showcase' | 'footer'>, 'showcase'> & {
  showcase: Omit<HomePageConfig['showcase'], 'items'> & {
    items: PublicHomepageShowcaseNovel[];
  };
};

export type PublicHomepageChapterPayload = {
  novelId: string;
  novelTitle: string;
  displayTitle: string;
  authorName: string;
  genreLabel: string;
  chapterNumber: number;
  chapterTitle: string;
  wordCount: number;
  content: string;
  updatedAt: string;
};

const GENRE_LABELS: Record<NovelGenre, string> = {
  fantasy: '玄幻/奇幻',
  mystery: '悬疑/推理',
  modern: '都市/现代',
  scifi: '科幻',
  historical: '历史',
  romance: '言情',
  custom: '自定义',
};

const DEFAULT_SHOWCASE_TITLE = '代表作品试读';
const DEFAULT_SHOWCASE_DESCRIPTION = '用真实样章直接展示长篇生成、批量改写与长线一致性的成稿效果。';

export async function buildPublicHomepagePayload(novelManager: NovelManager): Promise<PublicHomepagePayload> {
  const homepageConfig = readSettings().homepageConfig;
  const items = (await Promise.all(
    homepageConfig.showcase.items.map((item) => resolveShowcaseNovel(novelManager, item)),
  )).filter((item): item is PublicHomepageShowcaseNovel => Boolean(item));

  return {
    brandSubtitle: homepageConfig.brandSubtitle,
    variant: homepageConfig.variant,
    footer: homepageConfig.footer,
    showcase: {
      eyebrow: homepageConfig.showcase.eyebrow,
      title: shouldRewriteShowcaseTitle(homepageConfig.showcase.title)
        ? DEFAULT_SHOWCASE_TITLE
        : homepageConfig.showcase.title,
      description: shouldRewriteShowcaseDescription(homepageConfig.showcase.description)
        ? DEFAULT_SHOWCASE_DESCRIPTION
        : homepageConfig.showcase.description,
      items,
    },
  };
}

export async function getPublishedHomepageChapterPreview(
  novelManager: NovelManager,
  novelId: string,
  chapterNumber: number,
): Promise<PublicHomepageChapterPayload | null> {
  const homepageConfig = readSettings().homepageConfig;
  const showcaseItem = homepageConfig.showcase.items.find((item) => item.novelId === novelId);
  if (!showcaseItem || !showcaseItem.chapterNumbers.includes(chapterNumber)) {
    return null;
  }

  try {
    const [novel, chapter] = await Promise.all([
      novelManager.getNovel(novelId),
      novelManager.getChapter(novelId, chapterNumber),
    ]);
    if (!chapter) return null;
    const content = cleanPublicFacingContent(chapter.content);
    return {
      novelId,
      novelTitle: novel.title,
      displayTitle: novel.title,
      authorName: `${brand.displayName} 代表作品`,
      genreLabel: GENRE_LABELS[novel.genre] || '长篇小说',
      chapterNumber,
      chapterTitle: chapter.title || `第 ${chapterNumber} 章`,
      wordCount: chapter.wordCount ?? countWords(content),
      content,
      updatedAt: chapter.updatedAt,
    };
  } catch {
    return null;
  }
}

async function resolveShowcaseNovel(
  novelManager: NovelManager,
  item: HomePageConfig['showcase']['items'][number],
): Promise<PublicHomepageShowcaseNovel | null> {
  try {
    const [novel, chapters] = await Promise.all([
      novelManager.getNovel(item.novelId),
      Promise.all(item.chapterNumbers.map((chapterNumber) => novelManager.getChapter(item.novelId, chapterNumber))),
    ]);
    const chapterSummaries = chapters
      .map((chapter, index) => {
        if (!chapter) return null;
        return {
          chapterNumber: item.chapterNumbers[index],
          title: chapter.title || `第 ${item.chapterNumbers[index]} 章`,
          wordCount: chapter.wordCount ?? countWords(chapter.content),
          excerpt: makePublicFacingExcerpt(chapter.content),
        };
      })
      .filter((chapter): chapter is PublicHomepageShowcaseChapter => Boolean(chapter));
    if (chapterSummaries.length === 0) return null;

    const chapterCount = novel.chapterCount ?? (await novelManager.countChapters(item.novelId));
    return {
      novelId: item.novelId,
      title: novel.title,
      displayTitle: novel.title,
      authorName: `${brand.displayName} 代表作品`,
      genreLabel: GENRE_LABELS[novel.genre] || '长篇小说',
      logline: novel.description || novel.synopsis || '由平台工作流协同产出的长篇代表作试读。',
      synopsis: novel.synopsis || novel.description || '暂无简介',
      chapterCount,
      coverUrl: novel.coverImage ? `/api/novels/cover/${item.novelId}?v=${encodeURIComponent(novel.updatedAt)}` : undefined,
      chapters: chapterSummaries,
    };
  } catch {
    return null;
  }
}

function makeExcerpt(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return '该章节已发布，但暂未生成可展示摘录。';
  if (normalized.length <= 140) return normalized;
  return `${normalized.slice(0, 140)}...`;
}

function countWords(content: string): number {
  return content.trim().length;
}

function shouldRewriteShowcaseTitle(value: string): boolean {
  return /样品小说|首页样品/i.test(value);
}

function shouldRewriteShowcaseDescription(value: string): boolean {
  return /管理员|后台|对外展示|挑选样品|公开章节|样品小说/i.test(value);
}
