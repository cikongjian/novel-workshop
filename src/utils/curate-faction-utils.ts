import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { WorldEntry as WorldEntrySchema } from '../novel/types.js';
import type { WorldEntry } from '../novel/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { CuratedFactionItem } from '../server/routes/handlers/world-schemas.js';
import {
    asRecord,
    toStringArray,
    toStringRecord,
    normalizeOptionalUuid,
    dedupePowerList,
    replaceWorldCategoryEntries,
} from './curate-shared.js';
import { normalizeCultureNameForCurate } from './curate-culture-utils.js';
import { parseCurateForeshadowingOutput } from './curate-foreshadowing-utils.js';

export function normalizeCurateFactionItemLoose(value: unknown): z.infer<typeof CuratedFactionItem> | undefined {
    const rec = asRecord(value);
    if (!rec) return undefined;

    const name = (typeof rec.name === 'string' ? rec.name : typeof rec.title === 'string' ? rec.title : '').trim();
    if (!name) return undefined;
    const description = (
        typeof rec.description === 'string'
            ? rec.description
            : typeof rec.summary === 'string'
                ? rec.summary
                : typeof rec.desc === 'string'
                    ? rec.desc
                    : ''
    ).trim();
    if (!description) return undefined;

    const details = toStringRecord(rec.details);
    const cultureAnchors = toStringArray(rec.cultureAnchors ?? rec.cultures ?? rec.values);
    const inheritanceChain = toStringArray(rec.inheritanceChain ?? rec.lineage ?? rec.legacy);
    const motives = toStringArray(rec.motives ?? rec.goals ?? rec.motivations);
    const coreMissions = toStringArray(rec.coreMissions ?? rec.missions ?? rec.coreTasks);
    const constraints = toStringArray(rec.constraints);
    const consequences = toStringArray(rec.consequences);
    const relatedEntries = toStringArray(rec.relatedEntries);
    const tags = toStringArray(rec.tags);
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';

    return {
        id: id || undefined,
        name,
        description,
        cultureAnchors,
        inheritanceChain,
        motives,
        coreMissions,
        constraints,
        consequences,
        details,
        relatedEntries,
        tags,
    };
}

