import type { NovelManager } from '../novel/novel-manager.js';
import type { NovelMemory } from '../memory/novel-memory.js';
import type { ModelClient } from '../models/types.js';
import type { ChapterGenerationResult } from '../pipeline/types.js';
import type { StoryStateManager } from '../novel/story-state-manager.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../ai/usage-context.js';
import { generateChapterCharacterData } from './chapter-character-data-service.js';
import { evaluateDigestQuality } from '../pipeline/digest-quality-gate.js';
import { createLogger } from '../utils/logger.js';
import { mergeChapterDiagnostics } from './chapter-generation-diagnostics.js';
import { updateTruthFiles, verifyTruthFilesHealth } from '../memory/truth-files/index.js';
import { getNovelsDir } from '../config/index.js';
import {
    buildStoryStateTrackerDiagnostic,
    parseStoryStateSnapshotCandidate,
} from '../novel/story-state-snapshot-parser.js';
import { normalizeStoryStateSnapshotCandidate } from '../novel/story-state-snapshot-normalizer.js';
import {
    mergeMemoryPersistenceAudit,
    type MemoryPersistencePatch,
} from './memory-persistence-audit.js';
import { ensureChapterPlotThreadSnapshots } from './plot-thread-snapshot-service.js';
import { generateAndPersistChapterTitle } from './chapter-title-background-service.js';
import { reconcileConfirmedCharacterStatusesFromChapter } from './character-status-reconciliation.js';

const logger = createLogger('BackgroundTask');

async function recordMemoryPersistenceAudit(
    novelManager: NovelManager,
    novelId: string,
    chapterNumber: number,
    patch: MemoryPersistencePatch,
): Promise<void> {
    const chapter = await novelManager.getChapter(novelId, chapterNumber);
    if (!chapter) return;
    const updatedAt = new Date().toISOString();
    const previous = chapter.diagnostics?.memoryPersistenceAudit;
    chapter.diagnostics = mergeChapterDiagnostics(chapter.diagnostics, {
        memoryPersistenceAudit: mergeMemoryPersistenceAudit(previous, chapterNumber, patch, updatedAt),
    }, updatedAt);
    chapter.updatedAt = updatedAt;
    await novelManager.saveChapter(novelId, chapter);
}

/**
 * 生成后台任务：向量索引、AI 标题生成、角色状态快照等
 *
 * 全部 fire-and-forget，不阻塞主流程，不影响批量任务状态。
 * 每个子任务独立 try-catch，单个失败不影响其他。
 */
export function schedulePostSaveBackgroundTasks(
    novelManager: NovelManager,
    novelMemory: NovelMemory | undefined,
    novelId: string,
    chapterNumber: number,
    result: ChapterGenerationResult,
    agents?: Map<string, any>,
    modelClient?: ModelClient,
    storyStateManager?: StoryStateManager,
): Promise<void> {
    const usageContext = getAiUsageContext();

    // === 顺序后台任务（互相可能有数据依赖） ===
    const sequentialTask = runWithUsageContext(usageContext, () => runSequentialBackgroundTasks(
        novelManager, novelMemory, novelId, chapterNumber, result, agents, modelClient,
    ));

    // === 独立 fire-and-forget Agent 任务 ===
    scheduleDigestAgent(novelManager, novelMemory, novelId, chapterNumber, result, agents, modelClient, usageContext);
    scheduleArcSummaryAgent(novelManager, novelMemory, novelId, chapterNumber, result, agents, modelClient, usageContext);
    scheduleStoryStateTracker(novelManager, novelId, chapterNumber, result, agents, modelClient, storyStateManager, usageContext);
    return sequentialTask;
}

function runWithUsageContext(
    usageContext: ReturnType<typeof getAiUsageContext>,
    task: () => Promise<void>,
): Promise<void> {
    if (!usageContext) {
        return task();
    }
    return runWithAiUsageContextAsync(usageContext, task);
}

// ============================================================
// 顺序后台任务
// ============================================================

