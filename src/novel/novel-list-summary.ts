import { z } from 'zod';
import { NovelMetadata } from './types.js';

export const NovelListSummary = NovelMetadata.pick({
  id: true,
  syncId: true,
  title: true,
  genre: true,
  status: true,
  synopsis: true,
  description: true,
  edgeNarratorVoice: true,
  coverImage: true,
  targetChapters: true,
  titleGuidance: true,
  startupPlatformProfile: true,
  chapterCount: true,
  finalizedChapterCount: true,
  wordCount: true,
  ownerId: true,
  tags: true,
  constitutionTags: true,
  shortStoryBlueprint: true,
  createdAt: true,
  updatedAt: true,
});

export type NovelListSummary = z.infer<typeof NovelListSummary>;
