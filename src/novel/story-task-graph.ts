import type { ChapterSummary } from './chapter-repository.js';
import type { CharacterProfile, ChapterOutline, OutlineData, PlotThread } from './types.js';

export type StoryTaskStatus = 'planned' | 'active' | 'critical' | 'blocked' | 'completed' | 'abandoned';
export type StoryTaskKind = 'arc' | 'chapter';
export type StoryTaskEdgeType = 'requires' | 'parallel' | 'converges' | 'advances' | 'assigned';

export interface StoryTaskNode {
  id: string;
  kind: StoryTaskKind;
  title: string;
  objective: string;
  status: StoryTaskStatus;
  progress: number;
  chapterNumber?: number;
  characterIds: string[];
  evidenceChapters: number[];
  blockerTaskIds: string[];
}

export interface StoryTaskCharacterNode {
  id: string;
  name: string;
  role: CharacterProfile['role'];
  portraitImagePath?: string;
}

export interface StoryTaskEdge {
  id: string;
  type: StoryTaskEdgeType;
  sourceId: string;
  targetId: string;
  label: string;
}

export interface StoryTaskGraph {
  tasks: StoryTaskNode[];
  characters: StoryTaskCharacterNode[];
  edges: StoryTaskEdge[];
  summary: {
    totalTasks: number;
    activeTasks: number;
    blockedTasks: number;
    completedTasks: number;
    participantCount: number;
  };
}

const ARC_TASK_PREFIX = 'task:arc:';
const CHAPTER_TASK_PREFIX = 'task:chapter:';
const CHARACTER_NODE_PREFIX = 'character:';
const MAX_CHAPTER_TASKS = 16;

const EDGE_LABELS: Record<StoryTaskEdgeType, string> = {
  requires: '前置',
  parallel: '并行',
  converges: '合流',
  advances: '推进',
  assigned: '参与',
};

function arcTaskId(threadId: string): string {
  return `${ARC_TASK_PREFIX}${threadId}`;
}

function chapterTaskId(chapterNumber: number): string {
  return `${CHAPTER_TASK_PREFIX}${chapterNumber}`;
}

