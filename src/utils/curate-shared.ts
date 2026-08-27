import { randomUUID } from 'node:crypto';
import type { WorldEntry } from '../novel/types.js';
import type { NovelManager } from '../novel/novel-manager.js';

export function asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
}

export function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map(item => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
            .filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(/[；;、，,\n]/)
            .map(item => item.trim())
            .filter(Boolean);
    }
    return [];
}

export function toStringRecord(value: unknown): Record<string, string> {
    const rec = asRecord(value);
    if (!rec) return {};
    const entries = Object.entries(rec)
        .map(([k, v]) => [k.trim(), typeof v === 'string' ? v.trim() : String(v ?? '').trim()] as const)
        .filter(([k, v]) => k.length > 0 && v.length > 0);
    return Object.fromEntries(entries);
}

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    if (chunkSize <= 0) return [items];
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
}

export function normalizeOptionalUuid(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
        return undefined;
    }
    return trimmed;
}

export function isUuidString(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function dedupePowerList(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of values) {
        const normalized = raw.trim();
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }
    return result;
}

export function readFirstCultureDetail(details: Record<string, string>, keys: string[]): string {
    for (const key of keys) {
        const value = details[key];
        if (!value) continue;
        const trimmed = value.trim();
        if (trimmed) return trimmed;
    }
    return '';
}

export async function replaceWorldCategoryEntries(params: {
    novelId: string;
    novelManager: NovelManager;
    category: WorldEntry['category'];
    nextCategoryEntries: WorldEntry[];
    existingWorldEntries: WorldEntry[];
}): Promise<void> {
    const { novelId, novelManager, category, nextCategoryEntries, existingWorldEntries } = params;
    const existingCategoryEntries = existingWorldEntries.filter(item => item.category === category);
    const otherEntries = existingWorldEntries.filter(item => item.category !== category);
    const otherEntryIds = new Set(otherEntries.map(item => item.id));
    const adjustedCategoryEntries = nextCategoryEntries.map((entry) => {
        if (otherEntryIds.has(entry.id)) {
            return { ...entry, id: randomUUID() };
        }
        return entry;
    });
    const validIds = new Set([...otherEntryIds, ...adjustedCategoryEntries.map(item => item.id)]);

    const prunedOtherEntries = otherEntries
        .map((entry) => {
            const nextRelated = Array.from(
                new Set(entry.relatedEntries.filter(id => id !== entry.id && validIds.has(id))),
            );
            const unchanged = nextRelated.length === entry.relatedEntries.length
                && nextRelated.every((id, index) => id === entry.relatedEntries[index]);
            if (unchanged) return null;
            return { ...entry, relatedEntries: nextRelated };
        })
        .filter((entry): entry is WorldEntry => Boolean(entry));

    const normalizedCategoryEntries = adjustedCategoryEntries.map(entry => ({
        ...entry,
        relatedEntries: Array.from(
            new Set(entry.relatedEntries.filter(id => id !== entry.id && validIds.has(id))),
        ),
    }));

    for (const item of existingCategoryEntries) {
        try {
            await novelManager.deleteWorldEntry(novelId, item.id);
        }
        catch {
            // 忽略并发导致的已删除情况
        }
    }

    for (const item of prunedOtherEntries) {
        await novelManager.saveWorldEntry(novelId, item);
    }
    for (const item of normalizedCategoryEntries) {
        await novelManager.saveWorldEntry(novelId, item);
    }
}