async function runSequentialBackgroundTasks(
    novelManager: NovelManager,
    novelMemory: NovelMemory | undefined,
    novelId: string,
    chapterNumber: number,
    result: ChapterGenerationResult,
    agents?: Map<string, any>,
    modelClient?: ModelClient,
): Promise<void> {
    // 1. 同步小说元数据
    try {
        await novelManager.syncNovelMetadataByChapters(novelId);
    } catch (err) {
        console.warn('[后台任务] 小说元数据同步失败', err instanceof Error ? err.message : err);
    }

    // 2. 章节角色数据：候选池、状态快照、高光/关系/事件、卡片基础状态
    // 该任务不依赖标题/定稿，章节一保存就应尽快落库，避免被 AI 标题等慢任务延迟。
    if (result.chapterContent) {
        try {
            const novel = await novelManager.getNovel(novelId);
            await generateChapterCharacterData(
                {
                    novelManager,
                    novelMemory,
                    agents,
                    modelClient,
                },
                {
                    novelId,
                    chapterNumber,
                    chapterContent: result.chapterContent,
                    novelTitle: novel.title,
                    novelSynopsis: novel.synopsis,
                    genre: novel.genre,
                    agentOutputs: result.agentOutputs,
                },
            );
        } catch {
            console.warn('[后台任务] 章节角色数据生成失败');
        }
    }

    // 3. Confirmed character deaths must reach the profile before the next chapter builds context.
    if (result.chapterContent) {
        try {
            await reconcileConfirmedCharacterStatusesFromChapter({
                novelManager,
                novelMemory,
                novelId,
                chapterNumber,
                chapterContent: result.chapterContent,
            });
        } catch (err) {
            logger.warn('角色死亡状态自动同步失败', {
                chapterNumber,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // 4. AI 标题生成 → 回写章节标题
    if (agents && modelClient && result.chapterContent) {
        const titleAgent = agents.get('title-generator');
        if (!titleAgent) {
            logger.warn('title-generator Agent 未注册，跳过标题生成', { chapterNumber });
        } else {
            try {
                await generateAndPersistChapterTitle({
                    novelManager,
                    novelId,
                    chapterNumber,
                    result,
                    titleAgent,
                    modelClient,
                });
            } catch (err) {
                logger.error('AI 标题生成失败', {
                    chapterNumber,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    // 5. 索引章节到记忆系统
    if (novelMemory && result.chapterContent) {
        try {
            await novelMemory.indexChapter(novelId, chapterNumber, result.chapterContent);
            await recordMemoryPersistenceAudit(novelManager, novelId, chapterNumber, {
                chapterIndexed: true,
            });
        } catch (err) {
            console.warn('[memory:indexChapter] failed', {
                novelId, chapterNumber,
                error: err instanceof Error ? err.message : String(err),
            });
            await recordMemoryPersistenceAudit(novelManager, novelId, chapterNumber, {
                chapterIndexed: false,
                warnings: ['chapter vector indexing failed'],
            }).catch(() => undefined);
        }
    }

    // 6. 事实图谱 + 伏笔快照索引
    if (novelMemory && result.chapterContent) {
        try {
            const factGraph = await novelManager.getFactGraph(novelId);
            await novelMemory.indexFactChapter(novelId, chapterNumber, factGraph);
            await recordMemoryPersistenceAudit(novelManager, novelId, chapterNumber, {
                factIndexed: true,
            });
        } catch {
            console.warn('[后台任务] fact graph indexing failed');
            await recordMemoryPersistenceAudit(novelManager, novelId, chapterNumber, {
                factIndexed: false,
                warnings: ['fact graph indexing failed'],
            }).catch(() => undefined);
        }

        try {
            await ensureChapterPlotThreadSnapshots({
                novelManager,
                novelId,
                chapterNumber,
            });
            const threadSnapshots = await novelManager.getPlotThreadSnapshots(novelId);
            const currentChapterSnapshots = threadSnapshots.filter(
                snapshot => snapshot.chapterNumber === chapterNumber,
            );
            if (currentChapterSnapshots.length > 0) {
                await novelMemory.indexPlotThreadSnapshots(novelId, currentChapterSnapshots);
            }
            await recordMemoryPersistenceAudit(novelManager, novelId, chapterNumber, {
                threadIndexed: currentChapterSnapshots.length > 0,
                threadIndexStatus: currentChapterSnapshots.length > 0 ? 'indexed' : 'no-snapshots',
                threadSnapshotCount: currentChapterSnapshots.length,
            });
        } catch {
            console.warn('[后台任务] plot thread snapshot indexing failed');
            await recordMemoryPersistenceAudit(novelManager, novelId, chapterNumber, {
                threadIndexed: false,
                threadIndexStatus: 'failed',
                warnings: ['plot thread snapshot indexing failed'],
            }).catch(() => undefined);
        }
    }
}

// ============================================================
// 独立 fire-and-forget Agent 任务
// ============================================================

function scheduleDigestAgent(
    novelManager: NovelManager,
    novelMemory: NovelMemory | undefined,
    novelId: string,
    chapterNumber: number,
    result: ChapterGenerationResult,
    agents?: Map<string, any>,
    modelClient?: ModelClient,
    usageContext?: ReturnType<typeof getAiUsageContext>,
): void {
    if (!result.chapterContent || !agents || !modelClient || !novelMemory) return;
    const digestAgent = agents.get('chapter-digest');
    if (!digestAgent) return;

    void runWithUsageContext(usageContext, async () => {
        try {
            const novel = await novelManager.getNovel(novelId);
            const digestResult = await digestAgent.execute(
                {
                    novelId,
                    novelTitle: novel.title,
                    novelSynopsis: novel.synopsis,
                    genre: novel.genre,
                    chapterNumber,
                    outlineContext: result.outline || '',
                    inputText: result.chapterContent,
                },
                modelClient,
            );

            const { parseChapterDigest } = await import('../memory/digest-types.js');
            const digest = parseChapterDigest(digestResult.content);

            if (digest) {
                // 摘要质量门禁
                try {
                    const characters = await novelManager.getCharacters(novelId);
                    const charNames = characters.map(c => c.name);
                    const digestQuality = evaluateDigestQuality(
                        result.chapterContent,
                        digest.plotSummary || '',
                        charNames,
                    );
                    if (!digestQuality.pass) {
                        console.warn(`[摘要质量] 第 ${chapterNumber} 章摘要质量不足（${digestQuality.score}分）：${digestQuality.warnings.join('；')}`);
                    }
                } catch (err) { console.warn('[摘要质量] 质量检测失败', err instanceof Error ? err.message : err); }

                await novelMemory.indexChapterDigest(novelId, chapterNumber, digest);
                await recordMemoryPersistenceAudit(novelManager, novelId, chapterNumber, {
                    digestIndexed: true,
                });

                // 填充 chapter.summary
                if (digest.plotSummary) {
                    try {
                        const chapter = await novelManager.getChapter(novelId, chapterNumber);
                        if (chapter && !chapter.summary) {
                            chapter.summary = digest.plotSummary;
                            chapter.updatedAt = new Date().toISOString();
                            await novelManager.saveChapter(novelId, chapter);
                        }
                    } catch (err) { console.warn('[章节摘要] 摘要回写失败', err instanceof Error ? err.message : err); }

                    // 同步更新大纲条目
                    try {
                        const outlineData = await novelManager.getOutline(novelId);
                        const entry = outlineData.chapters.find((ch: any) => ch.chapterNumber === chapterNumber);
                        if (entry) {
                            entry.summary = digest.plotSummary;
                            if (digest.keyEvents?.length) {
                                entry.keyEvents = digest.keyEvents;
                            }
                            await novelManager.saveOutline(novelId, outlineData);
                        }
                    } catch (err) { logger.warn('大纲回写失败', { error: err instanceof Error ? err.message : err }); }
                }

                logger.debug('章节摘要已生成并索引', { chapterNumber });
            } else {
                logger.warn('章节摘要解析失败', { chapterNumber });
                await recordMemoryPersistenceAudit(novelManager, novelId, chapterNumber, {
                    digestIndexed: false,
                    digestFailureStage: 'parse',
                    digestOutputChars: Array.from(digestResult.content).length,
                    digestOutputHead: digestResult.content.slice(0, 400),
                    digestOutputTail: digestResult.content.length > 400
                        ? digestResult.content.slice(Math.max(0, digestResult.content.length - 400))
                        : undefined,
                    warnings: ['chapter digest parse failed'],
                }).catch(() => undefined);
            }
        } catch (err) {
            logger.warn('章节摘要生成失败', { error: err instanceof Error ? err.message : err });
            await recordMemoryPersistenceAudit(novelManager, novelId, chapterNumber, {
                digestIndexed: false,
                digestFailureStage: 'generation',
                warnings: ['chapter digest generation failed'],
            }).catch(() => undefined);
        }
    });
}

function buildStoryStateJsonRepairInput(rawContent: string, chapterNumber: number): string {
    return [
        `The previous story-state tracker response for chapter ${chapterNumber} could not be parsed as JSON.`,
        'Repair only the JSON snapshot. Do not add analysis, markdown fences, comments, or prose.',
        'Return exactly one valid JSON object after the marker ---STATE_SNAPSHOT---.',
        'Keep the same facts and chapterNumber. Escape all quotes inside strings. Use normal JSON commas and double quotes.',
        'If the previous response was truncated, regenerate a compact complete snapshot instead of preserving every detail.',
        'Hard caps: characters<=8, factions<=6, activeThreads<=8, pendingForeshadowing<=12, causalChains<=8, nextChapterConstraints<=12.',
        'Summarize each string in <=120 Chinese characters. Omit resolved foreshadowing from pendingForeshadowing.',
        'Previous response:',
        rawContent,
    ].join('\n\n');
}

function scheduleArcSummaryAgent(
    novelManager: NovelManager,
    novelMemory: NovelMemory | undefined,
    novelId: string,
    chapterNumber: number,
    result: ChapterGenerationResult,
    agents?: Map<string, any>,
    modelClient?: ModelClient,
    usageContext?: ReturnType<typeof getAiUsageContext>,
): void {
    if (!result.chapterContent || !agents || !modelClient || !novelMemory) return;
    if (chapterNumber % 10 !== 0) return;
    const arcAgent = agents.get('arc-summary');
    if (!arcAgent) return;

    void runWithUsageContext(usageContext, async () => {
        try {
            const arcNumber = chapterNumber / 10;
            const arcStart = chapterNumber - 9;
            const novel = await novelManager.getNovel(novelId);

            const digestParts: string[] = [];
            for (let i = arcStart; i <= chapterNumber; i++) {
                const chapter = await novelManager.getChapter(novelId, i);
                if (chapter?.summary) {
                    digestParts.push(`### 第${i}章\n${chapter.summary}`);
                } else if (chapter?.content) {
                    digestParts.push(`### 第${i}章\n${chapter.content.slice(0, 500)}...`);
                }
            }

            if (digestParts.length < 3) {
                console.warn(`[弧线摘要] 弧线${arcNumber}可用摘要不足（${digestParts.length}章），跳过`);
                return;
            }

            const arcResult = await arcAgent.execute(
                {
                    novelId,
                    novelTitle: novel.title,
                    novelSynopsis: novel.synopsis,
                    genre: novel.genre,
                    userDirection: `弧线编号：${arcNumber}，章节范围：第${arcStart}-${chapterNumber}章`,
                    inputText: digestParts.join('\n\n'),
                },
                modelClient,
            );

            const { parseArcSummary } = await import('../memory/arc-types.js');
            const arc = parseArcSummary(arcResult.content);

            if (arc) {
                arc.arcNumber = arcNumber;
                arc.chapterRange = { start: arcStart, end: chapterNumber };
                await novelMemory.indexArcSummary(novelId, arc);
                logger.debug('弧线摘要已生成并索引', { arcNumber, start: arcStart, end: chapterNumber });
            } else {
                logger.warn('弧线摘要解析失败', { arcNumber });
            }
        } catch (err) {
            logger.warn('弧线摘要生成失败', { error: err instanceof Error ? err.message : err });
        }
    });
}

function scheduleStoryStateTracker(
    novelManager: NovelManager,
    novelId: string,
    chapterNumber: number,
    result: ChapterGenerationResult,
    agents?: Map<string, any>,
    modelClient?: ModelClient,
    storyStateManager?: StoryStateManager,
    usageContext?: ReturnType<typeof getAiUsageContext>,
): void {
    if (!result.chapterContent || !storyStateManager || !agents || !modelClient) return;
    const trackerAgent = agents.get('story-state-tracker');
    if (!trackerAgent) return;

    void runWithUsageContext(usageContext, async () => {
        const recordTruthFileHealth = async (extraWarning?: string): Promise<void> => {
            const truthFileHealth = await verifyTruthFilesHealth(
                novelId,
                getNovelsDir(),
                chapterNumber,
            );
            if (extraWarning) {
                truthFileHealth.aligned = false;
                truthFileHealth.warnings = [...new Set([
                    extraWarning,
                    ...truthFileHealth.warnings,
                ])];
            }
            const chapter = await novelManager.getChapter(novelId, chapterNumber);
            if (chapter) {
                const updatedAt = new Date().toISOString();
                chapter.diagnostics = mergeChapterDiagnostics(chapter.diagnostics, {
                    truthFileHealth,
                }, updatedAt);
                chapter.updatedAt = updatedAt;
                await novelManager.saveChapter(novelId, chapter);
            }
            await recordMemoryPersistenceAudit(novelManager, novelId, chapterNumber, {
                truthFilesAligned: truthFileHealth.aligned,
                warnings: truthFileHealth.aligned ? [] : ['truth files are not aligned after story-state update'],
            }).catch(() => undefined);
        };
        const recordStoryStateTrackerDiagnostic = async (params: {
            rawContent: string;
            parsed: boolean;
            failureReason?: string;
        }): Promise<void> => {
            const chapter = await novelManager.getChapter(novelId, chapterNumber);
            if (!chapter) return;
            const updatedAt = new Date().toISOString();
            chapter.diagnostics = mergeChapterDiagnostics(chapter.diagnostics, {
                storyStateTracker: buildStoryStateTrackerDiagnostic({
                    rawContent: params.rawContent,
                    chapterNumber,
                    parsed: params.parsed,
                    failureReason: params.failureReason,
                }),
            }, updatedAt);
            chapter.updatedAt = updatedAt;
            await novelManager.saveChapter(novelId, chapter);
        };

        try {
            const previousSnapshot = await storyStateManager.getLatestSnapshot(novelId);
            const characters = await novelManager.getCharacters(novelId);
            const characterNames = characters.map((c: any) => c.name);

            const trackerInput = storyStateManager.buildTrackerInput(
                chapterNumber,
                result.chapterContent,
                previousSnapshot,
                characterNames,
            );

            const novel = await novelManager.getNovel(novelId);
            const trackerResult = await trackerAgent.execute(
                {
                    novelId,
                    novelTitle: novel.title,
                    novelSynopsis: novel.synopsis,
                    genre: novel.genre,
                    chapterNumber,
                    inputText: trackerInput,
                },
                modelClient,
            );

            let rawContent = trackerResult.content;
            let parsed = parseStoryStateSnapshotCandidate<any>(rawContent);
            if (!parsed) {
                logger.warn('状态快照 JSON 首次解析失败，尝试一次 JSON 修复重试', { chapterNumber });
                try {
                    const retryResult = await trackerAgent.execute(
                        {
                            novelId,
                            novelTitle: novel.title,
                            novelSynopsis: novel.synopsis,
                            genre: novel.genre,
                            chapterNumber,
                            inputText: buildStoryStateJsonRepairInput(rawContent, chapterNumber),
                        },
                        modelClient,
                    );
                    const retryParsed = parseStoryStateSnapshotCandidate<any>(retryResult.content);
                    if (retryParsed) {
                        rawContent = retryResult.content;
                        parsed = retryParsed;
                    }
                } catch (retryErr) {
                    logger.warn('状态快照 JSON 修复重试失败', {
                        chapterNumber,
                        error: retryErr instanceof Error ? retryErr.message : retryErr,
                    });
                }
            }
                if (parsed) {
                    await recordStoryStateTrackerDiagnostic({
                        rawContent,
                        parsed: true,
                    });
                    normalizeStoryStateSnapshotCandidate(parsed);
                    parsed.createdAt = new Date().toISOString();
                    await storyStateManager.saveSnapshot(novelId, parsed);
                    await storyStateManager.compressIfNeeded(novelId);
                    try {
                        const [charactersForTruth, outlineForTruth] = await Promise.all([
                            novelManager.getCharacters(novelId),
                            novelManager.getOutline(novelId),
                        ]);
                        await updateTruthFiles({
                            novelId,
                            novelsDir: getNovelsDir(),
                            chapterNumber,
                            snapshot: parsed,
                            characters: charactersForTruth,
                            outline: outlineForTruth,
                        });
                        await recordTruthFileHealth();
                    } catch (truthErr) {
                        logger.warn('truth files update after story-state failed', {
                            chapterNumber,
                            error: truthErr instanceof Error ? truthErr.message : truthErr,
                        });
                        try {
                            await recordTruthFileHealth('truth files update after story-state failed');
                        } catch (healthErr) {
                            logger.warn('truth files health record after truth update failed', {
                                chapterNumber,
                                error: healthErr instanceof Error ? healthErr.message : healthErr,
                            });
                        }
                    }
                    logger.debug('章节状态快照已保存', { chapterNumber });
                } else {
                    logger.warn('状态快照 JSON 解析失败', { chapterNumber });
                    try {
                        await recordStoryStateTrackerDiagnostic({
                            rawContent,
                            parsed: false,
                            failureReason: 'parse returned null',
                        });
                    } catch (diagErr) {
                        logger.warn('story-state tracker diagnostic record failed', {
                            chapterNumber,
                            error: diagErr instanceof Error ? diagErr.message : diagErr,
                        });
                    }
                    try {
                        await recordTruthFileHealth('story-state snapshot parse failed');
                    } catch (truthErr) {
                        logger.warn('truth files health record after story-state parse failed', {
                            chapterNumber,
                            error: truthErr instanceof Error ? truthErr.message : truthErr,
                        });
                    }
                }
        } catch (err) {
            logger.warn('状态更新失败', { error: err instanceof Error ? err.message : err });
            try {
                await recordTruthFileHealth('story-state tracker failed');
            } catch (truthErr) {
                logger.warn('truth files health record after story-state failed', {
                    chapterNumber,
                    error: truthErr instanceof Error ? truthErr.message : truthErr,
                });
            }
        }
    });
}
