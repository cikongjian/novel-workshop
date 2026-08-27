import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Foreshadowing as ForeshadowingSchema } from '../novel/types.js';
import type { Foreshadowing } from '../novel/types.js';
import { CuratedForeshadowingItem } from '../server/routes/handlers/world-schemas.js';

export function parseCurateForeshadowingOutput(raw: string): unknown {
    const trimmed = raw.trim();
    if (!trimmed)
        return {};
    try {
        return JSON.parse(trimmed);
    }
    catch {
        // continue
    }
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlock) {
        try {
            return JSON.parse(codeBlock[1].trim());
        }
        catch {
            // continue
        }
    }
    const jsonObject = trimmed.match(/\{[\s\S]*\}/);
    if (jsonObject) {
        try {
            return JSON.parse(jsonObject[0]);
        }
        catch {
            // continue
        }
    }
    return {};
}

export function normalizeForeshadowingHintForCurate(hint: string): string {
    return hint
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[，。！？：；、"""'''（）()《》【】\[\]—\-·,.!?;:]/g, '');
}

function pickBetterForeshadowingCandidate(a: Foreshadowing, b: Foreshadowing): Foreshadowing {
    if (a.isResolved !== b.isResolved) {
        return a.isResolved ? a : b;
    }
    if (a.priority !== b.priority) {
        const rank = { high: 3, medium: 2, low: 1 };
        return rank[a.priority] >= rank[b.priority] ? a : b;
    }
    const aResolution = a.resolution?.trim().length ?? 0;
    const bResolution = b.resolution?.trim().length ?? 0;
    if (aResolution !== bResolution) {
        return aResolution >= bResolution ? a : b;
    }
    return a.hint.length >= b.hint.length ? a : b;
}

export function sanitizeCuratedForeshadowing(params: {
    curated: Array<z.infer<typeof CuratedForeshadowingItem>>;
    existing: Foreshadowing[];
    plotThreadIds: Set<string>;
    currentChapter: number;
    maxItems: number;
}): Foreshadowing[] {
    const { curated, existing, plotThreadIds, currentChapter, maxItems } = params;
    const existingById = new Map(existing.map(item => [item.id, item]));
    const existingIdByHintKey = new Map<string, string>();
    for (const item of existing) {
        const key = normalizeForeshadowingHintForCurate(item.hint);
        if (key && !existingIdByHintKey.has(key)) {
            existingIdByHintKey.set(key, item.id);
        }
    }

    const mergedByKey = new Map<string, Foreshadowing>();
    for (const raw of curated) {
        const resolvedHint = raw.hint.trim();
        if (!resolvedHint) continue;

        const hintKey = normalizeForeshadowingHintForCurate(resolvedHint) || randomUUID();
        const linkedId = raw.id && existingById.has(raw.id)
            ? raw.id
            : existingIdByHintKey.get(hintKey) ?? randomUUID();

        const safePlanted = Math.max(1, Math.min(raw.plantedInChapter, Math.max(currentChapter, raw.plantedInChapter)));
        const relatedPlotThreads = raw.relatedPlotThreads.filter(id => plotThreadIds.has(id));
        const isResolved = raw.isResolved ?? false;
        const resolvedBaseChapter = (raw.resolvedInChapter ?? currentChapter) || safePlanted;
        const resolvedInChapter = isResolved
            ? Math.max(safePlanted, Math.min(resolvedBaseChapter, Math.max(currentChapter, safePlanted)))
            : undefined;

        const parsedItem = ForeshadowingSchema.safeParse({
            id: linkedId,
            hint: resolvedHint,
            plantedInChapter: safePlanted,
            resolution: raw.resolution ?? '',
            isResolved,
            resolvedInChapter,
            relatedPlotThreads,
            priority: raw.priority ?? 'medium',
        });
        if (!parsedItem.success) continue;

        const candidate = parsedItem.data;
        const existingItem = mergedByKey.get(hintKey);
        if (!existingItem) {
            mergedByKey.set(hintKey, candidate);
        }
        else {
            mergedByKey.set(hintKey, pickBetterForeshadowingCandidate(existingItem, candidate));
        }
    }

    const sanitized = Array.from(mergedByKey.values())
        .sort((a, b) => {
            if (a.plantedInChapter !== b.plantedInChapter) {
                return a.plantedInChapter - b.plantedInChapter;
            }
            return a.hint.localeCompare(b.hint, 'zh-CN');
        })
        .slice(0, maxItems);

    return sanitized;
}
