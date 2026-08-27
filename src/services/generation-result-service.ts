import type { NovelManager } from '../novel/novel-manager.js';
import type { NovelMemory } from '../memory/novel-memory.js';
import type { ModelClient } from '../models/types.js';
import type { ChapterGenerationResult } from '../pipeline/types.js';
import type { AgentComment, Chapter, ChapterStatus } from '../novel/types.js';
import type { StoryStateManager } from '../novel/story-state-manager.js';
import { extractReaderScore } from '../utils/revision-utils.js';
import { extractChapterTitle, extractTensionTarget, extractKeyEvents } from '../utils/outline-extractors.js';
import { schedulePostSaveBackgroundTasks } from './generation-background-tasks.js';
import { buildAgentTrace, mergeChapterDiagnostics } from './chapter-generation-diagnostics.js';
import { sanitizeGeneratedTitle } from '../agents/title-generation-strategy.js';
import { buildChapterFallbackTitle } from '../utils/chapter-title-fallback.js';
import { cleanPublicFacingContent } from '../utils/public-facing-content.js';
import {
    clearChapterGenerationFailure,
    recordChapterGenerationFailure,
} from './chapter-generation-failure-store.js';
import { sanitizeAuthorNote } from '../utils/author-note-sanitizer.js';
import type { MemoryContextAudit } from '../pipeline/memory-context-audit.js';
import { buildWorldGateDigest } from './world-gate-diagnostics.js';
import {
    buildChapterDeliveryDiagnostics,
    reconcileDeliveryDiagnostics,
} from './chapter-delivery-diagnostics.js';

/** 每章最多保留的"作者有话说"条数 */
const MAX_AUTHOR_NOTES = 20;

function buildQualityGateDigest(result: ChapterGenerationResult): NonNullable<Chapter['diagnostics']>['qualityGate'] | undefined {
    const report = result.qualityReport;
    if (!report) return undefined;
    return {
        overallScore: report.overallScore,
        structureScore: report.structureScore,
        styleScore: report.styleScore,
        emotionScore: report.emotionScore,
        passed: report.passed,
        summary: report.summary,
        findings: report.findings.map(finding => ({
            code: finding.code,
            level: finding.level,
            message: finding.message,
        })),
    };
}

function resolveMemoryContextAudit(result: ChapterGenerationResult, chapterStatus: ChapterStatus): MemoryContextAudit {
    const fallbackWarning = chapterStatus === 'edited'
        ? 'memory audit pending until final generation result'
        : 'memory audit missing from generation result';
    return result.memoryContextAudit ?? {
        mode: 'observe',
        retriever: 'legacy',
        totalChars: 0,
        promptChars: 0,
        unusedPersistedSources: [],
        emptyPromptSources: [],
        warnings: [fallbackWarning],
        sources: [],
    };
}

function buildGenerationLifecycle(chapterStatus: ChapterStatus, timestamp: string): NonNullable<Chapter['diagnostics']>['generationLifecycle'] {
    const isDraft = chapterStatus === 'edited';
    return {
        mode: 'observe',
        phase: isDraft ? 'draft' : 'final',
        saveFirstMode: isDraft ? true : undefined,
        chapterStatus,
        warnings: isDraft ? ['save-first draft persisted; final generation result is not saved yet'] : [],
        updatedAt: timestamp,
    };
}

function buildUserDirectionAnchorDiagnostic(
    result: ChapterGenerationResult,
    timestamp: string,
): NonNullable<Chapter['diagnostics']>['userDirectionAnchorAudit'] | undefined {
    const audit = result.userDirectionAnchorAudit;
    if (!audit) return undefined;
    return {
        mode: 'observe',
        anchors: audit.anchors,
        presentAnchors: audit.presentAnchors,
        missingAnchors: audit.missingAnchors,
        coverage: audit.coverage,
        shouldRepair: audit.shouldRepair,
        directionChars: audit.directionChars,
        contentChars: audit.contentChars,
        sourceHash: audit.sourceHash,
        directionPreview: audit.directionPreview,
        stage: audit.stage,
        warnings: [
            ...(audit.warnings ?? []),
            ...(audit.shouldRepair ? ['user direction anchors missing from final chapter'] : []),
        ],
        checkedAt: timestamp,
    };
}

