/**
 * Finalize Pipeline Utility Functions
 *
 * Contains utility functions for character/world selection and foreshadowing.
 */

import {
    FORESHADOWING_PRIORITY_RANK,
    CHARACTER_ROLE_PRIORITY,
    OUTLINE_CHARACTER_LINE_RE,
    INLINE_SPEAKER_MARKER_RE,
    CHARACTER_NAME_SPLIT_RE,
    LEADING_CHARACTER_QUANTIFIER_RE,
    NON_CHARACTER_TOKENS,
} from './finalize-constants.js';

/**
 * Normalize foreshadowing hint for comparison
 */
export function normalizeForeshadowingHint(hint: string): string {
    return String(hint ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[，。！？：；、""'''（）()《》【】\[\]—\-·,.!?;:]/g, '');
}

/**
 * Pick higher foreshadowing priority between two values
 */
export function pickHigherForeshadowingPriority(
    a: 'high' | 'medium' | 'low' | undefined,
    b: 'high' | 'medium' | 'low' | undefined,
): 'high' | 'medium' | 'low' {
    const aVal = a ?? 'medium';
    const bVal = b ?? 'medium';
    return FORESHADOWING_PRIORITY_RANK[aVal] >= FORESHADOWING_PRIORITY_RANK[bVal] ? aVal : bVal;
}

/**
 * Select top characters by importance + content mention count
 */
export function selectTopCharacters(characters: any[], chapterContent: string, limit: number): any[] {
    if (characters.length <= limit) return characters;
    const contentLower = chapterContent.toLowerCase();
    return characters
        .map(c => {
            const rolePri = CHARACTER_ROLE_PRIORITY[c.role] ?? 1;
            const mentioned = (c.name && contentLower.includes(c.name.toLowerCase())) ? 1 : 0;
            const aliasMentioned = (c.aliases ?? []).some((a: string) => a && contentLower.includes(a.toLowerCase())) ? 1 : 0;
            return { c, score: rolePri * 10 + (mentioned + aliasMentioned) * 5 };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(x => x.c);
}

/**
 * Select top world entries by content mention count
 */
export function selectTopWorldEntries(entries: any[], chapterContent: string, limit: number): any[] {
    if (entries.length <= limit) return entries;
    const contentLower = chapterContent.toLowerCase();
    return entries
        .map(e => {
            const mentioned = (e.name && contentLower.includes(e.name.toLowerCase())) ? 2 : 0;
            return { e, score: mentioned };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(x => x.e);
}

/**
 * Normalize bootstrap character name
 */
export function normalizeBootstrapCharacterName(rawName: string): string {
    return String(rawName ?? '')
        .trim()
        .replace(/^[\-\*\d\.\)\(]+/, '')
        .replace(/[【】\[\]「」『』""'']/g, '')
        .replace(/[（(][^）)]*[）)]/g, '')
        .replace(LEADING_CHARACTER_QUANTIFIER_RE, '')
        .trim();
}

/**
 * Check if a name is likely a bootstrap character name
 */
export function isLikelyBootstrapCharacterName(name: string): boolean {
    if (!name) return false;
    if (name.length < 2 || name.length > 12) return false;
    if (!/[\u4e00-\u9fa5A-Za-z]/.test(name)) return false;
    if (NON_CHARACTER_TOKENS.has(name)) return false;
    if (/感染者|蹒跚者|怪物|系统|旁白|宿主/.test(name)) return false;
    if (/[，。,\.]/.test(name)) return false;
    return true;
}

/**
 * Extract bootstrap character names from chapter content and outline
 */
export function extractBootstrapCharacterNames(params: {
    chapterContent: string;
    chapterOutlineSummary?: string;
    limit?: number;
}): string[] {
    const { chapterContent, chapterOutlineSummary, limit = 4 } = params;
    const names: string[] = [];
    const seen = new Set<string>();
    const pushCandidate = (rawName: string) => {
        const normalized = normalizeBootstrapCharacterName(rawName);
        if (!isLikelyBootstrapCharacterName(normalized)) return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        names.push(normalized);
    };

    if (chapterOutlineSummary) {
        OUTLINE_CHARACTER_LINE_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = OUTLINE_CHARACTER_LINE_RE.exec(chapterOutlineSummary)) !== null) {
            match[1]
                .split(CHARACTER_NAME_SPLIT_RE)
                .forEach(pushCandidate);
        }
    }

    INLINE_SPEAKER_MARKER_RE.lastIndex = 0;
    let markerMatch: RegExpExecArray | null;
    while ((markerMatch = INLINE_SPEAKER_MARKER_RE.exec(chapterContent)) !== null) {
        pushCandidate(markerMatch[1]);
    }

    return names.slice(0, limit);
}
