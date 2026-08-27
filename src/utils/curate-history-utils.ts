import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { WorldEntry as WorldEntrySchema } from '../novel/types.js';
import type { WorldEntry } from '../novel/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { CuratedHistoryItem } from '../server/routes/handlers/world-schemas.js';
import { replaceWorldCategoryEntries } from './curate-shared.js';
import { normalizeCultureNameForCurate } from './curate-culture-utils.js';
import { parseCurateForeshadowingOutput } from './curate-foreshadowing-utils.js';

export function parseCurateHistoryOutput(raw: string): unknown {
    return parseCurateForeshadowingOutput(raw);
}

export function normalizeHistoryNameForCurate(name: string): string {
    return normalizeCultureNameForCurate(name);
}

export type HistoryYearInfo = {
    year: number;
    calendar?: string;
    explicitCalendar: boolean;
    bce: boolean;
};

function trimHistoryCalendarNoise(value: string): string {
    let normalized = value;
    const noisePrefixes = [
        '也为',
        '并为',
        '并于',
        '并在',
        '约在',
        '大约在',
        '大约',
        '截至',
        '至于',
        '至',
        '到',
        '自',
        '从',
        '距',
        '在',
        '于',
        '为',
        '也',
        '并',
    ];
    let changed = true;
    while (changed) {
        changed = false;
        for (const prefix of noisePrefixes) {
            if (normalized.startsWith(prefix) && normalized.length - prefix.length >= 2) {
                normalized = normalized.slice(prefix.length);
                changed = true;
                break;
            }
        }
    }
    return normalized;
}

export function normalizeHistoryCalendarValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.replace(/\s+/g, '').trim();
    if (!normalized) return undefined;
    if (/^(公元|西元|ad|ce|annodomini)$/i.test(normalized)) {
        return /西元/i.test(normalized) ? '西元' : '公元';
    }
    const cleaned = trimHistoryCalendarNoise(normalized);
    const matched = cleaned.match(/([\u4e00-\u9fa5A-Za-z]{1,20}(?:历|纪年|纪元))/);
    if (!matched) return undefined;
    return matched[1].slice(0, 24);
}

export function isGregorianCalendar(value: string | undefined): boolean {
    if (!value) return false;
    const normalized = value.replace(/\s+/g, '').trim().toLowerCase();
    return normalized === '公元'
        || normalized === '西元'
        || normalized === 'ad'
        || normalized === 'ce'
        || normalized === 'annodomini';
}

export function hasExplicitBceMarker(text: string): boolean {
    const raw = text.trim();
    if (!raw) return false;
    if (/公元前\s*\d{1,6}(?:\s*年)?/i.test(raw)) return true;
    if (/(^|[^0-9])前\s*\d{1,6}\s*年/.test(raw)) return true;
    if (/\b(?:bc|bce)\s*-?\d{1,6}\b/i.test(raw)) return true;
    if (/\b-?\d{1,6}\s*(?:bc|bce)\b/i.test(raw)) return true;
    return false;
}

export function extractHistoryYearInfo(value: unknown, options?: { requireMarker?: boolean }): HistoryYearInfo | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const year = Math.trunc(value);
        return {
            year,
            calendar: year < 0 ? '公元' : undefined,
            explicitCalendar: false,
            bce: year < 0,
        };
    }
    if (typeof value !== 'string') return undefined;
    const raw = value.trim();
    if (!raw) return undefined;

    if (options?.requireMarker) {
        const hasMarker = /年|公元|西元|历|纪年|纪元|bc|bce/i.test(raw);
        if (!hasMarker) return undefined;
    }

    const calendarFirstMatch = raw.match(/([\u4e00-\u9fa5A-Za-z]{1,20}(?:历|纪年|纪元))\s*(-?\d{1,6})\s*年?/);
    if (calendarFirstMatch) {
        const calendar = normalizeHistoryCalendarValue(calendarFirstMatch[1]);
        const parsedYear = Number.parseInt(calendarFirstMatch[2], 10);
        if (!Number.isFinite(parsedYear)) return undefined;
        const bce = hasExplicitBceMarker(raw) || parsedYear < 0;
        const year = bce && parsedYear > 0 ? -parsedYear : parsedYear;
        return {
            year,
            calendar,
            explicitCalendar: true,
            bce,
        };
    }

    const yearMatch = raw.match(/(-?\d{1,6})/);
    if (!yearMatch) return undefined;
    const parsedYear = Number.parseInt(yearMatch[1], 10);
    if (!Number.isFinite(parsedYear)) return undefined;
    const bce = hasExplicitBceMarker(raw) || parsedYear < 0;
    const year = bce && parsedYear > 0 ? -parsedYear : parsedYear;

    let calendar = normalizeHistoryCalendarValue(
        raw.match(/(公元|西元)/i)?.[1],
    );
    if (!calendar && bce) {
        calendar = '公元';
    }

    return {
        year,
        calendar,
        explicitCalendar: Boolean(calendar),
        bce,
    };
}

