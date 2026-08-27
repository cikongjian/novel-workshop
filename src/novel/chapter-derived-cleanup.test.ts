import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NovelPaths } from './novel-paths.js';
import { cleanupDeletedChapterArtifacts } from './chapter-derived-cleanup.js';
import { writeJson } from './fs-helpers.js';

const tempDirs: string[] = [];

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
}

describe('cleanupDeletedChapterArtifacts', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
  });

  it('removes chapter-scoped derived artifacts and invalidates truth files', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-cleanup-'));
    tempDirs.push(dataDir);
    const paths = new NovelPaths(dataDir);
    const novelId = '00000000-0000-0000-0000-000000000001';
    const novelDir = paths.novelDir(novelId);

    await fs.mkdir(paths.chapterFactsDir(novelId), { recursive: true });
    await fs.mkdir(paths.characterEventsDir(novelId), { recursive: true });
    await fs.mkdir(path.join(novelDir, 'truth-files'), { recursive: true });

    await writeJson(paths.pacingPath(novelId), [
      { chapterNumber: 1, tensionCurve: [], sceneRhythm: 'fast', payoffMoments: 1, cliffhangerStrength: 1 },
      { chapterNumber: 2, tensionCurve: [], sceneRhythm: 'slow', payoffMoments: 0, cliffhangerStrength: 0 },
    ]);
    await writeJson(paths.plotThreadSnapshotsPath(novelId), [
      { threadId: 't1', threadName: '主线', chapterNumber: 1, status: 'active', detail: '', dormantChapters: 0 },
      { threadId: 't1', threadName: '主线', chapterNumber: 2, status: 'active', detail: 'bad', dormantChapters: 0 },
    ]);
    await writeJson(paths.outlineDeviationsPath(novelId), [
      { chapterNumber: 1, score: 0.1, summary: 'ok', findings: [] },
      { chapterNumber: 2, score: 0.9, summary: 'drift', findings: [] },
    ]);
    await writeJson(paths.collaborationLogPath(novelId), {
      1: [{ agentRole: 'writer', summary: 'ok', timestamp: new Date().toISOString() }],
      2: [{ agentRole: 'writer', summary: 'bad', timestamp: new Date().toISOString() }],
    });
    await writeJson(paths.characterStatesPath(novelId), [
      {
        characterId: 'hero',
        chapterNumber: 1,
        emotionState: { primary: 'calm', intensity: 3 },
        goalProgress: 10,
        stress: 2,
        trustChanges: [],
        evidence: [],
        isCritical: false,
      },
      {
        characterId: 'hero',
        chapterNumber: 2,
        emotionState: { primary: 'panic', intensity: 8 },
        goalProgress: 20,
        stress: 9,
        trustChanges: [],
        evidence: [],
        isCritical: true,
      },
    ]);
    await writeJson(paths.pendingCharactersPath(novelId), [
      { name: '路人甲', firstDetectedIn: 2, lastDetectedIn: 2, status: 'pending' },
      { name: '老角色', firstDetectedIn: 1, lastDetectedIn: 2, status: 'pending' },
    ]);
    await writeJson(paths.factGraphPath(novelId), {
      novelId,
      lastUpdatedChapter: 2,
      characterAppearances: [
        { characterName: '主角', chapterNumber: 1, location: '', action: '', mentionType: 'reference', confidence: 1, evidence: '', sentenceIndex: 0 },
        { characterName: '主角', chapterNumber: 2, location: '', action: '', mentionType: 'reference', confidence: 1, evidence: '', sentenceIndex: 0 },
      ],
      itemTimeline: [],
      locationVisits: [],
      timelineEvents: [],
      relationshipChanges: [],
      characterStateChanges: [],
      factEvents: [
        {
          id: '00000000-0000-0000-0000-000000000111',
          chapterNumber: 2,
          sentenceIndex: 0,
          eventType: 'character-mention',
          entityType: 'character',
          entityName: '主角',
          detail: '',
          evidence: '',
          confidence: 1,
          relatedCharacterNames: [],
          timeMarker: '',
          isFlashback: false,
          location: '',
        },
      ],
      updatedAt: new Date().toISOString(),
    });

    await writeJson(paths.chapterFactFilePath(novelId, 2), { summary: 'bad fact' });
    await writeJson(paths.characterEventsFilePath(novelId, 2), [
      { characterId: 'hero', chapterNumber: 2, summary: 'bad event', type: 'emotion', detail: '' },
    ]);
    await writeJson(path.join(novelDir, 'truth-files', 'current-state.json'), { chapterNumber: 2 });

    await cleanupDeletedChapterArtifacts(paths, novelId, 2);

    await expect(fs.access(paths.chapterFactFilePath(novelId, 2))).rejects.toThrow();
    await expect(fs.access(paths.characterEventsFilePath(novelId, 2))).rejects.toThrow();
    await expect(fs.access(path.join(novelDir, 'truth-files'))).rejects.toThrow();

    const pacing = await readJsonFile<Array<{ chapterNumber: number }>>(paths.pacingPath(novelId));
    expect(pacing.map(item => item.chapterNumber)).toEqual([1]);

    const plotSnapshots = await readJsonFile<Array<{ chapterNumber: number }>>(paths.plotThreadSnapshotsPath(novelId));
    expect(plotSnapshots.map(item => item.chapterNumber)).toEqual([1]);

    const deviations = await readJsonFile<Array<{ chapterNumber: number }>>(paths.outlineDeviationsPath(novelId));
    expect(deviations.map(item => item.chapterNumber)).toEqual([1]);

    const logs = await readJsonFile<Record<string, unknown>>(paths.collaborationLogPath(novelId));
    expect(Object.keys(logs)).toEqual(['1']);

    const states = await readJsonFile<Array<{ chapterNumber: number }>>(paths.characterStatesPath(novelId));
    expect(states.map(item => item.chapterNumber)).toEqual([1]);

    const pending = await readJsonFile<Array<{ name: string; firstDetectedIn: number; lastDetectedIn: number; status: string }>>(paths.pendingCharactersPath(novelId));
    expect(pending).toEqual([{ name: '老角色', firstDetectedIn: 1, lastDetectedIn: 1, status: 'pending' }]);

    const factGraph = await readJsonFile<{ characterAppearances: Array<{ chapterNumber: number }>; factEvents: Array<{ chapterNumber: number }>; lastUpdatedChapter: number }>(paths.factGraphPath(novelId));
    expect(factGraph.characterAppearances.map(item => item.chapterNumber)).toEqual([1]);
    expect(factGraph.factEvents).toEqual([]);
    expect(factGraph.lastUpdatedChapter).toBe(1);
  });
});
