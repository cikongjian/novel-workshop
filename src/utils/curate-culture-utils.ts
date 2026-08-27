import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { WorldEntry as WorldEntrySchema } from '../novel/types.js';
import type { WorldEntry } from '../novel/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { CuratedCultureItem } from '../server/routes/handlers/world-schemas.js';
import {
    asRecord,
    toStringArray,
    toStringRecord,
    normalizeOptionalUuid,
    readFirstCultureDetail,
    dedupePowerList,
    replaceWorldCategoryEntries,
} from './curate-shared.js';
import { parseCurateForeshadowingOutput } from './curate-foreshadowing-utils.js';

export function normalizeCurateCultureItemLoose(value: unknown): z.infer<typeof CuratedCultureItem> | undefined {
    const rec = asRecord(value);
    if (!rec) return undefined;

    const name = (typeof rec.name === 'string' ? rec.name : typeof rec.title === 'string' ? rec.title : '')
        .trim();
    if (!name) return undefined;

    const description = (
        typeof rec.description === 'string'
            ? rec.description
            : typeof rec.desc === 'string'
                ? rec.desc
                : typeof rec.summary === 'string'
                    ? rec.summary
                    : typeof rec.effect === 'string'
                        ? rec.effect
                        : typeof rec.impact === 'string'
                            ? rec.impact
                            : ''
    ).trim();
    if (!description) return undefined;

    const details = toStringRecord(rec.details);
    const constraints = toStringArray(rec.constraints);
    const consequences = toStringArray(rec.consequences);
    const relatedEntries = toStringArray(rec.relatedEntries);
    const tags = toStringArray(rec.tags);

    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    return {
        id: id || undefined,
        name,
        description,
        constraints,
        consequences,
        details,
        relatedEntries,
        tags,
    };
}