function mergeSanitizedAuthorNotes(existingNotes: string[] | undefined, rawNote: string | undefined): string[] | undefined {
    if (!rawNote) return existingNotes;
    const sanitizedNote = sanitizeAuthorNote(rawNote);
    if (!sanitizedNote) return existingNotes;
    return [...(existingNotes ?? []), sanitizedNote].slice(-MAX_AUTHOR_NOTES);
}

/**
 * 关键路径保存：章节正文 + 大纲 + 协作日志
 *
 * 只包含快速的文件 I/O（~1-2 秒），不含 AI 调用和向量索引。
 * 慢操作（标题生成、向量索引、角色快照等）由 schedulePostSaveBackgroundTasks 在后台运行。
 */
export async function saveGenerationResults(
    novelManager: NovelManager,
    novelId: string,
    chapterNumber: number,
    result: ChapterGenerationResult,
    options: {
        chapterStatus?: ChapterStatus;
    } = {},
): Promise<void> {
    const timestamp = new Date().toISOString();
    console.info(`[generation-save] start novel=${novelId} chapter=${chapterNumber} contentChars=${result.chapterContent.length} outlineChars=${result.outline.length}`);
    const chapterStatus = options.chapterStatus ?? 'reviewed';

    if (!result.chapterContent?.trim()) {
        throw new Error(`章节 ${chapterNumber} 生成内容为空，已拒绝落库`);
    }

    // === 1. 保存章节正文 + Agent 评论 ===
    if (result.chapterContent) {
        const publicChapterContent = cleanPublicFacingContent(result.chapterContent);
        if (!publicChapterContent.trim()) {
            throw new Error(`章节 ${chapterNumber} 清洗后正文为空，已拒绝落库`);
        }
        if (publicChapterContent !== result.chapterContent) {
            console.info(`[generation-save] public content cleaned novel=${novelId} chapter=${chapterNumber} beforeChars=${result.chapterContent.length} afterChars=${publicChapterContent.length}`);
        }
        const existingChapter = await novelManager.getChapter(novelId, chapterNumber);
        // 归档当前版本（如果已有内容）
        if (existingChapter?.content.trim()) {
            await novelManager.archiveChapterVersion(novelId, chapterNumber, 'generate');
        }
        // 将所有 Agent 输出转化为评论
        const agentComments: AgentComment[] = result.agentOutputs.map((output: any) => ({
            agentRole: output.agentRole,
            comment: output.content,
            timestamp: output.timestamp,
        }));
        const readerScore = extractReaderScore(result.readerFeedback);
        const diagnostics: Chapter['diagnostics'] = mergeChapterDiagnostics(existingChapter?.diagnostics, {
            startupOpeningStrategy: result.startupOpeningStrategy,
            startupOpeningReport: result.startupOpeningReport,
            startupOpeningGateRewrite: result.startupOpeningGateRewrite,
            chapterLengthGuard: result.chapterLengthGuard,
            qualityGate: buildQualityGateDigest(result),
            worldGate: buildWorldGateDigest(result, timestamp),
            autoRevision: result.autoRevision,
            memoryContextAudit: resolveMemoryContextAudit(result, chapterStatus),
            generationLifecycle: buildGenerationLifecycle(chapterStatus, timestamp),
            userDirectionAnchorAudit: buildUserDirectionAnchorDiagnostic(result, timestamp),
            agentTrace: buildAgentTrace(result.agentOutputs),
        }, timestamp);

        // 从大纲中提取标题（纯文本解析，无 AI 调用）
        // AI 标题生成在后台任务中异步完成后回写
        const recentTitles: string[] = [];
        let novelGenre: string | undefined;
        try {
            const [novelForTitle, ...prevChapters] = await Promise.all([
                novelManager.getNovel(novelId),
                ...Array.from({ length: Math.min(3, chapterNumber - 1) }, (_, i) =>
                    novelManager.getChapter(novelId, chapterNumber - 1 - i).catch(() => null)
                ),
            ]);
            novelGenre = novelForTitle?.genre;
            for (const ch of prevChapters) {
                if (ch?.title) {
                    recentTitles.push(ch.title);
                }
            }
        } catch { /* 忽略获取标题相关数据失败 */ }

        const existingTitle = sanitizeGeneratedTitle(existingChapter?.title || '');
        const initialTitle = existingTitle || buildChapterFallbackTitle({
            outline: result.outline,
            content: publicChapterContent,
            chapterNumber,
        });

        const chapterToSave: Chapter = existingChapter
            ? {
                ...existingChapter,
                title: initialTitle,
                content: publicChapterContent,
                wordCount: publicChapterContent.length,
                status: chapterStatus,
                agentComments,
                readerScore,
                diagnostics,
                scenes: result.scenes ?? existingChapter.scenes,
                sceneMode: result.sceneMode ?? existingChapter.sceneMode,
                authorNotes: mergeSanitizedAuthorNotes(existingChapter.authorNotes, result.authorNote),
                updatedAt: timestamp,
            }
            : {
                novelId,
                chapterNumber,
                title: initialTitle,
                summary: result.outline ?? '',
                content: publicChapterContent,
                wordCount: publicChapterContent.length,
                status: chapterStatus,
                agentComments,
                readerScore,
                diagnostics,
                scenes: result.scenes,
                sceneMode: result.sceneMode,
                authorNotes: mergeSanitizedAuthorNotes([], result.authorNote) ?? [],
                revisionCount: 0,
                createdAt: timestamp,
                updatedAt: timestamp,
            };
        try {
            const [novel, previousChapter] = await Promise.all([
                novelManager.getNovel(novelId),
                chapterNumber > 1 ? novelManager.getChapter(novelId, chapterNumber - 1).catch(() => null) : Promise.resolve(null),
            ]);
            chapterToSave.diagnostics = buildChapterDeliveryDiagnostics({
                chapter: chapterToSave,
                novel,
                previousChapter,
            });
            chapterToSave.diagnostics = reconcileDeliveryDiagnostics(chapterToSave.diagnostics);
        } catch (err) {
            console.warn('[自动保存] 可读性诊断写入失败，不影响主流程', err instanceof Error ? err.message : err);
        }
        await novelManager.saveChapter(novelId, chapterToSave);
        await clearChapterGenerationFailure(novelManager, novelId, chapterNumber).catch((error) => {
            console.warn('[自动保存] 清理章节失败记录失败，不影响正文落库', error instanceof Error ? error.message : error);
        });
        console.info(`[generation-save] chapter persisted novel=${novelId} chapter=${chapterNumber} status=${chapterToSave.status} wordCount=${chapterToSave.wordCount}`);
    }

    // === 2. 保存协作日志 ===
    if (result.collaborationLog && result.collaborationLog.length > 0) {
        try {
            await novelManager.saveCollaborationLog(novelId, chapterNumber, result.collaborationLog);
        } catch (err) {
            console.warn('[自动保存] 协作日志写入失败，不影响主流程', err instanceof Error ? err.message : err);
        }
    }

    // === 3. 更新大纲（追加章节骨架） ===
    if (result.outline) {
        try {
            const outlineData = await novelManager.getOutline(novelId);
            const existingIdx = outlineData.chapters.findIndex((ch: any) => ch.chapterNumber === chapterNumber);
            const chapterOutline = {
                chapterNumber,
                title: extractChapterTitle(result.outline),
                summary: result.outline,
                beats: [],
                tensionTarget: extractTensionTarget(result.outline),
                plotThreadsAdvanced: [],
                keyEvents: extractKeyEvents(result.outline),
                notes: `由故事架构师在生成第 ${chapterNumber} 章时自动创建`,
            };
            if (existingIdx >= 0) {
                outlineData.chapters[existingIdx] = chapterOutline;
            } else {
                outlineData.chapters.push(chapterOutline);
                outlineData.chapters.sort((a: any, b: any) => a.chapterNumber - b.chapterNumber);
            }
            await novelManager.saveOutline(novelId, outlineData);
            console.info(`[generation-save] outline persisted novel=${novelId} chapter=${chapterNumber}`);
        } catch {
            console.warn('[自动保存] 大纲更新失败，不影响主流程');
        }
    }
}

