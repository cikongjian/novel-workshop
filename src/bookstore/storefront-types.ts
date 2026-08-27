import { z } from 'zod';

export const BookStoreSortSchema = z.enum(['updated', 'hot', 'new']);
export type BookStoreSort = z.infer<typeof BookStoreSortSchema>;

const BOOKSTORE_SORT_ALIASES: Record<string, BookStoreSort> = {
  updated: 'updated',
  latest: 'updated',
  latest_updated: 'updated',
  hot: 'hot',
  hottest: 'hot',
  popular: 'hot',
  new: 'new',
  recent_new: 'new',
  rating: 'new',
};

export function normalizeBookStoreSort(value: unknown): BookStoreSort | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return BOOKSTORE_SORT_ALIASES[value.trim().toLowerCase()];
}

export const BookStoreStorefrontConfigSchema = z.object({
  defaultSort: BookStoreSortSchema.default('updated'),
  updatedAt: z.date(),
  updatedBy: z.string(),
});
export type BookStoreStorefrontConfig = z.infer<typeof BookStoreStorefrontConfigSchema>;

export const UpdateBookStoreStorefrontConfigRequestSchema = z.object({
  defaultSort: BookStoreSortSchema,
});
export type UpdateBookStoreStorefrontConfigRequest = z.infer<typeof UpdateBookStoreStorefrontConfigRequestSchema>;
