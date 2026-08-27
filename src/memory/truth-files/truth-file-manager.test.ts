import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildTruthFileHealthReport, updateTruthFiles, loadTruthFiles } from './truth-file-manager.js';
import type { StoryStateSnapshot } from '../../novel/story-state-types.js';
import type { CharacterProfile, OutlineData } from '../../novel/types.js';

const novelId = '11111111-1111-4111-8111-111111111111';

function buildSnapshot(): StoryStateSnapshot {
  return {
    chapterNumber: 3,
    characters: [
      {
        characterId: 'c1',
        name: 'Alex',
        location: 'court',
        emotionalState: 'focused',
        inventory: ['knee brace'],
        revealedSecrets: ['trusts the coach'],
        hiddenSecrets: ['knee still hurts'],
        currentGoal: 'win a rotation spot',
        goalProgress: 60,
        relationshipChanges: [],
        physicalCondition: 'tired',
        powerChange: '',
        currentBelief: '',
        beliefShift: '',
        alive: true,
        present: true,
      },
    ],
    world: {
      timelineMarker: 'second quarter',
      environment: 'gym',
      factionChanges: [],
      geographyChanges: [],
      powerSystemChanges: [],
      socialChanges: ['bench rotation changed'],
    },
    factions: [],
    plot: {
      activeThreads: [],
      pendingForeshadowing: [],
      tensionLevel: 6,
      readerQuestions: ['will Alex keep the spot'],
    },
    causalChains: [],
    chapterSummary: 'Alex earns trust on defense.',
    nextChapterConstraints: ['keep the knee cost visible'],
    createdAt: new Date().toISOString(),
  };
}

function buildOutline(): OutlineData {
  return {
    chapters: [],
    foreshadowing: [
      {
        id: 'h1',
        hint: 'coach watches the weak side defense',
        plantedInChapter: 2,
        resolution: 'pay off in the rotation decision',
        isResolved: false,
        priority: 'medium',
        relatedPlotThreads: [],
      },
    ],
    plotThreads: [],
  };
}

function buildCharacters(): CharacterProfile[] {
  return [
    {
      id: 'c1',
      name: 'Alex',
      aliases: [],
      role: 'protagonist',
      position: '',
      appearance: '',
      personality: '',
      personalityTraits: [],
      speechStyle: '',
      speechExamples: [],
      backstory: '',
      motivation: '',
      abilities: [],
      relationships: [],
      arc: '',
      currentState: '',
      voiceDesignStatus: 'none',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

describe('truth-file-manager', () => {
  it('writes and reads truth files when given a data root', async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'truth-files-data-root-'));
    await fs.mkdir(path.join(dataRoot, 'novels', novelId), { recursive: true });
    await fs.writeFile(path.join(dataRoot, 'novels', novelId, 'novel.json'), '{}', 'utf-8');

    await updateTruthFiles({
      novelId,
      novelsDir: dataRoot,
      chapterNumber: 3,
      snapshot: buildSnapshot(),
      characters: buildCharacters(),
      outline: buildOutline(),
    });

    const truthDir = path.join(dataRoot, 'novels', novelId, 'truth-files');
    await expect(fs.access(path.join(truthDir, 'current-state.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(truthDir, 'pending-hooks.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(truthDir, 'character-matrix.json'))).resolves.toBeUndefined();

    const loaded = await loadTruthFiles(novelId, dataRoot);
    expect(loaded.currentState?.chapterNumber).toBe(3);
    expect(loaded.pendingHooks?.currentChapter).toBe(3);
    expect(loaded.characterMatrix).not.toBeNull();
  });

  it('also accepts a novels directory root', async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'truth-files-novels-root-'));
    const novelsRoot = path.join(dataRoot, 'novels');
    await fs.mkdir(path.join(novelsRoot, novelId), { recursive: true });
    await fs.writeFile(path.join(novelsRoot, novelId, 'novel.json'), '{}', 'utf-8');

    await updateTruthFiles({
      novelId,
      novelsDir: novelsRoot,
      chapterNumber: 3,
      snapshot: buildSnapshot(),
      characters: buildCharacters(),
      outline: buildOutline(),
    });

    const loaded = await loadTruthFiles(novelId, novelsRoot);
    expect(loaded.currentState?.chapterNumber).toBe(3);
  });

  it('does not overwrite truth files with a stale snapshot', async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'truth-files-stale-'));
    await fs.mkdir(path.join(dataRoot, 'novels', novelId), { recursive: true });
    await fs.writeFile(path.join(dataRoot, 'novels', novelId, 'novel.json'), '{}', 'utf-8');

    await updateTruthFiles({
      novelId,
      novelsDir: dataRoot,
      chapterNumber: 3,
      snapshot: buildSnapshot(),
      characters: buildCharacters(),
      outline: buildOutline(),
    });

    const stale = {
      ...buildSnapshot(),
      chapterNumber: 2,
    };
    await updateTruthFiles({
      novelId,
      novelsDir: dataRoot,
      chapterNumber: 4,
      snapshot: stale,
      characters: buildCharacters(),
      outline: buildOutline(),
    });

    const loaded = await loadTruthFiles(novelId, dataRoot);
    expect(loaded.currentState?.chapterNumber).toBe(3);
    expect(loaded.pendingHooks?.currentChapter).toBe(3);
  });

  it('reports truth file readback health', () => {
    const aligned = buildTruthFileHealthReport({
      currentState: {
        chapterNumber: 3,
        characters: [],
        world: {
          timelineMarker: '',
          environment: '',
          recentChanges: [],
        },
        factions: [],
        tensionLevel: 6,
        readerQuestions: [],
        nextChapterConstraints: [],
        generatedAt: new Date().toISOString(),
      },
      pendingHooks: {
        currentChapter: 3,
        hooks: [],
        stats: {
          total: 0,
          critical: 0,
          warning: 0,
          normal: 0,
        },
        generatedAt: new Date().toISOString(),
      },
      characterMatrix: {
        revealedSecrets: [],
        hiddenSecrets: [],
        infoEdges: [],
        generatedAt: new Date().toISOString(),
      },
    }, 3, '2026-01-01T00:00:00.000Z');

    expect(aligned.aligned).toBe(true);
    expect(aligned.warnings).toEqual([]);

    const mismatched = buildTruthFileHealthReport({
      currentState: {
        ...aligned,
        chapterNumber: 2,
        characters: [],
        world: {
          timelineMarker: '',
          environment: '',
          recentChanges: [],
        },
        factions: [],
        tensionLevel: 6,
        readerQuestions: [],
        nextChapterConstraints: [],
        generatedAt: new Date().toISOString(),
      },
      pendingHooks: null,
      characterMatrix: null,
    }, 3, '2026-01-01T00:00:00.000Z');

    expect(mismatched.aligned).toBe(false);
    expect(mismatched.warnings).toContain('current-state chapter mismatch: expected 3, got 2');
    expect(mismatched.warnings).toContain('pending-hooks missing');
    expect(mismatched.warnings).toContain('character-matrix missing');
  });
});