function extractHistoryYearValue(value: unknown): number | undefined {
    return extractHistoryYearInfo(value)?.year;
}

function normalizeHistoryYearText(yearInfo: HistoryYearInfo): string {
    if (yearInfo.calendar && !isGregorianCalendar(yearInfo.calendar)) {
        return `${yearInfo.calendar}${Math.abs(yearInfo.year)}年`;
    }
    if (yearInfo.year < 0 || yearInfo.bce) {
        return `公元前${Math.abs(yearInfo.year)}年`;
    }
    if (yearInfo.explicitCalendar) {
        return `公元${yearInfo.year}年`;
    }
    return `${yearInfo.year}年`;
}

export function normalizeHistoryEraValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    if (!normalized) return undefined;
    return normalized.slice(0, 40);
}

export function extractHistorySequenceValue(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.trunc(value));
    }
    if (typeof value !== 'string') return undefined;
    const raw = value.trim();
    if (!raw) return undefined;
    const matched = raw.match(/(\d{1,6})/);
    if (!matched) return undefined;
    const sequence = Number.parseInt(matched[1], 10);
    if (!Number.isFinite(sequence)) return undefined;
    return Math.max(0, sequence);
}

function normalizeHistorySequenceText(sequence: number): string {
    return String(Math.max(0, Math.trunc(sequence)));
}

export function extractHistoryEraValue(entry: WorldEntry): string | undefined {
    return normalizeHistoryEraValue(entry.details.era)
        ?? normalizeHistoryEraValue(entry.details.纪元)
        ?? normalizeHistoryEraValue(entry.details.朝代);
}

export function extractHistorySequenceFromEntry(entry: WorldEntry): number | undefined {
    return extractHistorySequenceValue(entry.details.sequence)
        ?? extractHistorySequenceValue(entry.details.order)
        ?? extractHistorySequenceValue(entry.details.序号);
}

export function historyEntryScore(entry: WorldEntry): number {
    const yearScore = extractHistoryYearValue(entry.details.year) != null ? 160 : 0;
    const eraScore = extractHistoryEraValue(entry) ? 60 : 0;
    const sequenceScore = extractHistorySequenceFromEntry(entry) != null ? 35 : 0;
    const descriptionScore = entry.description.trim().length;
    const detailsScore = Object.keys(entry.details).length * 20;
    const relatedScore = entry.relatedEntries.length * 8;
    const tagScore = entry.tags.length * 6;
    return yearScore + eraScore + sequenceScore + descriptionScore + detailsScore + relatedScore + tagScore;
}

function pickBetterHistoryCandidate(a: WorldEntry, b: WorldEntry): WorldEntry {
    const aScore = historyEntryScore(a);
    const bScore = historyEntryScore(b);
    if (aScore !== bScore) {
        return aScore >= bScore ? a : b;
    }
    return a.name.length >= b.name.length ? a : b;
}

