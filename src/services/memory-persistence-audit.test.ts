import { describe, expect, it } from 'vitest';
import type { ChapterMemoryPersistenceAudit } from '../novel/types.js';
import { mergeMemoryPersistenceAudit } from './memory-persistence-audit.js';

const UPDATED_AT = '2026-07-03T00:00:00.000Z';

function makePreviousAudit(
    overrides: Partial<ChapterMemoryPersistenceAudit> = {},
): ChapterMemoryPersistenceAudit {
    return {
        mode: 'observe',
        chapterNumber: 12,
        chapterIndexed: false,
        digestIndexed: false,
        factIndexed: false,
        threadIndexed: false,
        threadIndexStatus: 'failed',
        threadSnapshotCount: 0,
        truthFilesAligned: false,
        digestFailureStage: 'parse',
        digestOutputChars: 1200,
        digestOutputHead: 'bad digest head',
        digestOutputTail: 'bad digest tail',
        warnings: [
            'chapter vector indexing failed',
            'chapter digest parse failed',
            'fact graph indexing failed',
            'plot thread snapshot indexing failed',
            'truth files are not aligned after story-state update',
            'custom warning',
        ],
        updatedAt: '2026-07-02T00:00:00.000Z',
        ...overrides,
    };
}

describe('mergeMemoryPersistenceAudit', () => {
    it('clears stale warnings and digest failure details for recovered persistence stages', () => {
        const audit = mergeMemoryPersistenceAudit(makePreviousAudit(), 12, {
            chapterIndexed: true,
            digestIndexed: true,
            factIndexed: true,
            threadIndexed: true,
            threadIndexStatus: 'no-snapshots',
            threadSnapshotCount: 0,
            truthFilesAligned: true,
        }, UPDATED_AT);

        expect(audit).toMatchObject({
            chapterNumber: 12,
            chapterIndexed: true,
            digestIndexed: true,
            factIndexed: true,
            threadIndexed: true,
            threadIndexStatus: 'no-snapshots',
            threadSnapshotCount: 0,
            truthFilesAligned: true,
            warnings: ['custom warning'],
            updatedAt: UPDATED_AT,
        });
        expect(audit.digestFailureStage).toBeUndefined();
        expect(audit.digestOutputChars).toBeUndefined();
        expect(audit.digestOutputHead).toBeUndefined();
        expect(audit.digestOutputTail).toBeUndefined();
    });

    it('preserves warnings for persistence stages that have not recovered', () => {
        const audit = mergeMemoryPersistenceAudit(makePreviousAudit(), 12, {
            factIndexed: true,
        }, UPDATED_AT);

        expect(audit.warnings).toEqual([
            'chapter vector indexing failed',
            'chapter digest parse failed',
            'plot thread snapshot indexing failed',
            'truth files are not aligned after story-state update',
            'custom warning',
        ]);
        expect(audit.factIndexed).toBe(true);
        expect(audit.chapterIndexed).toBe(false);
        expect(audit.digestIndexed).toBe(false);
        expect(audit.threadIndexed).toBe(false);
        expect(audit.truthFilesAligned).toBe(false);
    });
});
