import { randomUUID } from 'node:crypto';
import type { ModelClient } from '../../../models/types.js';
import type { WorldEntry } from '../../../novel/types.js';
import { WorldBibleBuilderAgent } from '../../../agents/world-bible-builder.js';
import { parseJsonPayload } from '../../../utils/json-payload.js';
import {
  buildCreatedWorldEntryFromMerge,
  buildUpdatedWorldEntryFromMerge,
} from '../../../pipeline/world-merge-entry.js';
import { syncWorldBibleSettingBaseline } from '../../../pipeline/setting-baseline/world-bible-sync.js';
import type { GenerateDeps } from './types.js';
import {
  WorldBiblePreviewResult,
  type WorldBiblePreview,
  type WorldBibleProposal,
} from './world-bible-schema.js';

type KnownCharacter = {
  name?: string;
  aliases?: string[];
  role?: string;
  position?: string;
  motivation?: string;
};

function collectKnownCharacterNames(characters: KnownCharacter[]): Set<string> {
  return new Set(characters.flatMap(character => [
    character.name,
    ...(character.aliases ?? []),
  ].filter((name): name is string => typeof name === 'string' && name.trim().length > 0)));
}

function normalizeEntityName(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function matchesKnownCharacter(name: string, knownCharacterNames: ReadonlySet<string>): boolean {
  const normalizedName = normalizeEntityName(name);
  if (normalizedName.length < 2) return false;
  return [...knownCharacterNames].some((knownName) => {
    const normalizedKnown = normalizeEntityName(knownName);
    return normalizedKnown.length >= 2
      && (normalizedKnown.includes(normalizedName) || normalizedName.includes(normalizedKnown));
  });
}

function hasFactionSemantics(entry: WorldBibleProposal): boolean {
  const factionNameMarker = /(?:宗|门|派|教|会|盟|国|朝|族|家|堂|宫|府|司|院|营|军|卫|帮|社|队|团|党|廷|庭|王室|皇室|议会|委员会|公司|集团|工会|行会|商会|组织|势力|阵营|联盟|部落|城邦|学府|书院|工坊|商行)$/u;
  const structuredFactionDescription = /(?:由.{1,50}(?:组成|构成)|(?:组织|势力|阵营|联盟|派系|家族|门派|国家|机构).{0,20}(?:成员|首领|目标|资源|领地|结构))/u;
  return factionNameMarker.test(entry.name.trim())
    || structuredFactionDescription.test(entry.description);
}

function isRejectedFaction(
  entry: WorldBibleProposal,
  knownCharacterNames: ReadonlySet<string>,
): boolean {
  return entry.category === 'faction'
    && (matchesKnownCharacter(entry.name, knownCharacterNames) || !hasFactionSemantics(entry));
}

function findMissingWorldDomains(entries: WorldBibleProposal[], preview: WorldBiblePreview): string[] {
  const represented = {
    geography: entries.some(entry => entry.category === 'geography'),
    power: entries.some(entry => entry.category === 'power') || preview.coverage.power.status === 'missing',
    faction: entries.some(entry => entry.category === 'faction'),
    history: entries.some(entry => entry.category === 'history'),
    culture: entries.some(entry => entry.category === 'culture' || entry.details.domain === 'culture'),
    economy: entries.some(entry => entry.details.domain === 'economy'),
    rule: entries.some(entry => entry.category === 'rule'),
    knowledge: entries.some(entry => entry.details.domain === 'knowledge'),
  };
  return Object.entries(represented)
    .filter(([, present]) => !present)
    .map(([domain]) => domain);
}

function compactOutline(outline: unknown): unknown {
  if (!outline || typeof outline !== 'object') return {};
  const value = outline as {
    chapters?: Array<Record<string, unknown>>;
    plotThreads?: Array<Record<string, unknown>>;
    foreshadowing?: Array<Record<string, unknown>>;
  };
  return {
    chapters: (value.chapters ?? []).slice(0, 30).map(chapter => ({
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      summary: chapter.summary,
      objective: chapter.objective,
    })),
    plotThreads: (value.plotThreads ?? []).slice(0, 20).map(thread => ({
      name: thread.name,
      description: thread.description,
      status: thread.status,
    })),
    foreshadowing: (value.foreshadowing ?? []).slice(0, 20).map(item => ({
      name: item.name,
      description: item.description,
      status: item.status,
    })),
  };
}

export function buildWorldBibleInput(params: {
  existingWorldEntries: WorldEntry[];
  characters: KnownCharacter[];
  outline: unknown;
  maxItems: number;
}): string {
  const existingWorld = params.existingWorldEntries.slice(0, 100).map(entry => ({
    name: entry.name,
    category: entry.category,
    description: entry.description.slice(0, 600),
    constraints: entry.constraints ?? [],
    consequences: entry.consequences ?? [],
    details: entry.details,
    baseline: entry.baseline === true,
  }));
  const characters = params.characters.slice(0, 50).map(character => ({
    name: character.name,
    aliases: character.aliases ?? [],
    role: character.role,
    position: character.position,
    motivation: character.motivation,
  }));

  return [
    '## 生成规模',
    `- 最多输出 ${params.maxItems} 条世界知识提案。`,
    '- 已有条目必须保留并深化；不要换名重复创建。',
    '',
    '## 已有世界正史',
    existingWorld.length > 0 ? JSON.stringify(existingWorld, null, 2) : '（尚未建立）',
    '',
    '## 已知角色（姓名不能作为 faction 条目）',
    characters.length > 0 ? JSON.stringify(characters, null, 2) : '（暂无角色）',
    '',
    '## 故事大纲与长期线索',
    JSON.stringify(compactOutline(params.outline), null, 2),
  ].join('\n');
}

export function parseWorldBiblePreview(
  raw: string,
  maxItems: number,
  knownCharacterNames: ReadonlySet<string> = new Set(),
): WorldBiblePreview {
  const payload = parseJsonPayload(raw);
  const normalizedPayload = Array.isArray(payload)
    && payload.length === 1
    && payload[0]
    && typeof payload[0] === 'object'
    && 'entries' in payload[0]
    ? payload[0]
    : payload;
  const parsed = WorldBiblePreviewResult.parse(normalizedPayload);
  const seen = new Set<string>();
  const entries = parsed.entries
    .filter(entry => !isRejectedFaction(entry, knownCharacterNames))
    .filter(entry => {
      const key = entry.name.trim().toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems)
    .map((entry, index) => ({
      ...entry,
      tempId: entry.tempId?.trim() || `world-proposal-${index + 1}`,
    }));

  const minimumItems = Math.min(12, maxItems);
  if (entries.length < minimumItems) {
    throw new Error(`世界圣经提案不足，至少需要 ${minimumItems} 条可确认的长期设定`);
  }
  const missingDomains = findMissingWorldDomains(entries, parsed);
  if (missingDomains.length > 0) {
    throw new Error(`世界圣经领域不完整，缺少：${missingDomains.join('、')}`);
  }
  return { ...parsed, entries };
}

export async function runWorldBiblePreview(params: {
  deps: GenerateDeps;
  novelId: string;
  maxItems: number;
  activeModelClient: ModelClient;
}): Promise<WorldBiblePreview> {
  const { deps, novelId, maxItems, activeModelClient } = params;
  const [novel, worldEntries, characters, outline] = await Promise.all([
    deps.novelManager.getNovel(novelId),
    deps.novelManager.getWorldEntries(novelId),
    deps.novelManager.getCharacters(novelId),
    deps.novelManager.getOutline(novelId),
  ]);
  if (!novel) throw new Error('小说不存在');

  const inputText = buildWorldBibleInput({
    existingWorldEntries: worldEntries,
    characters,
    outline,
    maxItems,
  });
  const agent = new WorldBibleBuilderAgent();
  const agentContext = {
    novelId,
    novelTitle: novel.title,
    novelSynopsis: novel.synopsis || novel.description || '',
    genre: novel.genre,
    novelTags: novel.tags,
    constitutionTags: novel.constitutionTags,
    inputText,
    temperatureOverride: 0.35,
  };
  const output = await agent.execute(agentContext, activeModelClient);

  try {
    return parseWorldBiblePreview(output.content, maxItems, collectKnownCharacterNames(characters));
  } catch (firstError) {
    const failureReason = firstError instanceof Error ? firstError.message.slice(0, 500) : '输出结构无效';
    const retryOutput = await agent.execute({
      ...agentContext,
      inputText: [
        inputText,
        '',
        '## 输出纠错',
        `- 上次输出未通过校验：${failureReason}`,
        '- 根节点必须是包含 summary、coverage、entries 的单个 JSON 对象，不能输出条目数组。',
        '- 修正格式并补齐缺失领域后，重新输出完整 JSON；不要解释原因。',
      ].join('\n'),
      temperatureOverride: 0.2,
    }, activeModelClient);

    try {
      return parseWorldBiblePreview(retryOutput.content, maxItems, collectKnownCharacterNames(characters));
    } catch (retryError) {
      const retryReason = retryError instanceof Error ? retryError.message : '输出结构无效';
      throw new Error(`世界圣经输出连续两次未通过完整性校验：${retryReason}`);
    }
  }
}

function enrichApprovedEntry(entry: WorldEntry, proposal: WorldBibleProposal): WorldEntry {
  return {
    ...entry,
    baseline: true,
    source: 'merged',
    storyRole: proposal.storyRole ?? entry.storyRole,
    details: {
      ...entry.details,
      ...proposal.details,
      canonStatus: 'approved',
      sourceBasis: proposal.sourceBasis.join('；'),
    },
    tags: Array.from(new Set([
      ...entry.tags.filter(tag => !['auto-generated', 'auto-extracted'].includes(tag) && !tag.startsWith('chapter-')),
      'world-bible',
      'approved',
    ])),
  };
}

export async function applyWorldBibleProposals(params: {
  deps: Pick<GenerateDeps, 'novelManager' | 'novelMemory'>;
  novelId: string;
  proposals: WorldBibleProposal[];
  summary: string;
}): Promise<{
  applied: true;
  summary: string;
  createdCount: number;
  updatedCount: number;
  skippedNames: string[];
  baselineSynced: boolean;
  entries: WorldEntry[];
}> {
  const { deps, novelId, proposals, summary } = params;
  const [novel, existingEntries, characters] = await Promise.all([
    deps.novelManager.getNovel(novelId),
    deps.novelManager.getWorldEntries(novelId),
    deps.novelManager.getCharacters(novelId),
  ]);
  if (!novel) throw new Error('小说不存在');

  const knownCharacterNames = collectKnownCharacterNames(characters);
  const skippedNames: string[] = [];
  const uniqueProposals = new Map<string, WorldBibleProposal>();
  for (const proposal of proposals) {
    if (isRejectedFaction(proposal, knownCharacterNames)) {
      skippedNames.push(proposal.name);
      continue;
    }
    uniqueProposals.set(proposal.name.trim().toLocaleLowerCase(), proposal);
  }
  if (uniqueProposals.size === 0) {
    throw new Error('没有可应用的世界圣经条目');
  }

  const timestamp = new Date().toISOString();
  const existingByName = new Map(existingEntries.map(entry => [entry.name.trim().toLocaleLowerCase(), entry]));
  const staged: Array<{ entry: WorldEntry; proposal: WorldBibleProposal; created: boolean }> = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const [key, proposal] of uniqueProposals) {
    const action = {
      ...proposal,
      details: {
        ...proposal.details,
        canonStatus: 'approved',
        sourceBasis: proposal.sourceBasis.join('；'),
      },
    };
    const existing = existingByName.get(key);
    if (existing) {
      const updated = enrichApprovedEntry(
        buildUpdatedWorldEntryFromMerge(existing, action, timestamp),
        proposal,
      );
      staged.push({ entry: updated, proposal, created: false });
      updatedCount++;
    } else {
      const created = enrichApprovedEntry(
        buildCreatedWorldEntryFromMerge(action, 1, timestamp, randomUUID()),
        proposal,
      );
      staged.push({ entry: created, proposal, created: true });
      existingByName.set(key, created);
      createdCount++;
    }
  }

  const allByName = new Map(existingEntries.map(entry => [entry.name.trim().toLocaleLowerCase(), entry.id]));
  staged.forEach(({ entry }) => allByName.set(entry.name.trim().toLocaleLowerCase(), entry.id));
  const stagedById = new Map(staged.map(item => [item.entry.id, item]));
  for (const item of staged) {
    const relatedIds = item.proposal.relatedNames
      .map(name => allByName.get(name.trim().toLocaleLowerCase()))
      .filter((id): id is string => Boolean(id && id !== item.entry.id));
    item.entry.relatedEntries = Array.from(new Set([...item.entry.relatedEntries, ...relatedIds]));
    for (const relatedId of relatedIds) {
      const related = stagedById.get(relatedId);
      if (related && !related.entry.relatedEntries.includes(item.entry.id)) {
        related.entry.relatedEntries.push(item.entry.id);
      }
    }
  }

  for (const { entry } of staged) {
    await deps.novelManager.saveWorldEntry(novelId, entry);
    await deps.novelMemory?.indexWorldEntry(novelId, entry).catch(() => {});
  }

  const stagedIds = new Set(staged.map(item => item.entry.id));
  const finalEntries = [
    ...existingEntries.filter(entry => !stagedIds.has(entry.id)),
    ...staged.map(item => item.entry),
  ];
  const novelsDir = typeof deps.novelManager.getDataDir === 'function'
    ? deps.novelManager.getDataDir()
    : '';
  if (novelsDir) {
    await syncWorldBibleSettingBaseline({
      novelsDir,
      novel,
      worldEntries: finalEntries,
      characters,
      summary,
    });
  }

  return {
    applied: true,
    summary,
    createdCount,
    updatedCount,
    skippedNames,
    baselineSynced: Boolean(novelsDir),
    entries: staged.map(item => item.entry),
  };
}