export function parseCurateFactionOutput(raw: string): unknown {
    const parsed = parseCurateForeshadowingOutput(raw);
    if (Array.isArray(parsed)) {
        const normalized = parsed
            .map(item => normalizeCurateFactionItemLoose(item))
            .filter((item): item is z.infer<typeof CuratedFactionItem> => Boolean(item));
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
        .map(item => normalizeCurateFactionItemLoose(item))
        .filter((item): item is z.infer<typeof CuratedFactionItem> => Boolean(item));

    return {
        summary,
        entries: normalizedEntries,
    };
}

export function normalizeFactionNameForCurate(name: string): string {
    return normalizeCultureNameForCurate(name);
}

export function parseFactionDetailList(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    return value
        .split('|')
        .map(item => item.trim())
        .filter(Boolean);
}

export function worldEntryToCuratedFactionSeed(entry: WorldEntry): z.infer<typeof CuratedFactionItem> {
    const cultureAnchors = dedupePowerList(parseFactionDetailList(entry.details['faction.cultureAnchors']));
    const inheritanceChain = dedupePowerList(parseFactionDetailList(entry.details['faction.inheritanceChain']));
    const motives = dedupePowerList(parseFactionDetailList(entry.details['faction.motives']));
    const coreMissions = dedupePowerList(parseFactionDetailList(entry.details['faction.coreMissions']));
    return {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        cultureAnchors,
        inheritanceChain,
        motives,
        coreMissions,
        constraints: [...(entry.constraints ?? [])],
        consequences: [...(entry.consequences ?? [])],
        details: { ...(entry.details ?? {}) },
        relatedEntries: [...(entry.relatedEntries ?? [])],
        tags: [...(entry.tags ?? [])],
    };
}

export function factionEntryScore(entry: WorldEntry): number {
    const descriptionScore = entry.description.trim().length;
    const detailsScore = Object.keys(entry.details).length * 20;
    const relatedScore = entry.relatedEntries.length * 8;
    const tagScore = entry.tags.length * 6;
    const constraintsScore = (entry.constraints?.length ?? 0) * 18;
    const consequencesScore = (entry.consequences?.length ?? 0) * 18;
    const listSignals = [
        entry.details['faction.cultureAnchors'],
        entry.details['faction.inheritanceChain'],
        entry.details['faction.motives'],
        entry.details['faction.coreMissions'],
    ].filter(Boolean).length * 26;
    return descriptionScore + detailsScore + relatedScore + tagScore + constraintsScore + consequencesScore + listSignals;
}

function pickBetterFactionCandidate(a: WorldEntry, b: WorldEntry): WorldEntry {
    const aScore = factionEntryScore(a);
    const bScore = factionEntryScore(b);
    if (aScore !== bScore) return aScore >= bScore ? a : b;
    return a.name.length >= b.name.length ? a : b;
}

export function sanitizeCuratedFactionEntries(params: {
    curated: Array<z.infer<typeof CuratedFactionItem>>;
    existingFaction: WorldEntry[];
    allEntries: WorldEntry[];
    maxItems: number;
}): WorldEntry[] {
    const { curated, existingFaction, allEntries, maxItems } = params;
    const timestamp = new Date().toISOString();
    const existingById = new Map(existingFaction.map(item => [item.id, item]));
    const existingIdByNameKey = new Map<string, string>();
    for (const item of existingFaction) {
        const key = normalizeFactionNameForCurate(item.name);
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

        const nameKey = normalizeFactionNameForCurate(safeName) || randomUUID();
        const rawId = normalizeOptionalUuid(raw.id);
        const byId = rawId ? existingById.get(rawId) : undefined;
        const byName = existingIdByNameKey.get(nameKey);
        const matched = byId ?? (byName ? existingById.get(byName) : undefined);
        const linkedId = matched?.id ?? rawId ?? randomUUID();
        allEntryIds.add(linkedId);

        let details = Object.fromEntries(
            Object.entries({ ...(matched?.details ?? {}), ...(raw.details ?? {}) })
                .map(([key, value]) => [key.trim(), String(value).trim()] as const)
                .filter(([key, value]) => key.length > 0 && value.length > 0),
        );
        const cultureAnchors = dedupePowerList([
            ...(raw.cultureAnchors ?? []),
            ...parseFactionDetailList(matched?.details['faction.cultureAnchors']),
        ]).slice(0, 20);
        const inheritanceChain = dedupePowerList([
            ...(raw.inheritanceChain ?? []),
            ...parseFactionDetailList(matched?.details['faction.inheritanceChain']),
        ]).slice(0, 20);
        const motives = dedupePowerList([
            ...(raw.motives ?? []),
            ...parseFactionDetailList(matched?.details['faction.motives']),
        ]).slice(0, 20);
        const coreMissions = dedupePowerList([
            ...(raw.coreMissions ?? []),
            ...parseFactionDetailList(matched?.details['faction.coreMissions']),
        ]).slice(0, 20);

        if (cultureAnchors.length > 0) details['faction.cultureAnchors'] = cultureAnchors.join(' | ');
        if (inheritanceChain.length > 0) details['faction.inheritanceChain'] = inheritanceChain.join(' | ');
        if (motives.length > 0) details['faction.motives'] = motives.join(' | ');
        if (coreMissions.length > 0) details['faction.coreMissions'] = coreMissions.join(' | ');

        const constraints = dedupePowerList([
            ...(matched?.constraints ?? []),
            ...(raw.constraints ?? []),
        ]).slice(0, 20);
        const consequences = dedupePowerList([
            ...(matched?.consequences ?? []),
            ...(raw.consequences ?? []),
        ]).slice(0, 20);
        const tags = Array.from(
            new Set(
                [
                    ...(matched?.tags ?? []),
                    ...(raw.tags ?? []),
                    cultureAnchors.length > 0 ? 'faction-culture' : '',
                    inheritanceChain.length > 0 ? 'faction-inheritance' : '',
                    motives.length > 0 ? 'faction-motive' : '',
                    coreMissions.length > 0 ? 'faction-mission' : '',
                ]
                    .map(item => item.trim())
                    .filter(Boolean),
            ),
        ).slice(0, 28);
        const relatedEntries = Array.from(
            new Set([...(matched?.relatedEntries ?? []), ...(raw.relatedEntries ?? [])]),
        ).filter(id => id !== linkedId && allEntryIds.has(id));

        const parsed = WorldEntrySchema.safeParse({
            id: linkedId,
            category: 'faction',
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
            mergedByName.set(nameKey, pickBetterFactionCandidate(existingCandidate, candidate));
        }
    }

    const ranked = Array.from(mergedByName.values())
        .sort((a, b) => {
            const scoreDiff = factionEntryScore(b) - factionEntryScore(a);
            if (scoreDiff !== 0) return scoreDiff;
            return a.name.localeCompare(b.name, 'zh-CN');
        })
        .slice(0, maxItems);

    const validIds = new Set([
        ...allEntries.filter(item => item.category !== 'faction').map(item => item.id),
        ...ranked.map(item => item.id),
    ]);

    return ranked.map(item => ({
        ...item,
        relatedEntries: item.relatedEntries.filter(id => id !== item.id && validIds.has(id)),
    }));
}

export async function replaceFactionEntries(params: {
    novelId: string;
    novelManager: NovelManager;
    nextFactionEntries: WorldEntry[];
    existingWorldEntries: WorldEntry[];
}): Promise<void> {
    const { novelId, novelManager, nextFactionEntries, existingWorldEntries } = params;
    await replaceWorldCategoryEntries({
        novelId,
        novelManager,
        category: 'faction',
        nextCategoryEntries: nextFactionEntries,
        existingWorldEntries,
    });
}
