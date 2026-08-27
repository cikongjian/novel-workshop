import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NovelManager } from './novel-manager.js';
import { NovelPaths } from './novel-paths.js';
import { readJson, writeJson } from './fs-helpers.js';
import { auditNovelData } from './novel-data-audit.js';
import { organizeNovelData } from './novel-data-organizer.js';
import { NovelOrganizationPlanConflictError } from './novel-data-organizer.js';
import { CharacterProfile, type Chapter } from './types.js';

const temporaryRoots: string[] = [];
const TIMESTAMP = '2026-07-12T00:00:00.000Z';

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'novel-data-organizer-'));
  temporaryRoots.push(root);
  const manager = new NovelManager(path.join(root, 'novels'));
  const novel = await manager.createNovel({ title: '维护测试小说', genre: 'modern' });
  const paths = new NovelPaths(manager.getDataDir());
  const character = CharacterProfile.parse({
    id: '11111111-1111-4111-8111-111111111111',
    name: '林澄',
    aliases: ['阿澄', '阿澄'],
    role: 'protagonist',
    position: '调查记者',
    appearance: '',
    personality: '',
    personalityTraits: ['克制', '克制'],
    speechStyle: '',
    speechExamples: [],
    backstory: '[第1章] 发现线索\n[第1章] 确认线索',
    motivation: '',
    abilities: [],
    relationships: [],
    arc: '',
    currentState: '',
    growthTrack: {
      milestones: [
        { chapter: 1, event: '第一次选择', insight: '' },
        { chapter: 1, event: '最终选择', insight: '承担后果' },
      ],
      archivedMilestonesSummary: '旧线索；旧线索',
      unresolvedTrauma: [],
      pendingPromises: [],
    },
    tags: [],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
  await writeJson(paths.charactersPath(novel.id), [character]);

  const chapter: Chapter = {
    novelId: novel.id,
    chapterNumber: 1,
    title: '第一章',
    content: '林澄推开档案室的门，确认失踪案背后还有另一条线索。',
    wordCount: 0,
    status: 'finalized',
    agentComments: [],
    revisionCount: 0,
    summary: '林澄确认新的调查方向。',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
  await manager.saveChapter(novel.id, chapter);
  return { manager, novel, paths };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('novel data audit and organization', () => {
  it('reports repairable character, outline, task and metadata gaps', async () => {
    const { manager, novel } = await createFixture();
    const report = await auditNovelData(manager, novel.id);

    expect(report.summary.characterCount).toBe(1);
    expect(report.summary.taskCount).toBe(0);
    expect(report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'identity_labels_not_persisted',
      'duplicate_growth_milestones',
      'duplicate_character_history',
      'outline_empty',
      'task_graph_empty',
      'novel_metadata_out_of_sync',
    ]));
  });

  it('keeps dry-run read-only and applies changes only after creating a backup', async () => {
    const { manager, novel, paths } = await createFixture();
    const before = await fs.readFile(paths.charactersPath(novel.id), 'utf8');
    const dryRun = await organizeNovelData({ novelManager: manager, novelId: novel.id });
    expect(dryRun.mode).toBe('dry-run');
    expect(await fs.readFile(paths.charactersPath(novel.id), 'utf8')).toBe(before);

    const createBackup = vi.fn(async () => ({
      id: 'backup-1',
      novelId: novel.id,
      filename: 'backup-1.tar.gz',
      size: 128,
      createdAt: TIMESTAMP,
    }));
    const applied = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      apply: true,
      expectedPlanToken: dryRun.planToken,
      backupManager: { createBackup },
    });

    expect(applied.mode).toBe('apply');
    expect(createBackup).toHaveBeenCalledWith(novel.id);
    expect(applied.reportAfter?.summary.taskCount).toBeGreaterThanOrEqual(1);
    const stored = await readJson<unknown[]>(paths.charactersPath(novel.id), []);
    const normalized = CharacterProfile.parse(stored[0]);
    expect(normalized.identityLabels?.some(label => label.label === '主角')).toBe(true);
    expect(normalized.aliases).toEqual(['阿澄']);
    expect(normalized.growthTrack?.milestones).toEqual([
      { chapter: 1, event: '最终选择', insight: '承担后果' },
    ]);
    expect(normalized.backstory.match(/\[第1章\]/gu)).toHaveLength(1);
    expect((await manager.getNovel(novel.id)).chapterCount).toBe(1);
  });

  it('does not rewrite the character file when any profile is invalid', async () => {
    const { manager, novel, paths } = await createFixture();
    const raw = await readJson<unknown[]>(paths.charactersPath(novel.id), []);
    raw.push({ id: 'broken', name: '' });
    await writeJson(paths.charactersPath(novel.id), raw);
    const before = await fs.readFile(paths.charactersPath(novel.id), 'utf8');

    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
    });
    const result = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: {
        createBackup: vi.fn(async () => ({
          id: 'unused', novelId: novel.id, filename: 'unused', size: 1, createdAt: TIMESTAMP,
        })),
      },
    });

    expect(result.mode).toBe('dry-run');
    expect(result.changes[0].changed).toBe(false);
    expect(await fs.readFile(paths.charactersPath(novel.id), 'utf8')).toBe(before);
  });

  it('promotes recurring pending characters through the backed-up characters scope', async () => {
    const { manager, novel } = await createFixture();
    await manager.upsertPendingCharacterCandidates(novel.id, 1, ['周耀声']);
    await manager.upsertPendingCharacterCandidates(novel.id, 3, ['周耀声']);
    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
    });
    expect(preview.changes[0]).toEqual(expect.objectContaining({
      changed: true,
      message: expect.stringContaining('自动建档 1 名跨章常驻配角'),
    }));

    const createBackup = vi.fn(async () => ({
      id: 'backup-characters',
      novelId: novel.id,
      filename: 'backup-characters.tar.gz',
      size: 128,
      createdAt: TIMESTAMP,
    }));
    await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: { createBackup },
    });

    expect(createBackup).toHaveBeenCalledWith(novel.id);
    expect((await manager.getCharacters(novel.id)).map(character => character.name)).toContain('周耀声');
    const secondPreview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
    });
    expect(secondPreview.changes[0]).toMatchObject({ changed: false, affectedEntries: 0 });
  }, 15_000);

  it('reconciles a clearly dominant auto-managed protagonist through the characters scope', async () => {
    const { manager, novel } = await createFixture();
    const [current] = await manager.getCharacters(novel.id);
    current.tags = ['auto-extracted', 'auto-core'];
    await manager.saveCharacter(novel.id, current);
    await manager.saveCharacter(novel.id, CharacterProfile.parse({
      ...current,
      id: '22222222-2222-4222-8222-222222222222',
      name: '林念',
      role: 'supporting',
      tags: ['auto-extracted', 'auto-recurring'],
      identityLabels: undefined,
    }));
    const firstChapter = await manager.getChapter(novel.id, 1);
    if (!firstChapter) throw new Error('fixture chapter is missing');
    for (let chapterNumber = 1; chapterNumber <= 3; chapterNumber += 1) {
      await manager.saveChapter(novel.id, {
        ...firstChapter,
        chapterNumber,
        content: '林念推进交付，林念公开表态，林念承担责任。林澄提出反对。',
      });
    }

    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
    });
    expect(preview.changes[0]?.message).toContain('将主角身份由“林澄”校正为“林念”');
    const indexCharacter = vi.fn().mockResolvedValue(undefined);
    await organizeNovelData({
      novelManager: manager,
      novelMemory: { indexCharacter } as never,
      novelId: novel.id,
      scopes: ['characters'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: {
        createBackup: vi.fn(async () => ({
          id: 'backup-role',
          novelId: novel.id,
          filename: 'backup-role.tar.gz',
          size: 128,
          createdAt: TIMESTAMP,
        })),
      },
    });

    const roles = Object.fromEntries(
      (await manager.getCharacters(novel.id)).map(character => [character.name, character.role]),
    );
    expect(roles).toMatchObject({ 林澄: 'supporting', 林念: 'protagonist' });
    expect(indexCharacter).toHaveBeenCalledTimes(2);
    const secondPreview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
    });
    expect(secondPreview.changes[0]).toMatchObject({ changed: false, affectedEntries: 0 });
  });

  it('backfills confirmed character deaths and removes unsupported auto-core roles', async () => {
    const { manager, novel } = await createFixture();
    const [template] = await manager.getCharacters(novel.id);
    await manager.saveCharacter(novel.id, CharacterProfile.parse({
      ...template,
      id: '33333333-3333-4333-8333-333333333333',
      name: '王厉',
      role: 'deuteragonist',
      status: undefined,
      tags: ['auto-extracted', 'auto-core'],
      identityLabels: undefined,
    }));
    const firstChapter = await manager.getChapter(novel.id, 1);
    if (!firstChapter) throw new Error('fixture chapter is missing');
    await manager.saveChapter(novel.id, {
      ...firstChapter,
      content: '王厉身体往后倒，抽搐两下便不动了。围观者喊道：“王厉死了！”',
    });

    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
    });
    expect(preview.changes[0]?.message).toContain('回填 1 名角色的死亡状态与身份');

    await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: {
        createBackup: vi.fn(async () => ({
          id: 'backup-character-status',
          novelId: novel.id,
          filename: 'backup-character-status.tar.gz',
          size: 128,
          createdAt: TIMESTAMP,
        })),
      },
    });

    const updated = (await manager.getCharacters(novel.id)).find(character => character.name === '王厉');
    expect(updated).toMatchObject({ role: 'minor', status: 'dead' });
    expect(updated?.identityLabels?.map(label => label.label)).toEqual(expect.arrayContaining(['次要角色', '已死亡']));

    const secondPreview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
    });
    expect(secondPreview.changes[0]).toMatchObject({ changed: false, affectedEntries: 0 });
  });

  it('rejects a stale plan before backup or write', async () => {
    const { manager, novel, paths } = await createFixture();
    const preview = await organizeNovelData({ novelManager: manager, novelId: novel.id });
    const raw = await readJson<unknown[]>(paths.charactersPath(novel.id), []);
    const first = raw[0] as Record<string, unknown>;
    first.tags = ['changed-after-preview'];
    await writeJson(paths.charactersPath(novel.id), raw);
    const createBackup = vi.fn();

    await expect(organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: { createBackup },
    })).rejects.toBeInstanceOf(NovelOrganizationPlanConflictError);
    expect(createBackup).not.toHaveBeenCalled();
  });

  it('rejects an outline plan when chapter evidence changes after preview', async () => {
    const { manager, novel } = await createFixture();
    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['outline'],
    });
    const chapter = await manager.getChapter(novel.id, 1);
    if (!chapter) throw new Error('chapter fixture missing');
    await manager.saveChapter(novel.id, {
      ...chapter,
      summary: '预览后更新的章节摘要。',
      updatedAt: '2026-07-12T00:01:00.000Z',
    });
    const createBackup = vi.fn();

    await expect(organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['outline'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: { createBackup },
    })).rejects.toBeInstanceOf(NovelOrganizationPlanConflictError);
    expect(createBackup).not.toHaveBeenCalled();
  });

  it('repairs a structurally corrupt outline after creating a backup', async () => {
    const { manager, novel, paths } = await createFixture();
    await writeJson(paths.outlinePath(novel.id), { chapters: 'invalid' });
    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['outline'],
    });
    expect(preview.reportBefore.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'outline_corrupt', repairable: true }),
    ]));
    const createBackup = vi.fn(async () => ({
      id: 'backup-outline',
      novelId: novel.id,
      filename: 'backup-outline.tar.gz',
      size: 128,
      createdAt: TIMESTAMP,
    }));

    const result = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['outline'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: { createBackup },
    });

    expect(createBackup).toHaveBeenCalledOnce();
    expect(result.reportAfter?.issues.map(issue => issue.code)).not.toContain('outline_corrupt');
    expect((await manager.getOutline(novel.id)).chapters).toHaveLength(1);
  });

  it('backfills plot threads and per-chapter snapshots behind the guarded apply flow', async () => {
    const { manager, novel } = await createFixture();
    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['threads'],
    });
    expect(preview.changes).toEqual([
      expect.objectContaining({ scope: 'threads', changed: true, affectedEntries: 1 }),
    ]);

    const createBackup = vi.fn(async () => ({
      id: 'backup-threads',
      novelId: novel.id,
      filename: 'backup-threads.tar.gz',
      size: 128,
      createdAt: TIMESTAMP,
    }));
    const result = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['threads'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: { createBackup },
    });

    expect(result.mode).toBe('apply');
    expect(createBackup).toHaveBeenCalledOnce();
    expect((await manager.getOutline(novel.id)).plotThreads).toHaveLength(1);
    expect(await manager.getPlotThreadSnapshots(novel.id)).toEqual([
      expect.objectContaining({ chapterNumber: 1, status: 'new' }),
    ]);
  });

  it('finalizes only reviewed complete final-phase chapters without corrupt directions', async () => {
    const { manager, novel } = await createFixture();
    const base = await manager.getChapter(novel.id, 1);
    if (!base) throw new Error('chapter fixture missing');
    const chapters: Chapter[] = [
      {
        ...base,
        status: 'reviewed',
        diagnostics: {
          generationLifecycle: {
            mode: 'observe', phase: 'final', chapterStatus: 'reviewed', warnings: [], updatedAt: TIMESTAMP,
          },
          updatedAt: TIMESTAMP,
        },
      },
      {
        ...base,
        chapterNumber: 2,
        status: 'reviewed',
        diagnostics: {
          generationLifecycle: {
            mode: 'observe', phase: 'draft', chapterStatus: 'reviewed', warnings: [], updatedAt: TIMESTAMP,
          },
          updatedAt: TIMESTAMP,
        },
      },
      {
        ...base,
        chapterNumber: 3,
        status: 'reviewed',
        diagnostics: {
          generationLifecycle: {
            mode: 'observe', phase: 'final', chapterStatus: 'reviewed', warnings: [], updatedAt: TIMESTAMP,
          },
          userDirectionAnchorAudit: {
            mode: 'observe',
            anchors: [],
            presentAnchors: [],
            missingAnchors: [],
            coverage: 1,
            shouldRepair: false,
            warnings: ['user direction appears mojibake or question-mark corrupted'],
            checkedAt: TIMESTAMP,
          },
          updatedAt: TIMESTAMP,
        },
      },
    ];
    await Promise.all(chapters.map(chapter => manager.saveChapter(novel.id, chapter)));

    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['finalization'],
    });
    expect(preview.changes[0]).toMatchObject({ changed: true, affectedEntries: 1 });
    const result = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['finalization'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: {
        createBackup: vi.fn(async () => ({
          id: 'backup-finalization',
          novelId: novel.id,
          filename: 'backup-finalization.tar.gz',
          size: 128,
          createdAt: TIMESTAMP,
        })),
      },
    });

    expect(result.mode).toBe('apply');
    expect((await manager.getChapter(novel.id, 1))?.status).toBe('finalized');
    expect((await manager.getChapter(novel.id, 2))?.status).toBe('reviewed');
    expect((await manager.getChapter(novel.id, 3))?.status).toBe('reviewed');
    expect((await manager.getNovel(novel.id)).finalizedChapterCount).toBe(1);
  });

  it('invalidates a finalization plan when lifecycle evidence changes', async () => {
    const { manager, novel } = await createFixture();
    const chapter = await manager.getChapter(novel.id, 1);
    if (!chapter) throw new Error('chapter fixture missing');
    chapter.status = 'reviewed';
    chapter.diagnostics = {
      generationLifecycle: {
        mode: 'observe', phase: 'final', chapterStatus: 'reviewed', warnings: [], updatedAt: TIMESTAMP,
      },
      updatedAt: TIMESTAMP,
    };
    await manager.saveChapter(novel.id, chapter);
    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['finalization'],
    });
    chapter.diagnostics.generationLifecycle!.phase = 'failed';
    await manager.saveChapter(novel.id, chapter);
    const createBackup = vi.fn();

    await expect(organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['finalization'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: { createBackup },
    })).rejects.toBeInstanceOf(NovelOrganizationPlanConflictError);
    expect(createBackup).not.toHaveBeenCalled();
  });

  it('repairs 9/10 fact graph coverage, creates a backup and is idempotent', async () => {
    const { manager, novel } = await createFixture();
    const firstChapter = await manager.getChapter(novel.id, 1);
    if (!firstChapter) throw new Error('fixture chapter is missing');
    for (let chapterNumber = 2; chapterNumber <= 10; chapterNumber += 1) {
      await manager.saveChapter(novel.id, {
        ...firstChapter,
        chapterNumber,
        title: `第${chapterNumber}章`,
        content: `林澄推进第${chapterNumber}章调查，并确认新的线索。`,
        summary: `林澄推进第${chapterNumber}章调查。`,
      });
    }
    const graph = await manager.getFactGraph(novel.id);
    graph.characterAppearances = Array.from({ length: 9 }, (_, index) => ({
      characterName: '林澄',
      chapterNumber: index + 1,
      location: '',
      action: '调查',
      mentionType: 'onstage' as const,
      confidence: 1,
      evidence: '林澄推进调查。',
      sentenceIndex: 0,
    }));
    await manager.saveFactGraph(novel.id, graph);
    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['facts'],
    });
    expect(preview.changes).toEqual([
      expect.objectContaining({ scope: 'facts', changed: true, affectedEntries: 1 }),
    ]);
    expect(preview.changes[0]?.message).toContain('1 章');

    const result = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['facts'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: {
        createBackup: vi.fn(async () => ({
          id: 'backup-facts',
          novelId: novel.id,
          filename: 'backup-facts.tar.gz',
          size: 128,
          createdAt: TIMESTAMP,
        })),
      },
    });

    expect(result.mode).toBe('apply');
    expect(result.backup?.id).toBe('backup-facts');
    const repairedGraph = await manager.getFactGraph(novel.id);
    expect(new Set(repairedGraph.characterAppearances.map(entry => entry.chapterNumber)).size).toBe(10);
    expect(Object.keys(await manager.getChapterFacts(novel.id))).toEqual(['10']);
    const secondPreview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['facts'],
    });
    expect(secondPreview.changes[0]).toMatchObject({ changed: false, affectedEntries: 0 });
  }, 15_000);

  it('rejects a stale fact graph repair plan before backup or write', async () => {
    const { manager, novel } = await createFixture();
    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['facts'],
    });
    const graph = await manager.getFactGraph(novel.id);
    graph.characterAppearances.push({
      characterName: '林澄',
      chapterNumber: 1,
      location: '',
      action: '调查',
      mentionType: 'onstage',
      confidence: 1,
      evidence: '林澄确认线索。',
      sentenceIndex: 0,
    });
    await manager.saveFactGraph(novel.id, graph);
    const createBackup = vi.fn();

    await expect(organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['facts'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: { createBackup },
    })).rejects.toBeInstanceOf(NovelOrganizationPlanConflictError);
    expect(createBackup).not.toHaveBeenCalled();
  });

  it('does not report enriched relationship variants as exact duplicates', async () => {
    const { manager, novel, paths } = await createFixture();
    const stored = await readJson<unknown[]>(paths.charactersPath(novel.id), []);
    const character = CharacterProfile.parse(stored[0]);
    character.relationships = [
      {
        targetId: '22222222-2222-4222-8222-222222222222',
        type: 'ally',
        description: '临时合作',
        tensionLevel: 20,
      },
      {
        targetId: '22222222-2222-4222-8222-222222222222',
        type: 'ally',
        description: '临时合作',
        tensionLevel: 70,
      },
    ];
    await writeJson(paths.charactersPath(novel.id), [character]);

    const report = await auditNovelData(manager, novel.id);
    expect(report.issues.map(issue => issue.code)).not.toContain('duplicate_relationships');
  });

  it('backs up and remaps orphan relationships with unambiguous named evidence', async () => {
    const { manager, novel, paths } = await createFixture();
    const stored = await readJson<unknown[]>(paths.charactersPath(novel.id), []);
    const source = CharacterProfile.parse(stored[0]);
    const target = CharacterProfile.parse({
      id: '22222222-2222-4222-8222-222222222222',
      name: '赵琳',
      aliases: [],
      role: 'supporting',
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    });
    source.relationships = [{
      targetId: '99999999-9999-4999-8999-999999999999',
      type: 'ally',
      description: '林澄与赵琳在交付现场形成合作。',
    }];
    await writeJson(paths.charactersPath(novel.id), [source, target]);

    const before = await auditNovelData(manager, novel.id);
    expect(before.issues).toContainEqual(expect.objectContaining({
      code: 'orphan_relationships',
      repairable: true,
    }));
    const preview = await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
    });
    expect(preview.changes).toContainEqual(expect.objectContaining({
      scope: 'characters',
      changed: true,
    }));

    const createBackup = vi.fn(async () => ({
      id: 'backup-relationships',
      novelId: novel.id,
      filename: 'backup-relationships.tar.gz',
      size: 128,
      createdAt: TIMESTAMP,
    }));
    await organizeNovelData({
      novelManager: manager,
      novelId: novel.id,
      scopes: ['characters'],
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: { createBackup },
    });

    expect(createBackup).toHaveBeenCalledWith(novel.id);
    const repaired = await manager.getCharacters(novel.id);
    expect(repaired.find(character => character.id === source.id)?.relationships[0]?.targetId)
      .toBe(target.id);
    expect((await auditNovelData(manager, novel.id)).issues.map(issue => issue.code))
      .not.toContain('orphan_relationships');
  });
});
