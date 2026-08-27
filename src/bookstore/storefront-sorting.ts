import type { BookStore } from './types.js';
import type { BookStoreSort } from './storefront-types.js';

function getLatestPublishedTimestamp(book: BookStore): number {
  return (book.publishedChapters ?? [])
    .filter((chapter) => chapter.status === 'published' && chapter.publishedAt instanceof Date)
    .reduce((latest, chapter) => Math.max(latest, chapter.publishedAt?.getTime() ?? 0), 0);
}

function getUpdatedTimestamp(book: BookStore): number {
  const latestPublishedTimestamp = getLatestPublishedTimestamp(book);
  const hasPostPublishUpdate = book.updateTime.getTime() > book.publishTime.getTime();

  if (latestPublishedTimestamp > 0) {
    return Math.max(book.updateTime.getTime(), latestPublishedTimestamp);
  }

  if (hasPostPublishUpdate) {
    return book.updateTime.getTime();
  }

  return 0;
}

function getHotScore(book: BookStore): number {
  return (
    (book.viewCount ?? 0)
    + (book.likeCount ?? 0) * 20
    + (book.favoriteCount ?? 0) * 30
    + (book.commentCount ?? 0) * 12
  );
}

export function sortBookStoreItems(items: BookStore[], sort: BookStoreSort): BookStore[] {
  return [...items].sort((left, right) => {
    if (sort === 'updated') {
      return getUpdatedTimestamp(right) - getUpdatedTimestamp(left);
    }

    if (sort === 'hot') {
      const scoreDelta = getHotScore(right) - getHotScore(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return getUpdatedTimestamp(right) - getUpdatedTimestamp(left);
    }

    const publishDelta = right.publishTime.getTime() - left.publishTime.getTime();
    if (publishDelta !== 0) {
      return publishDelta;
    }
    return getUpdatedTimestamp(right) - getUpdatedTimestamp(left);
  });
}
