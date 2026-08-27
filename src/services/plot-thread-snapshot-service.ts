import { v4 as uuidv4 } from 'uuid';
import type { NovelManager } from '../novel/novel-manager.js';
import type { PlotThread, PlotThreadSnapshot } from '../novel/types.js';

function snapshotDetail(params: {
  summary?: string;
  keyEvents?: string[];
  threadName: string;
}): string {
  const detail = params.keyEvents?.filter(Boolean).join('；')
    || params.summary?.trim()
    || `${params.threadName}在本章继续推进`;
  return detail.slice(0, 320);
}

export async function ensureChapterPlotThreadSnapshots(params: {
  novelManager: NovelManager;
  novelId: string;
  chapterNumber: number;
}): Promise<PlotThreadSnapshot[]> {
  const { novelManager, novelId, chapterNumber } = params;
  const outline = await novelManager.getOutline(novelId);
  if (!outline) return [];

  let outlineChanged = false;
  let threads = outline.plotThreads;
  if (threads.length === 0) {
    const [novel, characters] = await Promise.all([
      novelManager.getNovel(novelId),
      novelManager.getCharacters(novelId),
    ]);
    const mainThread: PlotThread = {
      id: uuidv4(),
      name: `${novel?.title?.trim() || '小说'}主线`,
      description: novel?.synopsis?.trim() || '持续推进核心目标、冲突与角色选择',
      status: 'developing',
      plantedInChapter: 1,
      relatedCharacters: characters.slice(0, 3).map(character => character.id),
      notes: '由章节生成流程自动建立，可由用户随时调整',
      prerequisites: [],
      parallelThreads: [],
    };
    outline.plotThreads = [mainThread];
    threads = outline.plotThreads;
    outlineChanged = true;
  }

  const chapterOutline = outline.chapters.find(chapter => chapter.chapterNumber === chapterNumber);
  const threadById = new Map(threads.map(thread => [thread.id, thread]));
  let advancedThreadIds = (chapterOutline?.plotThreadsAdvanced ?? [])
    .filter(threadId => threadById.has(threadId));
  if (advancedThreadIds.length === 0) {
    const activeThread = threads.find(thread => !['resolved', 'abandoned'].includes(thread.status))
      ?? threads[0];
    if (activeThread) {
      advancedThreadIds = [activeThread.id];
      if (chapterOutline) {
        chapterOutline.plotThreadsAdvanced = advancedThreadIds;
        outlineChanged = true;
      }
    }
  }

  if (outlineChanged) {
    await novelManager.saveOutline(novelId, outline);
  }

  const existingSnapshots = await novelManager.getPlotThreadSnapshots(novelId);
  const snapshots = advancedThreadIds.flatMap((threadId): PlotThreadSnapshot[] => {
    const thread = threadById.get(threadId);
    if (!thread) return [];
    const hasEarlierSnapshot = existingSnapshots.some(snapshot => (
      snapshot.threadId === threadId && snapshot.chapterNumber < chapterNumber
    ));
    const resolved = thread.status === 'resolved'
      && (thread.resolvedInChapter ?? chapterNumber) <= chapterNumber;
    return [{
      threadId,
      threadName: thread.name,
      chapterNumber,
      status: resolved ? 'resolved' : hasEarlierSnapshot ? 'advanced' : 'new',
      detail: snapshotDetail({
        summary: chapterOutline?.summary,
        keyEvents: chapterOutline?.keyEvents,
        threadName: thread.name,
      }),
      dormantChapters: 0,
    }];
  });
  if (snapshots.length > 0) {
    await novelManager.savePlotThreadSnapshots(novelId, snapshots);
  }
  return snapshots;
}
