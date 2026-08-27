import type { NovelManager } from '../../novel/novel-manager.js';
import type { NovelGenre } from '../../novel/types.js';

export async function syncSourceNovelToTarget(params: {
  sourceManager: NovelManager;
  targetManager: NovelManager;
  sourceNovelId: string;
  targetNovelId?: string;
  targetTitleHint?: string;
}): Promise<{ targetNovelId: string; chapterCount: number }> {
  const sourceNovel = await params.sourceManager.getNovel(params.sourceNovelId);

  let targetNovelId = params.targetNovelId;
  if (!targetNovelId) {
    const created = await params.targetManager.createNovel({
      title: params.targetTitleHint || sourceNovel.title,
      genre: sourceNovel.genre as NovelGenre,
      synopsis: sourceNovel.synopsis,
      description: sourceNovel.description,
    });
    targetNovelId = created.id;
  }

  await params.targetManager.updateNovel(targetNovelId, {
    title: params.targetTitleHint || sourceNovel.title,
    genre: sourceNovel.genre as NovelGenre,
    synopsis: sourceNovel.synopsis,
    description: sourceNovel.description,
    status: 'writing',
    targetChapters: sourceNovel.targetChapters,
  });

  const [sourceWorld, sourceCharacters, sourceOutline, sourceChaptersSummary] = await Promise.all([
    params.sourceManager.getWorldEntries(params.sourceNovelId),
    params.sourceManager.getCharacters(params.sourceNovelId),
    params.sourceManager.getOutline(params.sourceNovelId),
    params.sourceManager.listChapters(params.sourceNovelId),
  ]);

  const [targetWorld, targetCharacters, targetChaptersSummary] = await Promise.all([
    params.targetManager.getWorldEntries(targetNovelId),
    params.targetManager.getCharacters(targetNovelId),
    params.targetManager.listChapters(targetNovelId),
  ]);

  for (const entry of targetWorld) {
    await params.targetManager.deleteWorldEntry(targetNovelId, entry.id);
  }
  for (const entry of targetCharacters) {
    await params.targetManager.deleteCharacter(targetNovelId, entry.id);
  }
  for (const summary of targetChaptersSummary) {
    await params.targetManager.deleteChapter(targetNovelId, summary.chapterNumber);
  }

  for (const entry of sourceWorld) {
    await params.targetManager.saveWorldEntry(targetNovelId, entry);
  }
  for (const entry of sourceCharacters) {
    await params.targetManager.saveCharacter(targetNovelId, entry);
  }
  await params.targetManager.saveOutline(targetNovelId, sourceOutline);

  for (const chapterSummary of sourceChaptersSummary) {
    const chapter = await params.sourceManager.getChapter(params.sourceNovelId, chapterSummary.chapterNumber);
    if (!chapter) continue;
    await params.targetManager.saveChapter(targetNovelId, {
      ...chapter,
      novelId: targetNovelId,
    });
  }

  await params.targetManager.syncNovelMetadataByChapters(targetNovelId);
  return {
    targetNovelId,
    chapterCount: sourceChaptersSummary.length,
  };
}