export function normalizeCultureNameForCurate(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[，。！？：；、"""'''（）()《》【】\[\]—\-·,.!?;:]/g, '');
}

export function parseCurateCultureOutput(raw: string): unknown {
    const parsed = parseCurateForeshadowingOutput(raw);
    if (Array.isArray(parsed)) {
        const normalized = parsed
            .map(item => normalizeCurateCultureItemLoose(item))
            .filter((item): item is z.infer<typeof CuratedCultureItem> => Boolean(item));
        return { summary: '', entries: normalized };
    }

    const rec = asRecord(parsed);
    if (!rec) return parsed;

    const directEntries = Array.isArray(rec.entries)
        ? rec.entries
        : Array.isArray(rec.items)
            ? rec.items
            : Array.isArray(rec.list)
                ? rec.list
                : Array.isArray(rec.results)
                    ? rec.results
                    : undefined;
    const dataRec = asRecord(rec.data);
    const nestedEntries = dataRec && Array.isArray(dataRec.entries)
        ? dataRec.entries
        : dataRec && Array.isArray(dataRec.items)
            ? dataRec.items
            : undefined;
    const rawEntries = directEntries ?? nestedEntries;
    if (!rawEntries) return parsed;

    const summary = (typeof rec.summary === 'string'
        ? rec.summary
        : dataRec && typeof dataRec.summary === 'string'
            ? dataRec.summary
            : '').trim();

    const normalizedEntries = rawEntries
        .map(item => normalizeCurateCultureItemLoose(item))
        .filter((item): item is z.infer<typeof CuratedCultureItem> => Boolean(item));
    return {
        summary,
        entries: normalizedEntries,
    };
}

export function cultureEntryScore(entry: WorldEntry): number {
    const descriptionScore = entry.description.trim().length;
    const detailsScore = Object.keys(entry.details).length * 24;
    const relatedScore = entry.relatedEntries.length * 8;
    const tagScore = entry.tags.length * 6;
    const constraintsScore = (entry.constraints?.length ?? 0) * 18;
    const consequencesScore = (entry.consequences?.length ?? 0) * 18;
    return descriptionScore + detailsScore + relatedScore + tagScore + constraintsScore + consequencesScore;
}

function pickBetterCultureCandidate(a: WorldEntry, b: WorldEntry): WorldEntry {
    const aScore = cultureEntryScore(a);
    const bScore = cultureEntryScore(b);
    if (aScore !== bScore) {
        return aScore >= bScore ? a : b;
    }
    return a.name.length >= b.name.length ? a : b;
}

export function sanitizeCuratedCultureEntries(params: {
    curated: Array<z.infer<typeof CuratedCultureItem>>;
    existingCulture: WorldEntry[];
    allEntries: WorldEntry[];
    maxItems: number;
}): WorldEntry[] {
    const { curated, existingCulture, allEntries, maxItems } = params;
    const timestamp = new Date().toISOString();
    const existingById = new Map(existingCulture.map(item => [item.id, item]));
    const existingIdByNameKey = new Map<string, string>();
    for (const item of existingCulture) {
        const key = normalizeCultureNameForCurate(item.name);
        if (key && !existingIdByNameKey.has(key)) {
            existingIdByNameKey.set(key, item.id);
        }
    }

    const allEntryIds = new Set(allEntries.map(item => item.id));
    const mergedByName = new Map<string, WorldEntry>();

    for (const raw of curated) {
        const safeName = raw.name.trim();
        const safeDescription = raw.description.trim();
        if (!safeName || !safeDescription) continue;

        const nameKey = normalizeCultureNameForCurate(safeName) || randomUUID();
        const rawId = normalizeOptionalUuid(raw.id);
        const byId = rawId ? existingById.get(rawId) : undefined;
        const byName = existingIdByNameKey.get(nameKey);
        const matched = byId ?? (byName ? existingById.get(byName) : undefined);
        const linkedId = matched?.id ?? rawId ?? randomUUID();
        allEntryIds.add(linkedId);

        const mergedDetailsSource = { ...(matched?.details ?? {}), ...raw.details };
        const details = Object.fromEntries(
            Object.entries(mergedDetailsSource)
                .map(([key, value]) => [key.trim(), String(value).trim()] as const)
                .filter(([key, value]) => key.length > 0 && value.length > 0),
        );
        const tags = Array.from(
            new Set(
                [...(matched?.tags ?? []), ...raw.tags]
                    .map(item => item.trim())
                    .filter(Boolean),
            ),
        ).slice(0, 20);
        const taboo = readFirstCultureDetail(details, ['taboo', '禁忌', '禁令', '戒律']);
        const cost = readFirstCultureDetail(details, ['cost', '代价', '成本', '牺牲']);
        const trigger = readFirstCultureDetail(details, ['trigger', '触发条件', '触发', 'sceneTrigger']);
        const ritual = readFirstCultureDetail(details, ['ritual', '仪式']);
        const impact = readFirstCultureDetail(details, ['impact', '剧情作用', 'sceneHook', '影响']);
        const detailConsequence = readFirstCultureDetail(details, ['consequence', '后果', '惩罚', '处罚', 'backlash']);

        const constraints = dedupePowerList([
            ...(matched?.constraints ?? []),
            ...(raw.constraints ?? []),
            taboo ? `禁忌：${taboo}` : '',
            cost ? `代价：${cost}` : '',
            ritual ? `仪式要求：${ritual}` : '',
            trigger ? `触发条件：${trigger}` : '',
        ]).slice(0, 16);
        const consequences = dedupePowerList([
            ...(matched?.consequences ?? []),
            ...(raw.consequences ?? []),
            detailConsequence ? `后果：${detailConsequence}` : '',
            impact ? `影响：${impact}` : '',
        ]).slice(0, 16);
        const relatedEntries = Array.from(
            new Set([...(matched?.relatedEntries ?? []), ...raw.relatedEntries]),
        ).filter(id => id !== linkedId && allEntryIds.has(id));

        const parsed = WorldEntrySchema.safeParse({
            id: linkedId,
            category: 'culture',
            name: safeName,
            description: safeDescription,
            aliases: matched?.aliases,
            state: matched?.state,
            storyRole: matched?.storyRole,
            constraints,
            consequences,
            introducedIn: matched?.introducedIn,
            lastUsedIn: matched?.lastUsedIn,
            useCount: matched?.useCount,
            qualityScore: matched?.qualityScore,
            source: matched?.source ?? 'merged',
            details,
            relatedEntries,
            tags,
            createdAt: matched?.createdAt ?? timestamp,
            updatedAt: timestamp,
        });
        if (!parsed.success) continue;

        const candidate = parsed.data;
        const existingCandidate = mergedByName.get(nameKey);
        if (!existingCandidate) {
            mergedByName.set(nameKey, candidate);
        }
        else {
            mergedByName.set(nameKey, pickBetterCultureCandidate(existingCandidate, candidate));
        }
    }

    const ranked = Array.from(mergedByName.values())
        .sort((a, b) => {
            const scoreDiff = cultureEntryScore(b) - cultureEntryScore(a);
            if (scoreDiff !== 0) return scoreDiff;
            return a.name.localeCompare(b.name, 'zh-CN');
        })
        .slice(0, maxItems);

    const validIds = new Set([
        ...allEntries.filter(item => item.category !== 'culture').map(item => item.id),
        ...ranked.map(item => item.id),
    ]);

    return ranked.map(item => ({
        ...item,
        relatedEntries: item.relatedEntries.filter(id => id !== item.id && validIds.has(id)),
    }));
}

export async function replaceCultureEntries(params: {
    novelId: string;
    novelManager: NovelManager;
    nextCultureEntries: WorldEntry[];
    existingWorldEntries: WorldEntry[];
}): Promise<void> {
    const { novelId, novelManager, nextCultureEntries, existingWorldEntries } = params;
    await replaceWorldCategoryEntries({
        novelId,
        novelManager,
        category: 'culture',
        nextCategoryEntries: nextCultureEntries,
        existingWorldEntries,
    });
}
