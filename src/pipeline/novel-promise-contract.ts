import type { NovelMetadata } from '../novel/types.js';
import { constitutionToPromiseContract } from './constitution-bridge.js';
import { buildPromiseContract, type PromiseContract } from './promise-contract.js';

export type NovelPromiseSource = Pick<
  NovelMetadata,
  | 'title'
  | 'synopsis'
  | 'tags'
  | 'constitutionTags'
  | 'genre'
  | 'startupPlatformProfile'
  | 'constitution'
>;

export function buildNovelPromiseContract(novel: NovelPromiseSource): PromiseContract {
  const fallbackContract = buildPromiseContract({
    title: novel.title,
    synopsis: novel.synopsis,
    tags: novel.tags,
    constitutionTags: novel.constitutionTags,
    genre: novel.genre,
    platformProfile: novel.startupPlatformProfile,
  });

  return novel.constitution
    ? constitutionToPromiseContract(novel.constitution, {
        genre: novel.genre,
        fallbackContract,
      })
    : fallbackContract;
}
