import type { ChapterMemoryPersistenceAudit } from '../novel/types.js';

export type MemoryPersistencePatch = {
    chapterIndexed?: boolean;
    digestIndexed?: boolean;
    factIndexed?: boolean;
    threadIndexed?: boolean;
    threadIndexStatus?: 'indexed' | 'no-snapshots' | 'failed';
    threadSnapshotCount?: number;
    truthFilesAligned?: boolean;
    digestFailureStage?: 'parse' | 'generation' | 'index';
    digestOutputChars?: number;
    digestOutputHead?: string;
    digestOutputTail?: string;
    warnings?: string[];
};

const RESOLVED_WARNING_BY_FIELD: ReadonlyArray<{
    field: keyof Pick<
        MemoryPersistencePatch,
        'chapterIndexed' | 'digestIndexed' | 'factIndexed' | 'threadIndexed' | 'truthFilesAligned'
    >;
    warnings: readonly string[];
}> = [
    {
        field: 'chapterIndexed',
        warnings: ['chapter vector indexing failed'],
    },
    {
        field: 'digestIndexed',
        warnings: [
            'chapter digest parse failed',
            'chapter digest generation failed',
            'chapter digest indexing failed',
        ],
    },
    {
        field: 'factIndexed',
        warnings: ['fact graph indexing failed'],
    },
    {
        field: 'threadIndexed',
        warnings: ['plot thread snapshot indexing failed'],
    },
    {
        field: 'truthFilesAligned',
        warnings: ['truth files are not aligned after story-state update'],
    },
];

function buildResolvedWarningSet(patch: MemoryPersistencePatch): Set<string> {
    const resolved = new Set<string>();
    for (const rule of RESOLVED_WARNING_BY_FIELD) {
        if (patch[rule.field] === true) {
            for (const warning of rule.warnings) {
                resolved.add(warning);
            }
        }
    }
    return resolved;
}

export function mergeMemoryPersistenceAudit(
    previous: ChapterMemoryPersistenceAudit | undefined,
    chapterNumber: number,
    patch: MemoryPersistencePatch,
    updatedAt: string,
): ChapterMemoryPersistenceAudit {
    const resolvedWarnings = buildResolvedWarningSet(patch);
    const warnings = [...new Set([
        ...(previous?.warnings ?? []),
        ...(patch.warnings ?? []),
    ])].filter(warning => !resolvedWarnings.has(warning));

    return {
        mode: 'observe',
        chapterNumber,
        chapterIndexed: patch.chapterIndexed ?? previous?.chapterIndexed,
        digestIndexed: patch.digestIndexed ?? previous?.digestIndexed,
        factIndexed: patch.factIndexed ?? previous?.factIndexed,
        threadIndexed: patch.threadIndexed ?? previous?.threadIndexed,
        threadIndexStatus: patch.threadIndexStatus ?? previous?.threadIndexStatus,
        threadSnapshotCount: patch.threadSnapshotCount ?? previous?.threadSnapshotCount,
        truthFilesAligned: patch.truthFilesAligned ?? previous?.truthFilesAligned,
        digestFailureStage: patch.digestIndexed === true
            ? undefined
            : patch.digestFailureStage ?? previous?.digestFailureStage,
        digestOutputChars: patch.digestIndexed === true
            ? undefined
            : patch.digestOutputChars ?? previous?.digestOutputChars,
        digestOutputHead: patch.digestIndexed === true
            ? undefined
            : patch.digestOutputHead ?? previous?.digestOutputHead,
        digestOutputTail: patch.digestIndexed === true
            ? undefined
            : patch.digestOutputTail ?? previous?.digestOutputTail,
        warnings,
        updatedAt,
    };
}