export function sanitizeCuratedHistoryEntries(params: {
    curated: Array<z.infer<typeof CuratedHistoryItem>>;
    existingHistory: WorldEntry[];
    allEntries: WorldEntry[];
    maxItems: number;
}): WorldEntry[] {
    const { curated, existingHistory, allEntries, maxItems } = params;
    const timestamp = new Date().toISOString();
    const existingById = new Map(existingHistory.map(item => [item.id, item]));
    const existingIdByNameKey = new Map<string, string>();
    for (const item of existingHistory) {
        const key = normalizeHistoryNameForCurate(item.name);
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

        const nameKey = normalizeHistoryNameForCurate(safeName) || randomUUID();
        const byId = raw.id ? existingById.get(raw.id) : undefined;
        const byName = existingIdByNameKey.get(nameKey);
        const matched = byId ?? (byName ? existingById.get(byName) : undefined);
        const linkedId = matched?.id ?? raw.id ?? randomUUID();
        allEntryIds.add(linkedId);

        const mergedDetailsSource = { ...(matched?.details ?? {}), ...raw.details };
        const inferredYear = extractHistoryYearInfo(raw.year)
            ?? extractHistoryYearInfo(raw.details.year)
            ?? extractHistoryYearInfo(safeDescription, { requireMarker: true })
            ?? extractHistoryYearInfo(safeName, { requireMarker: true })
            ?? extractHistoryYearInfo(matched?.details.year);
        if (inferredYear) {
            mergedDetailsSource.year = normalizeHistoryYearText(inferredYear);
            if (inferredYear.calendar && !isGregorianCalendar(inferredYear.calendar)) {
                mergedDetailsSource.calendar = inferredYear.calendar;
            }
        }
        const inferredEra = normalizeHistoryEraValue(raw.era)
            ?? normalizeHistoryEraValue(raw.details.era)
            ?? normalizeHistoryEraValue(raw.details.纪元)
            ?? normalizeHistoryEraValue(raw.details.朝代)
            ?? normalizeHistoryEraValue(matched?.details.era)
            ?? normalizeHistoryEraValue(matched?.details.纪元)
            ?? normalizeHistoryEraValue(matched?.details.朝代);
        if (inferredEra) {
            mergedDetailsSource.era = inferredEra;
        }
        const inferredSequence = extractHistorySequenceValue(raw.sequence)
            ?? extractHistorySequenceValue(raw.details.sequence)
            ?? extractHistorySequenceValue(raw.details.order)
            ?? extractHistorySequenceValue(raw.details.序号)
            ?? extractHistorySequenceValue(matched?.details.sequence)
            ?? extractHistorySequenceValue(matched?.details.order)
            ?? extractHistorySequenceValue(matched?.details.序号);
        if (inferredSequence != null) {
            mergedDetailsSource.sequence = normalizeHistorySequenceText(inferredSequence);
        }

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
        const relatedEntries = Array.from(
            new Set([...(matched?.relatedEntries ?? []), ...raw.relatedEntries]),
        ).filter(id => id !== linkedId && allEntryIds.has(id));

        const parsed = WorldEntrySchema.safeParse({
            id: linkedId,
            category: 'history',
            name: safeName,
            description: safeDescription,
            aliases: matched?.aliases,
            state: matched?.state,
            storyRole: matched?.storyRole,
            constraints: matched?.constraints,
            consequences: matched?.consequences,
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
            mergedByName.set(nameKey, pickBetterHistoryCandidate(existingCandidate, candidate));
        }
    }

    const ranked = Array.from(mergedByName.values())
        .sort((a, b) => {
            const yearInfoA = extractHistoryYearInfo(a.details.year);
            const yearInfoB = extractHistoryYearInfo(b.details.year);
            const calendarA = normalizeHistoryCalendarValue(a.details.calendar) ?? yearInfoA?.calendar;
            const calendarB = normalizeHistoryCalendarValue(b.details.calendar) ?? yearInfoB?.calendar;
            if (calendarA && calendarB && calendarA !== calendarB) {
                return calendarA.localeCompare(calendarB, 'zh-CN');
            }
            if (calendarA && !calendarB) return -1;
            if (!calendarA && calendarB) return 1;
            const yearA = yearInfoA?.year;
            const yearB = yearInfoB?.year;
            if (yearA != null && yearB != null && yearA !== yearB) {
                return yearA - yearB;
            }
            if (yearA != null && yearB == null) return -1;
            if (yearA == null && yearB != null) return 1;
            const eraA = extractHistoryEraValue(a);
            const eraB = extractHistoryEraValue(b);
            if (eraA && eraB && eraA !== eraB) {
                return eraA.localeCompare(eraB, 'zh-CN');
            }
            if (eraA && !eraB) return -1;
            if (!eraA && eraB) return 1;
            const seqA = extractHistorySequenceFromEntry(a);
            const seqB = extractHistorySequenceFromEntry(b);
            if (seqA != null && seqB != null && seqA !== seqB) {
                return seqA - seqB;
            }
            if (seqA != null && seqB == null) return -1;
            if (seqA == null && seqB != null) return 1;
            const scoreDiff = historyEntryScore(b) - historyEntryScore(a);
            if (scoreDiff !== 0) return scoreDiff;
            return a.name.localeCompare(b.name, 'zh-CN');
        })
        .slice(0, maxItems);

    const validIds = new Set([
        ...allEntries.filter(item => item.category !== 'history').map(item => item.id),
        ...ranked.map(item => item.id),
    ]);

    return ranked.map(item => ({
        ...item,
        relatedEntries: item.relatedEntries.filter(id => id !== item.id && validIds.has(id)),
    }));
}

export async function replaceHistoryEntries(params: {
    novelId: string;
    novelManager: NovelManager;
    nextHistoryEntries: WorldEntry[];
    existingWorldEntries: WorldEntry[];
}): Promise<void> {
    const { novelId, novelManager, nextHistoryEntries, existingWorldEntries } = params;
    await replaceWorldCategoryEntries({
        novelId,
        novelManager,
        category: 'history',
        nextCategoryEntries: nextHistoryEntries,
        existingWorldEntries,
    });
}