function characterNodeId(characterId: string): string {
  return `${CHARACTER_NODE_PREFIX}${characterId}`;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string'
    ? value
      .replace(/[#*_`>]+/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
    : '';
}

function buildCharacterMatcher(characters: CharacterProfile[]) {
  const byId = new Map(characters.map(character => [character.id, character]));
  return (texts: string[], explicitIds: string[] = []): string[] => {
    const ids = new Set(explicitIds.filter(id => byId.has(id)));
    const corpus = texts.map(normalizeText).join('\n').toLocaleLowerCase();
    for (const character of characters) {
      const names = [character.name, ...character.aliases]
        .map(name => name.trim().toLocaleLowerCase())
        .filter(name => name.length >= 2);
      if (names.some(name => corpus.includes(name))) ids.add(character.id);
    }
    return [...ids];
  };
}

function arcStatus(thread: PlotThread, threadById: Map<string, PlotThread>): StoryTaskStatus {
  if (thread.status === 'resolved') return 'completed';
  if (thread.status === 'abandoned') return 'abandoned';
  const blocked = (thread.prerequisites ?? []).some((id) => {
    const prerequisite = threadById.get(id);
    return prerequisite && prerequisite.status !== 'resolved' && prerequisite.status !== 'abandoned';
  });
  if (blocked) return 'blocked';
  if (thread.status === 'climax') return 'critical';
  if (thread.status === 'developing') return 'active';
  return 'planned';
}

function arcProgress(status: PlotThread['status']): number {
  switch (status) {
    case 'resolved': return 100;
    case 'climax': return 80;
    case 'developing': return 50;
    case 'planted': return 15;
    case 'abandoned': return 0;
  }
}

function chapterText(chapter: ChapterOutline): string[] {
  return [
    chapter.title,
    chapter.summary,
    ...chapter.keyEvents,
    ...chapter.beats.flatMap(beat => [beat.summary, beat.notes]),
  ];
}

function selectChapterTasks(outline: OutlineData, chapterSummaries: ChapterSummary[]): ChapterOutline[] {
  const latestWritten = Math.max(0, ...chapterSummaries
    .filter(chapter => chapter.status !== 'outlined')
    .map(chapter => chapter.chapterNumber));
  const advancing = outline.chapters.filter(chapter => chapter.plotThreadsAdvanced.length > 0);
  const nearCurrent = outline.chapters.filter(chapter => (
    chapter.chapterNumber >= Math.max(1, latestWritten - 3)
      && chapter.chapterNumber <= latestWritten + 6
  ));
  const selected = new Map<number, ChapterOutline>();
  for (const chapter of [...advancing, ...nearCurrent]) selected.set(chapter.chapterNumber, chapter);
  return [...selected.values()]
    .sort((left, right) => left.chapterNumber - right.chapterNumber)
    .slice(-MAX_CHAPTER_TASKS);
}

function chapterStatus(
  outline: ChapterOutline,
  summaryByChapter: Map<number, ChapterSummary>,
  latestWritten: number,
): StoryTaskStatus {
  const persisted = summaryByChapter.get(outline.chapterNumber);
  if (persisted?.status === 'finalized' || (persisted && outline.chapterNumber < latestWritten)) {
    return 'completed';
  }
  if (persisted && outline.chapterNumber === latestWritten) {
    return outline.tensionTarget >= 8 ? 'critical' : 'active';
  }
  return 'planned';
}

function taskObjective(chapter: ChapterOutline): string {
  return normalizeText(chapter.keyEvents.join('；'))
    || normalizeText(chapter.summary)
    || normalizeText(chapter.notes)
    || '推进本章核心剧情';
}

export function buildStoryTaskGraph(params: {
  outline: OutlineData;
  characters: CharacterProfile[];
  chapterSummaries: ChapterSummary[];
}): StoryTaskGraph {
  const { outline, characters, chapterSummaries } = params;
  const threadById = new Map(outline.plotThreads.map(thread => [thread.id, thread]));
  const summaryByChapter = new Map(chapterSummaries.map(chapter => [chapter.chapterNumber, chapter]));
  const latestWritten = Math.max(0, ...chapterSummaries
    .filter(chapter => chapter.status !== 'outlined')
    .map(chapter => chapter.chapterNumber));
  const matchCharacters = buildCharacterMatcher(characters);
  const tasks: StoryTaskNode[] = [];
  const edges: StoryTaskEdge[] = [];
  const edgeKeys = new Set<string>();

  const addEdge = (
    type: StoryTaskEdgeType,
    sourceId: string,
    targetId: string,
  ) => {
    if (sourceId === targetId) return;
    const endpoints = type === 'parallel'
      ? [sourceId, targetId].sort()
      : [sourceId, targetId];
    const key = `${type}:${endpoints.join(':')}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({
      id: key,
      type,
      sourceId: endpoints[0],
      targetId: endpoints[1],
      label: EDGE_LABELS[type],
    });
  };

  for (const thread of outline.plotThreads) {
    const evidenceChapters = outline.chapters
      .filter(chapter => chapter.plotThreadsAdvanced.includes(thread.id))
      .map(chapter => chapter.chapterNumber);
    const relevantChapters = outline.chapters.filter(chapter => evidenceChapters.includes(chapter.chapterNumber));
    const explicitCharacterIds = [
      ...thread.relatedCharacters,
      ...relevantChapters.flatMap(chapter => chapter.beats.flatMap(beat => beat.characters)),
    ];
    const characterIds = matchCharacters([
      thread.name,
      thread.description,
      thread.notes,
      ...relevantChapters.flatMap(chapterText),
    ], explicitCharacterIds);
    const blockerTaskIds = (thread.prerequisites ?? [])
      .filter(id => {
        const prerequisite = threadById.get(id);
        return prerequisite && prerequisite.status !== 'resolved' && prerequisite.status !== 'abandoned';
      })
      .map(arcTaskId);

    tasks.push({
      id: arcTaskId(thread.id),
      kind: 'arc',
      title: thread.name,
      objective: normalizeText(thread.description) || normalizeText(thread.notes) || '持续推进这条故事线',
      status: arcStatus(thread, threadById),
      progress: arcProgress(thread.status),
      characterIds,
      evidenceChapters,
      blockerTaskIds,
    });

    for (const prerequisiteId of thread.prerequisites ?? []) {
      if (threadById.has(prerequisiteId)) addEdge('requires', arcTaskId(prerequisiteId), arcTaskId(thread.id));
    }
    for (const parallelId of thread.parallelThreads ?? []) {
      if (threadById.has(parallelId)) addEdge('parallel', arcTaskId(thread.id), arcTaskId(parallelId));
    }
    if (thread.mergeTarget && threadById.has(thread.mergeTarget)) {
      addEdge('converges', arcTaskId(thread.id), arcTaskId(thread.mergeTarget));
    }
  }

  const selectedChapters = selectChapterTasks(outline, chapterSummaries);
  for (const chapter of selectedChapters) {
    const explicitCharacterIds = chapter.beats.flatMap(beat => beat.characters);
    const characterIds = matchCharacters(chapterText(chapter), explicitCharacterIds);
    const status = chapterStatus(chapter, summaryByChapter, latestWritten);
    tasks.push({
      id: chapterTaskId(chapter.chapterNumber),
      kind: 'chapter',
      title: normalizeText(chapter.title) || `第 ${chapter.chapterNumber} 章`,
      objective: taskObjective(chapter),
      status,
      progress: status === 'completed' ? 100 : status === 'planned' ? 0 : 55,
      chapterNumber: chapter.chapterNumber,
      characterIds,
      evidenceChapters: status === 'planned' ? [] : [chapter.chapterNumber],
      blockerTaskIds: [],
    });

    for (const threadId of chapter.plotThreadsAdvanced) {
      if (threadById.has(threadId)) addEdge('advances', chapterTaskId(chapter.chapterNumber), arcTaskId(threadId));
    }
    const advancedThreads = chapter.plotThreadsAdvanced.filter(id => threadById.has(id));
    for (let left = 0; left < advancedThreads.length; left++) {
      for (let right = left + 1; right < advancedThreads.length; right++) {
        addEdge('parallel', arcTaskId(advancedThreads[left]), arcTaskId(advancedThreads[right]));
      }
    }
  }

  for (let index = 1; index < selectedChapters.length; index++) {
    addEdge(
      'requires',
      chapterTaskId(selectedChapters[index - 1].chapterNumber),
      chapterTaskId(selectedChapters[index].chapterNumber),
    );
  }

  const participantIds = new Set<string>();
  for (const task of tasks) {
    for (const characterId of task.characterIds) {
      participantIds.add(characterId);
      addEdge('assigned', characterNodeId(characterId), task.id);
    }
  }
  const characterById = new Map(characters.map(character => [character.id, character]));
  const participantCharacters = [...participantIds]
    .map(id => characterById.get(id))
    .filter((character): character is CharacterProfile => Boolean(character))
    .map(character => ({
      id: character.id,
      name: character.name,
      role: character.role,
      portraitImagePath: character.portraitImagePath,
    }));

  return {
    tasks,
    characters: participantCharacters,
    edges,
    summary: {
      totalTasks: tasks.length,
      activeTasks: tasks.filter(task => task.status === 'active' || task.status === 'critical').length,
      blockedTasks: tasks.filter(task => task.status === 'blocked').length,
      completedTasks: tasks.filter(task => task.status === 'completed').length,
      participantCount: participantCharacters.length,
    },
  };
}
