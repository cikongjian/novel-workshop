import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldBibleBuilderAgent } from '../../../agents/world-bible-builder.js';
import type { WorldEntry } from '../../../novel/types.js';
import { WorldBibleProposalEntry } from './world-bible-schema.js';
import {
  applyWorldBibleProposals,
  buildWorldBibleInput,
  parseWorldBiblePreview,
  runWorldBiblePreview,
} from './world-bible-support.js';
import { loadSettingBaseline } from '../../../pipeline/setting-baseline/baseline-store.js';

const timestamp = '2026-07-12T00:00:00.000Z';

function coverage() {
  return Object.fromEntries([
    'geography', 'power', 'faction', 'history', 'culture', 'economy', 'rule', 'knowledge',
  ].map(domain => [domain, { status: 'partial', note: `${domain}待完善` }]));
}

function makeWorldEntry(overrides: Partial<WorldEntry> = {}): WorldEntry {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    category: 'rule',
    name: '宵禁规则',
    description: '城门在日落后关闭。',
    constraints: ['普通人不得夜间通行'],
    consequences: [],
    details: {},
    dependencies: [],
    conflicts: [],
    relatedEntries: [],
    tags: ['auto-extracted', 'chapter-1'],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function completeProposalEntries() {
  return [
    {
      name: '王城', category: 'geography', description: '王国中心城市，控制南北商路与粮仓。',
      storyRole: 'anchor', canonStatus: 'supported', sourceBasis: ['简介'],
    },
    { name: '九阶灵压', category: 'power', description: '力量分为九阶，每次突破都需要矿晶并承担记忆损耗。' },
    { name: '王庭议会', category: 'faction', description: '由王室、行会和边军代表共同组成的决策组织。' },
    { name: '灰潮停战', category: 'history', description: '灰潮历四十七年签订的停战协议决定了当前边界。' },
    { name: '留灯礼', category: 'culture', description: '边境家庭为未归者留灯，熄灯代表法律上的死亡确认。' },
    { name: '宵禁规则', category: 'rule', description: '城门在日落后关闭，违规者会失去跨区通行资格。' },
    { name: '矿晶配额', category: 'other', description: '矿晶按身份和资源债分配，不能在公开市场自由交易。', details: { domain: 'economy' } },
    { name: '停战密约知情边界', category: 'other', description: '居民、议会与王室掌握不同层级的停战信息。', details: { domain: 'knowledge' } },
    ...Array.from({ length: 4 }, (_, index) => ({
      name: `长期规则${index + 1}`,
      category: 'rule',
      description: `用于长篇一致性约束的稳定规则${index + 1}，违反后会产生明确后果。`,
    })),
  ];
}

describe('world bible support', () => {
  it('builds a bounded input with canon, characters, and outline', () => {
    const result = buildWorldBibleInput({
      existingWorldEntries: [makeWorldEntry()],
      characters: [{ name: '林越', role: 'protagonist' }],
      outline: { chapters: [{ chapterNumber: 1, title: '入城', summary: '主角赶在宵禁前入城' }] },
      maxItems: 18,
    });

    expect(result).toContain('最多输出 18 条');
    expect(result).toContain('宵禁规则');
    expect(result).toContain('林越');
    expect(result).toContain('主角赶在宵禁前入城');
  });

  it('parses fenced JSON, removes duplicate names, and rejects character factions', () => {
    const raw = `\`\`\`json\n${JSON.stringify({
      summary: '以王城资源争夺为长期冲突。',
      coverage: coverage(),
      entries: [
        ...completeProposalEntries(),
        {
          name: '王城', category: 'geography', description: '重复条目，不应保留。',
        },
        {
          name: '张虎', category: 'faction', description: '角色本人不应成为势力。',
        },
      ],
    })}\n\`\`\``;

    const result = parseWorldBiblePreview(raw, 20, new Set(['杂役弟子张虎']));

    expect(result.entries).toHaveLength(12);
    expect(result.entries[0].name).toBe('王城');
    expect(result.entries[0].tempId).toBe('world-proposal-1');
  });

  it('rejects previews that do not contain enough durable world knowledge', () => {
    const raw = JSON.stringify({
      summary: '只有零散地点，尚未形成可长期使用的世界骨架。',
      coverage: coverage(),
      entries: [{
        name: '王城',
        category: 'geography',
        description: '王国中心城市，控制南北商路与粮仓。',
      }],
    });

    expect(() => parseWorldBiblePreview(raw, 20)).toThrow('至少需要 12 条');
  });

  it('rejects previews that claim coverage without domain entries', () => {
    const entries = completeProposalEntries().filter(entry => entry.category !== 'culture');
    entries.push({
      name: '替补规则',
      category: 'rule',
      description: '只用于补足数量，不能替代缺失的文化领域知识。',
    });
    const raw = JSON.stringify({
      summary: '数量足够但缺少文化条目。',
      coverage: coverage(),
      entries,
    });

    expect(() => parseWorldBiblePreview(raw, 20)).toThrow('缺少：culture');
  });

  it('unwraps a single object accidentally enclosed in an array', () => {
    const raw = JSON.stringify([{
      summary: '完整世界骨架。',
      coverage: coverage(),
      entries: completeProposalEntries(),
    }]);

    expect(parseWorldBiblePreview(raw, 20).entries).toHaveLength(12);
  });

  it('retries once with correction guidance after invalid model output', async () => {
    const validContent = JSON.stringify({
      summary: '完整世界骨架。',
      coverage: coverage(),
      entries: completeProposalEntries(),
    });
    const execute = vi.spyOn(WorldBibleBuilderAgent.prototype, 'execute')
      .mockResolvedValueOnce({ content: '[]' } as any)
      .mockResolvedValueOnce({ content: validContent } as any);
    const deps = {
      novelManager: {
        getNovel: vi.fn().mockResolvedValue({ id: 'novel-1', title: '测试小说', genre: 'fantasy' }),
        getWorldEntries: vi.fn().mockResolvedValue([]),
        getCharacters: vi.fn().mockResolvedValue([]),
        getOutline: vi.fn().mockResolvedValue({ chapters: [] }),
      },
    } as any;

    const result = await runWorldBiblePreview({
      deps,
      novelId: '00000000-0000-4000-8000-000000000001',
      maxItems: 20,
      activeModelClient: {} as any,
    });

    expect(result.entries).toHaveLength(12);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][0].inputText).toContain('输出纠错');
    execute.mockRestore();
  });

  it('merges confirmed proposals as baseline canon and creates related entries', async () => {
    const stored = [makeWorldEntry()];
    const saveWorldEntry = vi.fn(async (_novelId: string, entry: WorldEntry) => {
      const index = stored.findIndex(item => item.id === entry.id);
      if (index >= 0) stored[index] = entry;
      else stored.push(entry);
    });
    const deps = {
      novelManager: {
        getNovel: vi.fn().mockResolvedValue({ id: 'novel-1', title: '测试小说' }),
        getWorldEntries: vi.fn().mockResolvedValue(stored),
        getCharacters: vi.fn().mockResolvedValue([{ name: '林越', aliases: [] }]),
        saveWorldEntry,
      },
      novelMemory: { indexWorldEntry: vi.fn().mockResolvedValue(undefined) },
    } as any;
    const proposals = [
      WorldBibleProposalEntry.parse({
        name: '宵禁规则',
        category: 'rule',
        description: '城门日落后关闭，只有持令者可以通行。',
        storyRole: 'constraint',
        canonStatus: 'supported',
        sourceBasis: ['大纲第1章'],
        constraints: ['持令者必须登记身份'],
        consequences: ['违规者会被巡夜司扣押'],
        details: { narrativeFunction: '限制主角夜间行动' },
        relatedNames: ['王城'],
      }),
      WorldBibleProposalEntry.parse({
        name: '王城',
        category: 'geography',
        description: '王国中心城市，城门与南北商路构成主要通行节点。',
        storyRole: 'anchor',
        canonStatus: 'proposal',
        sourceBasis: ['简介'],
        relatedNames: ['宵禁规则'],
      }),
      WorldBibleProposalEntry.parse({
        name: '林越',
        category: 'faction',
        description: '角色本人不应作为势力写入。',
      }),
    ];

    const result = await applyWorldBibleProposals({
      deps,
      novelId: '00000000-0000-4000-8000-000000000001',
      proposals,
      summary: '王城生存规则',
    });

    expect(result.createdCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.skippedNames).toEqual(['林越']);
    expect(stored).toHaveLength(2);
    expect(stored.every(entry => entry.baseline === true)).toBe(true);
    expect(stored[0].constraints).toEqual([
      '普通人不得夜间通行',
      '持令者必须登记身份',
    ]);
    expect(stored[0].tags).toEqual(expect.arrayContaining(['world-bible', 'approved']));
    expect(stored[0].tags).not.toContain('auto-extracted');
    expect(stored[0].relatedEntries).toContain(stored[1].id);
    expect(stored[1].relatedEntries).toContain(stored[0].id);
  });

  it('persists applied canon into a confirmed setting baseline', async () => {
    const novelsDir = await mkdtemp(join(tmpdir(), 'world-bible-baseline-'));
    const novelId = '00000000-0000-4000-8000-000000000001';
    const stored: WorldEntry[] = [];
    try {
      const deps = {
        novelManager: {
          getDataDir: () => novelsDir,
          getNovel: vi.fn().mockResolvedValue({
            id: novelId,
            title: '测试小说',
            genre: 'fantasy',
            synopsis: '主角必须在宵禁下进入王城。',
            tags: [],
          }),
          getWorldEntries: vi.fn().mockResolvedValue(stored),
          getCharacters: vi.fn().mockResolvedValue([]),
          saveWorldEntry: vi.fn(async (_novelId: string, worldEntry: WorldEntry) => {
            stored.push(worldEntry);
          }),
        },
      } as any;
      const result = await applyWorldBibleProposals({
        deps,
        novelId,
        proposals: [WorldBibleProposalEntry.parse({
          name: '宵禁规则',
          category: 'rule',
          description: '城门在日落后必须关闭，只有持令者能够登记通行。',
          constraints: ['日落后城门必须关闭'],
          consequences: ['违规者会被巡夜司扣押'],
        })],
        summary: '王城秩序由宵禁维持',
      });
      const baseline = await loadSettingBaseline(novelsDir, novelId);

      expect(result.baselineSynced).toBe(true);
      expect(baseline?.status).toBe('confirmed');
      expect(baseline?.canonicalWorldEntries).toEqual([
        expect.objectContaining({ name: '宵禁规则' }),
      ]);
    } finally {
      await rm(novelsDir, { recursive: true, force: true });
    }
  });
});
