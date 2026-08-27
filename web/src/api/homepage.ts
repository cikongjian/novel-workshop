import { http } from './http';
import type { HomepageConfig } from './settings';

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

export type PublicHomepagePayload = Omit<Pick<HomepageConfig, 'brandSubtitle' | 'variant' | 'showcase' | 'footer'>, 'showcase'> & {
  showcase: Omit<HomepageConfig['showcase'], 'items'> & {
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

export async function fetchPublicHomepage(): Promise<PublicHomepagePayload> {
  const { data } = await http.get<PublicHomepagePayload>('/homepage/public');
  return data;
}

export async function fetchPublicHomepageChapter(novelId: string, chapterNumber: number): Promise<PublicHomepageChapterPayload> {
  const { data } = await http.get<PublicHomepageChapterPayload>(`/homepage/public/novels/${novelId}/chapters/${chapterNumber}`);
  return data;
}