export async function markChapterGenerationFailed(params: {
    novelManager: NovelManager;
    novelId: string;
    chapterNumber: number;
    errorCode: string;
    errorMessage: string;
    retryable: boolean;
}): Promise<void> {
    const updatedAt = new Date().toISOString();
    const existing = await params.novelManager.getChapter(params.novelId, params.chapterNumber);
    await recordChapterGenerationFailure(params.novelManager, params.novelId, {
        chapterNumber: params.chapterNumber,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        retryable: params.retryable,
        updatedAt,
    });
    if (!existing) return;
    const chapter: Chapter = existing;
    chapter.diagnostics = mergeChapterDiagnostics(chapter.diagnostics, {
        generationLifecycle: {
            mode: 'observe',
            phase: 'failed',
            saveFirstMode: chapter.status === 'edited' ? true : undefined,
            chapterStatus: chapter.status,
            warnings: ['chapter generation failed before final result was saved'],
            errorCode: params.errorCode,
            errorMessage: params.errorMessage,
            retryable: params.retryable,
            updatedAt,
        },
    }, updatedAt);
    chapter.updatedAt = updatedAt;
    await params.novelManager.saveChapter(params.novelId, chapter);
}

export async function ensureFailedChapterRecord(params: {
    novelManager: NovelManager;
    novelId: string;
    chapterNumber: number;
    errorMessage: string;
    retryable?: boolean;
}): Promise<void> {
    const { novelManager, novelId, chapterNumber, errorMessage, retryable = true } = params;
    const now = new Date().toISOString();
    const existing = await novelManager.getChapter(novelId, chapterNumber);
    await recordChapterGenerationFailure(novelManager, novelId, {
        chapterNumber,
        errorCode: 'generation_failed',
        errorMessage,
        retryable,
        updatedAt: now,
    });
    if (!existing) return;
    const chapter: Chapter = existing;
    chapter.diagnostics = mergeChapterDiagnostics(chapter.diagnostics, {
        generationLifecycle: {
            mode: 'observe',
            phase: 'failed',
            chapterStatus: chapter.status,
            warnings: [],
            errorCode: 'generation_failed',
            errorMessage,
            retryable,
            updatedAt: now,
        },
    }, now);
    chapter.updatedAt = now;
    await novelManager.saveChapter(novelId, chapter);
}

/**
 * 完整保存：关键路径 + 后台任务
 *
 * 用于单章生成等非批量场景，一次调用完成所有保存。
 * 关键路径同步 await，后台任务 fire-and-forget。
 */
export async function saveGenerationResultsFull(
    novelManager: NovelManager,
    novelMemory: NovelMemory | undefined,
    novelId: string,
    chapterNumber: number,
    result: ChapterGenerationResult,
    agents?: Map<string, any>,
    modelClient?: ModelClient,
    storyStateManager?: StoryStateManager,
): Promise<void> {
    await saveGenerationResults(novelManager, novelId, chapterNumber, result);
    schedulePostSaveBackgroundTasks(
        novelManager, novelMemory, novelId, chapterNumber, result,
        agents, modelClient, storyStateManager,
    );
}
