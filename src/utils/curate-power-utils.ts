import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { WorldEntry as WorldEntrySchema } from '../novel/types.js';
import type { WorldEntry } from '../novel/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { normalizePowerParams, readPowerParamsFromDetails, writePowerParamsToDetails } from '../novel/power-params.js';
import { CuratedPowerItem } from '../server/routes/handlers/world-schemas.js';
import { isUuidString, dedupePowerList, replaceWorldCategoryEntries } from './curate-shared.js';
import { normalizeCultureNameForCurate } from './curate-culture-utils.js';
import { parseCurateForeshadowingOutput } from './curate-foreshadowing-utils.js';

export function normalizePowerNameForCurate(name: string): string {
    return normalizeCultureNameForCurate(name);
}

export function normalizePowerDimension(value: string): string {
    return value.trim().slice(0, 20);
}

export function parseCuratePowerOutput(raw: string): unknown {
    return parseCurateForeshadowingOutput(raw);
}

export function worldEntryToCuratedPowerSeed(entry: WorldEntry): z.infer<typeof CuratedPowerItem> {
    const dimensions = dedupePowerList(
        (entry.details['power.dimensions'] ?? '')
            .split('|')
            .map(item => normalizePowerDimension(item))
            .filter(Boolean),
    );
    const parameters = readPowerParamsFromDetails(entry.details ?? {});
    return {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        dimensions,
        constraints: [...(entry.constraints ?? [])],
        consequences: [...(entry.consequences ?? [])],
        details: { ...(entry.details ?? {}) },
        relatedEntries: [...(entry.relatedEntries ?? [])],
        tags: [...(entry.tags ?? [])],
        parameters: parameters
            ? {
                systemType: parameters.systemType,
                tierNames: parameters.tierNames,
                maxTier: parameters.maxTier,
                resourceName: parameters.resourceName,
                recoveryPerChapter: parameters.recoveryPerChapter,
                defaultCost: parameters.defaultCost,
                cooldownRule: parameters.cooldownRule,
                riskRule: parameters.riskRule,
                breakthroughRule: parameters.breakthroughRule,
                forbiddenActions: parameters.forbiddenActions,
                keyVerbs: parameters.keyVerbs,
            }
            : undefined,
    };
}

export function powerEntryScore(entry: WorldEntry): number {
    const descriptionScore = entry.description.trim().length;
    const detailsScore = Object.keys(entry.details).length * 18;
    const relatedScore = entry.relatedEntries.length * 8;
    const tagScore = entry.tags.length * 6;
    const constraintsScore = (entry.constraints?.length ?? 0) * 20;
    const consequencesScore = (entry.consequences?.length ?? 0) * 20;
    const params = readPowerParamsFromDetails(entry.details ?? {});
    const paramsScore = params
        ? [
            params.systemType,
            params.maxTier,
            params.resourceName,
            params.defaultCost,
            params.cooldownRule,
            params.riskRule,
            params.breakthroughRule,
            params.tierNames?.length ? params.tierNames.join('|') : '',
            params.keyVerbs?.length ? params.keyVerbs.join('|') : '',
            params.forbiddenActions?.length ? params.forbiddenActions.join('|') : '',
        ].filter(Boolean).length * 22
        : 0;
    return descriptionScore + detailsScore + relatedScore + tagScore + constraintsScore + consequencesScore + paramsScore;
}

function pickBetterPowerCandidate(a: WorldEntry, b: WorldEntry): WorldEntry {
    const aScore = powerEntryScore(a);
    const bScore = powerEntryScore(b);
    if (aScore !== bScore) return aScore >= bScore ? a : b;
    return a.name.length >= b.name.length ? a : b;
}

export function sanitizeCuratedPowerEntries(params: {
    curated: Array<z.infer<typeof CuratedPowerItem>>;
    existingPower: WorldEntry[];
    allEntries: WorldEntry[];
    maxItems: number;
}): WorldEntry[] {
    const { curated, existingPower, allEntries, maxItems } = params;
    const timestamp = new Date().toISOString();
    const existingById = new Map(existingPower.map(item => [item.id, item]));
    const existingIdByNameKey = new Map<string, string>();
    for (const item of existingPower) {
        const key = normalizePowerNameForCurate(item.name);
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

        const nameKey = normalizePowerNameForCurate(safeName) || randomUUID();
        const rawId = raw.id && isUuidString(raw.id) ? raw.id : undefined;
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
        const dimensions = dedupePowerList([...(raw.dimensions ?? [])].map(item => normalizePowerDimension(item)));
        if (dimensions.length > 0) {
            details['power.dimensions'] = dimensions.join(' | ');
        }
        const normalizedParams = normalizePowerParams(raw.parameters);
        details = writePowerParamsToDetails(details, normalizedParams);

        const tags = Array.from(
            new Set(
                [
                    ...(matched?.tags ?? []),
                    ...(raw.tags ?? []),
                    ...(dimensions.map(item => `dim:${item}`)),
                    normalizedParams ? 'power-v2' : '',
                ]
                    .map(item => item.trim())
                    .filter(Boolean),
            ),
        ).slice(0, 28);

        const constraints = dedupePowerList([
            ...(matched?.constraints ?? []),
            ...(raw.constraints ?? []),
        ]).slice(0, 18);
        const consequences = dedupePowerList([
            ...(matched?.consequences ?? []),
            ...(raw.consequences ?? []),
        ]).slice(0, 18);
        const relatedEntries = Array.from(
            new Set([...(matched?.relatedEntries ?? []), ...(raw.relatedEntries ?? [])]),
        ).filter(id => id !== linkedId && allEntryIds.has(id));

        const parsed = WorldEntrySchema.safeParse({
            id: linkedId,
            category: 'power',
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
            mergedByName.set(nameKey, pickBetterPowerCandidate(existingCandidate, candidate));
        }
    }

    const ranked = Array.from(mergedByName.values())
        .sort((a, b) => {
            const scoreDiff = powerEntryScore(b) - powerEntryScore(a);
            if (scoreDiff !== 0) return scoreDiff;
            return a.name.localeCompare(b.name, 'zh-CN');
        })
        .slice(0, maxItems);

    const validIds = new Set([
        ...allEntries.filter(item => item.category !== 'power').map(item => item.id),
        ...ranked.map(item => item.id),
    ]);

    return ranked.map(item => ({
        ...item,
        relatedEntries: item.relatedEntries.filter(id => id !== item.id && validIds.has(id)),
    }));
}

export async function replacePowerEntries(params: {
    novelId: string;
    novelManager: NovelManager;
    nextPowerEntries: WorldEntry[];
    existingWorldEntries: WorldEntry[];
}): Promise<void> {
    const { novelId, novelManager, nextPowerEntries, existingWorldEntries } = params;
    await replaceWorldCategoryEntries({
        novelId,
        novelManager,
        category: 'power',
        nextCategoryEntries: nextPowerEntries,
        existingWorldEntries,
    });
}
