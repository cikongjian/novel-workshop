import { randomUUID } from 'node:crypto';
import { getConfig } from '../config/index.js';
import { buildCharacterStateSnapshots } from '../novel/character-state-snapshot.js';
import { extractChapterHighlights } from '../novel/character-highlight-extractor.js';
import { extractChapterRelations } from '../novel/character-relation-extractor.js';
import { extractCharacterEvents } from '../novel/character-event-extractor.js';
import { extractChapterFacts } from '../novel/chapter-fact-extractor.js';
import { extractAndCreateMissingSpeakers } from '../novel/speaker-extractor.js';
import { evolveCharactersAuto } from '../novel/character-auto-evolver.js';
import { extractExitMarkers, stripExitMarkers } from '../utils/character-status.js';
import { analyzePacing, detectMonotony } from './pacing-analyzer.js';
import { analyzeForeshadowing, buildForeshadowingContextHints } from './foreshadowing-tracker.js';
import { planRecoveryPaths, analyzeForeshadowingGraph, buildForeshadowingGraphContext } from './foreshadowing-graph.js';
import { analyzeFinalizeNeed } from './finalize-diff-analyzer.js';
import type { FinalizeMode } from './finalize-diff-analyzer.js';
import type { Chapter, ChapterPacing } from '../novel/types.js';
import type { AgentOutput } from '../agents/types.js';
import { buildChapterCost } from '../cost/build-chapter-cost.js';
import { buildMergeAvoidList, type NameRegistryDeps } from '../novel/name-registry.js';

// Import constants and utilities from modularized files
import {
    DEFAULT_BOOTSTRAP_CHARACTER_STATE,
    MAX_CHARACTERS_FOR_AGENT,
    MAX_WORLD_ENTRIES_FOR_AGENT,
    CURATION_FACTION_RE,
    CURATION_POWER_RE,
    CURATION_CULTURE_RE,
    CURATION_HISTORY_RE,
} from './finalize-constants.js';

import {
    normalizeForeshadowingHint,
    pickHigherForeshadowingPriority,
    selectTopCharacters,
    selectTopWorldEntries,
    extractBootstrapCharacterNames,
} from './finalize-utils.js';

import {
    parseMergeResult,
    applyCharacterUpdate,
    createCharacterFromAction,
} from './finalize-merge-handlers.js';
import {
    buildCreatedWorldEntryFromMerge,
    buildUpdatedWorldEntryFromMerge,
    getWorldMergeActionName,
    isFactionActionForKnownCharacter,
} from './world-merge-entry.js';
import { stripUnconfirmedWorldSections } from './world-builder-guidance.js';
import { auditChapterNarrativeUsage } from './narrative-audit.js';
import { persistWorldUsageUpdates } from './world-usage-tracker.js';


/**
 * 定稿合并管线
 *
 * 编排 3 个专家 Agent 并行运行：
 * 1. 角色档案专家（character-merger）
 * 2. 世界观专家（world-merger）
 * 3. 剧情分析师（plot-analyst）
 *
 * 各 Agent 输出分析过程（流式显示）+ ---MERGE_RESULT--- + JSON 结果
 * 管线解析 JSON 并执行合并操作
 */
export class FinalizePipeline {
    agents;
    novelManager;
    model;
    novelMemory;
    constructor(agents: any, novelManager: any, model: any, novelMemory?: any) {
        this.agents = agents;
        this.novelManager = novelManager;
        this.model = model;
        this.novelMemory = novelMemory;
    }
    async tryIndexCharacter(novelId: string, character: any): Promise<void> {
        if (!this.novelMemory)
            return;
        try {
            await this.novelMemory.indexCharacter(novelId, character);
        }
        catch {
            // 记忆索引失败不影响主流程
        }
    }
    async tryIndexWorldEntry(novelId: string, entry: any): Promise<void> {
        if (!this.novelMemory)
            return;
        try {
            await this.novelMemory.indexWorldEntry(novelId, entry);
        }
        catch {
            // 记忆索引失败不影响主流程
        }
    }
    private async persistEffectiveWorldUsage(
        novelId: string,
        chapterNumber: number,
        chapterContent: string,
        characters: any[],
    ): Promise<void> {
        try {
            const entries = await this.novelManager.getWorldEntries(novelId);
            const audit = auditChapterNarrativeUsage({
                chapterContent,
                worldEntries: entries,
                characters,
            });
            await persistWorldUsageUpdates({
                entries,
                audit,
                chapterNumber,
                saveEntry: entry => this.novelManager.saveWorldEntry(novelId, entry),
                indexEntry: entry => this.tryIndexWorldEntry(novelId, entry),
            });
        }
        catch (err) {
            console.warn('[定稿管线] 世界知识使用记录失败:', err instanceof Error ? err.message : err);
        }
    }
    private async saveChapterPreservingLatestDiagnostics(novelId: string, chapter: Chapter): Promise<void> {
        const latestChapter = await this.novelManager.getChapter(novelId, chapter.chapterNumber).catch(() => null);
        if (latestChapter?.diagnostics) {
            chapter.diagnostics = {
                ...(chapter.diagnostics ?? {}),
                ...latestChapter.diagnostics,
                updatedAt: latestChapter.diagnostics.updatedAt ?? chapter.diagnostics?.updatedAt ?? chapter.updatedAt,
            };
        }
        await this.novelManager.saveChapter(novelId, chapter);
    }
    private canFinalizeChapter(chapter: Chapter): { allowed: boolean; reason?: string } {
        const anchorAudit = chapter.diagnostics?.userDirectionAnchorAudit;
        if (anchorAudit?.warnings?.some(warning => warning.includes('mojibake') || warning.includes('question-mark corrupted'))) {
            return { allowed: false, reason: 'direction-anchors-corrupted' };
        }
        return { allowed: true };
    }
    private async persistFinalizeCost(
        novelId: string,
        chapterNumber: number,
        agentOutputs: AgentOutput[],
        operationLabel: string,
    ) {
        const costSummary = buildChapterCost(novelId, chapterNumber, agentOutputs, {
            operationType: 'finalize',
            operationLabel,
        });
        if (costSummary.totalInputTokens <= 0 && costSummary.totalOutputTokens <= 0) {
            return null;
        }
        await this.novelManager.appendChapterCost(novelId, costSummary);
        return costSummary;
    }
    /**
     * 检测定稿后需要触发的梳理建议
     */
    detectCurationTriggers(params: {
        chapterContent: string;
        worldEntries: any[];
        outlineData: any;
    }): Array<{ curator: string; reason: string; priority: 'high' | 'medium' | 'low' }> {
        const { chapterContent, worldEntries, outlineData } = params;
        const triggers: Array<{ curator: string; reason: string; priority: 'high' | 'medium' | 'low' }> = [];

        const existingNames = new Set(worldEntries.map((e: any) => e.name));

        // 势力关键词检测
        CURATION_FACTION_RE.lastIndex = 0;
        const factionMatches = chapterContent.match(CURATION_FACTION_RE) ?? [];
        const newFactionHits = factionMatches.filter(kw => {
            // 检查关键词前后是否有未建档的名称
            const idx = chapterContent.indexOf(kw);
            const surrounding = chapterContent.slice(Math.max(0, idx - 10), idx + kw.length + 10);
            return !Array.from(existingNames).some(name => surrounding.includes(name));
        });
        if (newFactionHits.length > 0) {
            triggers.push({
                curator: 'faction-culture-architect',
                reason: `检测到 ${newFactionHits.length} 处势力相关关键词，可能存在未建档势力`,
                priority: newFactionHits.length >= 3 ? 'high' : 'medium',
            });
        }

        // 力量体系关键词检测
        CURATION_POWER_RE.lastIndex = 0;
        const powerMatches = chapterContent.match(CURATION_POWER_RE) ?? [];
        if (powerMatches.length > 0) {
            triggers.push({
                curator: 'power-gradient-designer',
                reason: `检测到 ${powerMatches.length} 处力量体系关键词，建议梳理力量等级`,
                priority: powerMatches.length >= 5 ? 'high' : 'medium',
            });
        }

        // 文化关键词检测
        CURATION_CULTURE_RE.lastIndex = 0;
        const cultureMatches = chapterContent.match(CURATION_CULTURE_RE) ?? [];
        if (cultureMatches.length > 0) {
            triggers.push({
                curator: 'culture-curator',
                reason: `检测到 ${cultureMatches.length} 处文化设定关键词，建议梳理文化体系`,
                priority: cultureMatches.length >= 3 ? 'medium' : 'low',
            });
        }

        // 历史引用检测
        CURATION_HISTORY_RE.lastIndex = 0;
        const historyMatches = chapterContent.match(CURATION_HISTORY_RE) ?? [];
        if (historyMatches.length > 0) {
            triggers.push({
                curator: 'history-curator',
                reason: `检测到 ${historyMatches.length} 处历史引用关键词，建议梳理历史时间线`,
                priority: historyMatches.length >= 3 ? 'medium' : 'low',
            });
        }

        // 未回收伏笔数量检测
        const unresolvedCount = (outlineData.foreshadowing ?? [])
            .filter((f: any) => !f.isResolved).length;
        if (unresolvedCount > 10) {
            triggers.push({
                curator: 'foreshadowing-curator',
                reason: `当前有 ${unresolvedCount} 条未回收伏笔，建议梳理伏笔回收计划`,
                priority: unresolvedCount > 20 ? 'high' : 'medium',
            });
        }

        return triggers;
    }
    /**
     * 判断二次定稿应该使用哪种模式
     */
    private async determineFinalizeMode(
        novelId: string,
        chapterNumber: number,
        currentContent: string,
        characters: any[],
        worldEntries: any[],
    ): Promise<FinalizeMode> {
        try {
            const history = await this.novelManager.getChapterVersions(novelId, chapterNumber);
            // 找最近一条 source='finalize' 的版本
            const lastFinalizedVersion = [...history.versions]
                .reverse()
                .find((v: any) => v.source === 'finalize');
            if (!lastFinalizedVersion) {
                return 'full'; // 首次定稿
            }

            const characterNames = characters.flatMap((c: any) => [c.name, ...(c.aliases || [])]);
            const worldEntryNames = worldEntries.map((e: any) => e.name);

            const result = analyzeFinalizeNeed({
                currentContent,
                previousFinalizedContent: lastFinalizedVersion.content,
                characterNames,
                worldEntryNames,
            });

            return result.mode;
        } catch (err) {
            console.warn('[定稿管线] 智能判断失败，回退到完整模式:', err instanceof Error ? err.message : err);
            return 'full';
        }
    }

    /**
     * 轻量定稿：跳过 3-Agent 管线，只做后处理
     */
    private async quickFinalize(
        chapter: any,
        novelId: string,
        chapterNumber: number,
        _characters: any[],
        _worldEntries: any[],
        _outlineData: any,
        activeModel: any,
        onEvent: any,
    ): Promise<any> {
        const chapterContent = chapter.content;
        const timestamp = new Date().toISOString();
        const stats = { characters: 0, worldEntries: 0, plotThreads: 0, foreshadowing: 0, finalizeMode: 'quick' as const };
        const finalizeAgentOutputs: AgentOutput[] = [];
        // 退场标记扫描
        try {
            const exitMarkers = extractExitMarkers(chapterContent);
            if (exitMarkers.length > 0) {
                const allCharsForExit = await this.novelManager.getCharacters(novelId);
                for (const marker of exitMarkers) {
                    const char = allCharsForExit.find((c: any) =>
                        c.name === marker.name || c.aliases.includes(marker.name)
                    );
                    if (char) {
                        const statusLabel = marker.status === 'dead' ? '已死亡' : '已退场';
                        const stateTag = marker.status === 'dead' ? '【状态：已死亡】' : '【状态：已退场】';
                        if (!char.currentState?.includes(stateTag)) {
                            const exitState = `[第${chapterNumber}章] 正文标记：${statusLabel}。${stateTag}`;
                            char.currentState = char.currentState
                                ? `${char.currentState}\n${exitState}`
                                : exitState;
                            char.status = marker.status;
                            char.updatedAt = timestamp;
                            await this.novelManager.saveCharacter(novelId, char);
                            await this.tryIndexCharacter(novelId, char);
                        }
                    }
                }
                chapter.content = stripExitMarkers(chapter.content);
            }
        } catch (err) {
            console.warn('[定稿管线·快速] 退场标记扫描失败:', err instanceof Error ? err.message : err);
        }

        // 说话人候选提取
        try {
            await extractAndCreateMissingSpeakers(this.novelManager, novelId, chapterNumber, chapterContent);
        } catch { /* 不影响主流程 */ }

        // 章节摘要重新生成（内容有变化）
        try {
            const summaryMessages: Array<{ role: string; content: string }> = [
                { role: 'system', content: '你是专业小说编辑。将以下章节压缩为200-300字前情提要，保留关键情节转折、角色行动和悬念。只输出摘要文本，不要加任何前缀。' },
                { role: 'user', content: chapterContent.slice(0, 8000) },
            ];
            const summaryResp = await activeModel.chat(summaryMessages as any);
            chapter.summary = summaryResp.content.trim().slice(0, 500);
            finalizeAgentOutputs.push({
                agentRole: 'writing-assistant',
                content: summaryResp.content,
                metadata: {
                    latencyMs: 0,
                    inputTokens: summaryResp.usage.inputTokens,
                    outputTokens: summaryResp.usage.outputTokens,
                    model: summaryResp.model,
                    provider: activeModel.provider,
                },
                timestamp,
            });
        } catch (err) {
            console.warn('[定稿管线·快速] 章节摘要生成失败:', err instanceof Error ? err.message : err);
        }

        // 节奏分析（纯本地计算）
        try {
            const profile = analyzePacing(chapterContent);
            const existingPacing = await this.novelManager.getPacing(novelId);
            const allProfiles = existingPacing.map((p: ChapterPacing) => p.profile);
            allProfiles.push(profile);
            const monotonyWarning = detectMonotony(allProfiles);
            const dominant = (Object.entries(profile) as [string, number][])
                .sort((a, b) => b[1] - a[1])[0][0];
            const newPacing = {
                chapterNumber,
                profile,
                dominantType: dominant,
                monotonyWarning,
                analyzedAt: timestamp,
            };
            const updatedPacing = existingPacing.filter((p: ChapterPacing) => p.chapterNumber !== chapterNumber);
            updatedPacing.push(newPacing);
            updatedPacing.sort((a: ChapterPacing, b: ChapterPacing) => a.chapterNumber - b.chapterNumber);
            await this.novelManager.savePacing(novelId, updatedPacing);
        } catch (err) {
            console.warn('[定稿管线·快速] 节奏分析失败:', err instanceof Error ? err.message : err);
        }

        // 更新状态
        await this.persistEffectiveWorldUsage(novelId, chapterNumber, chapter.content, _characters);
        chapter.status = 'finalized';
        chapter.updatedAt = timestamp;
        await this.saveChapterPreservingLatestDiagnostics(novelId, chapter);

        // 梳理建议检测
        let curationTriggers: Array<{ curator: string; reason: string; priority: 'high' | 'medium' | 'low' }> = [];
        try {
            const autoCurateConfig = getConfig().autoCurate;
            if (autoCurateConfig.enabled) {
                const latestOutline = await this.novelManager.getOutline(novelId);
                const latestWorldEntries = await this.novelManager.getWorldEntries(novelId);
                curationTriggers = this.detectCurationTriggers({
                    chapterContent,
                    worldEntries: latestWorldEntries,
                    outlineData: latestOutline,
                });
                for (const trigger of curationTriggers) {
                    onEvent?.({
                        type: 'curator:auto-trigger' as any,
                        agentRole: trigger.curator as any,
                        novelId,
                        chapterNumber,
                        data: JSON.stringify({ curator: trigger.curator, reason: trigger.reason, priority: trigger.priority }),
                        timestamp: new Date().toISOString(),
                    });
                }
            }
        } catch (err) {
            console.warn('[定稿管线·快速] 自动梳理检测失败:', err instanceof Error ? err.message : err);
        }

        const costSummary = await this.persistFinalizeCost(novelId, chapterNumber, finalizeAgentOutputs, '快速定稿');
        return { ...stats, curationTriggers, costSummary };
    }

    /**
     * 执行定稿合并
     */
    async finalize(params: any): Promise<any> {
        const { novelId, chapterNumber, onEvent, modelOverride, force } = params;
        const activeModel = modelOverride ?? this.model;
        // 1. 读取章节数据和已有档案
        const [chapter, novel, characters, worldEntries, outlineData] = await Promise.all([
            this.novelManager.getChapter(novelId, chapterNumber),
            this.novelManager.getNovel(novelId),
            this.novelManager.getCharacters(novelId),
            this.novelManager.getWorldEntries(novelId),
            this.novelManager.getOutline(novelId),
        ]);
        if (!chapter) {
            throw new Error(`第 ${chapterNumber} 章不存在`);
        }
        const finalizeAgentOutputs: AgentOutput[] = [];

        // === 智能定稿模式判断 ===
        const finalizeGate = this.canFinalizeChapter(chapter);
        if (!force && !finalizeGate.allowed) {
            console.warn(`[finalize] skipped novel=${novelId} chapter=${chapterNumber} reason=${finalizeGate.reason}`);
            return {
                characters: 0,
                worldEntries: 0,
                plotThreads: 0,
                foreshadowing: 0,
                finalizeMode: 'skipped',
                skipped: true,
                reason: finalizeGate.reason,
                costSummary: null,
            };
        }

        let finalizeMode: FinalizeMode = 'full';
        if (!force) {
            finalizeMode = await this.determineFinalizeMode(
                novelId, chapterNumber, chapter.content, characters, worldEntries,
            );
        }

        // 广播定稿模式决策
        onEvent?.({
            type: 'finalize:mode',
            agentRole: 'writing-assistant',
            novelId,
            chapterNumber,
            data: JSON.stringify({ mode: finalizeMode }),
            timestamp: new Date().toISOString(),
        });

        // skip 模式：内容完全一致，仅刷新状态
        if (finalizeMode === 'skip') {
            const timestamp = new Date().toISOString();
            await this.persistEffectiveWorldUsage(novelId, chapterNumber, chapter.content, characters);
            chapter.status = 'finalized';
            chapter.updatedAt = timestamp;
            await this.saveChapterPreservingLatestDiagnostics(novelId, chapter);
            return { characters: 0, worldEntries: 0, plotThreads: 0, foreshadowing: 0, finalizeMode, costSummary: null };
        }

        // 定稿前归档当前版本
        if (chapter.content.trim()) {
            await this.novelManager.archiveChapterVersion(novelId, chapterNumber, 'finalize');
        }

        // quick 模式：跳过 3-Agent 管线，只做轻量后处理
        if (finalizeMode === 'quick') {
            return this.quickFinalize(chapter, novelId, chapterNumber, characters, worldEntries, outlineData, activeModel, onEvent);
        }
        // 2. 从 agentComments 中提取各 Agent 的输出
        const charComment = chapter.agentComments.find((c: any) => c.agentRole === 'character')?.comment ?? '';
        const worldCommentRaw = chapter.agentComments.find((c: any) => c.agentRole === 'world-builder')?.comment ?? '';
        const worldComment = stripUnconfirmedWorldSections(worldCommentRaw);
        const outlineComment = chapter.agentComments.find((c: any) => c.agentRole === 'outline')?.comment ?? '';
        const chapterContent = chapter.content;
        const chapterOutlineSummary = outlineData?.chapters
            ?.find((item: any) => item.chapterNumber === chapterNumber)
            ?.summary ?? '';
        const chapterOutlineExtractionText = [chapterOutlineSummary, outlineComment]
            .filter((item: string) => Boolean(item && item.trim()))
            .join('\n');
        // 构建各 Agent 的输入文本
        // 智能取名系统：构建命名避让名单（简版，供 CharacterMerger 建档时检查重名）
        let namingAvoidList: string | undefined;
        if (typeof this.novelManager.listNovels === 'function') {
            const nameRegistryDeps: NameRegistryDeps = {
                listNovels: this.novelManager.listNovels.bind(this.novelManager),
                getCharacters: (novelIdToScan: string) => this.novelManager.getCharacters(novelIdToScan),
            };
            try {
                namingAvoidList = await buildMergeAvoidList(
                    nameRegistryDeps,
                    novelId,
                    characters,
                );
            } catch {
                // 失败时不阻断定稿流程，仅跳过命名约束
            }
        }
        const baseContext = {
            novelId,
            genre: novel.genre,
            novelTitle: novel.title,
            novelSynopsis: novel.synopsis,
            chapterNumber,
            namingConstraints: namingAvoidList,
        };
        // 角色档案专家的输入（裁剪至 top-N，截断长文本字段）
        const topCharacters = selectTopCharacters(characters, chapterContent, MAX_CHARACTERS_FOR_AGENT);
        const charInput = [
            '## 本章角色 Agent 分析',
            charComment || '（无角色分析输出）',
            '',
            '## 本章正文',
            chapterContent.slice(0, 5000) + (chapterContent.length > 5000 ? '\n...（正文过长已截取前5000字）' : ''),
            '',
            `## 已有角色档案（JSON）${characters.length > MAX_CHARACTERS_FOR_AGENT ? `（共${characters.length}人，按相关度取前${MAX_CHARACTERS_FOR_AGENT}）` : ''}`,
            JSON.stringify(topCharacters.map((c: any) => ({
                id: c.id,
                name: c.name,
                aliases: c.aliases,
                role: c.role,
                gender: c.gender,
                age: c.age,
                personality: (c.personality || '').slice(0, 200),
                appearance: (c.appearance || '').slice(0, 200),
                backstory: (c.backstory || '').slice(0, 300),
                speechStyle: c.speechStyle,
                abilities: (c.abilities || []).slice(0, 5),
                personalityTraits: (c.personalityTraits || []).slice(0, 5),
                motivation: (c.motivation || '').slice(0, 200),
                arc: (c.arc || '').slice(0, 200),
                currentState: c.currentState,
                relationships: (c.relationships || []).slice(0, 10),
            })), null, 2),
        ].join('\n');
        // 世界观专家的输入（裁剪至 top-N）
        const filteredWorldEntries = worldEntries.filter((e: any) => !e.tags.includes('auto-generated'));
        const topWorldEntries = selectTopWorldEntries(filteredWorldEntries, chapterContent, MAX_WORLD_ENTRIES_FOR_AGENT);
        const knownCharacterNames = new Set<string>(characters.flatMap((character: any) => [
            character.name,
            ...(character.aliases ?? []),
        ].filter((name): name is string => typeof name === 'string' && name.trim().length > 0)));
        const worldInput = [
            '## 本章世界构建 Agent 分析',
            worldComment || '（无世界观分析输出）',
            '',
            '## 本章正文',
            chapterContent.slice(0, 5000) + (chapterContent.length > 5000 ? '\n...（正文过长已截取前5000字）' : ''),
            '',
            '## 已知角色名称（禁止将这些角色本人创建为 faction）',
            JSON.stringify(Array.from(knownCharacterNames), null, 2),
            '',
            `## 已有世界观条目（JSON）${filteredWorldEntries.length > MAX_WORLD_ENTRIES_FOR_AGENT ? `（共${filteredWorldEntries.length}条，按相关度取前${MAX_WORLD_ENTRIES_FOR_AGENT}）` : ''}`,
            JSON.stringify(topWorldEntries.map((e: any) => ({
                id: e.id,
                name: e.name,
                category: e.category,
                description: e.description.slice(0, 500),
                tags: e.tags,
                ...(e.category === 'geography' ? {
                    geoType: e.details.type || 'other',
                    relatedEntries: e.relatedEntries,
                } : {}),
            })), null, 2),
        ].join('\n');
        // 剧情分析师的输入
        const foreshadowingAnalysis = analyzeForeshadowing({
            foreshadowing: outlineData.foreshadowing,
            currentChapter: chapterNumber,
        });
        const overdueHints = foreshadowingAnalysis.overdue.length > 0
            ? buildForeshadowingContextHints(foreshadowingAnalysis.overdue)
            : '';
        // 伏笔路径规划上下文（让 plot-analyst 知道哪些伏笔已规划在本章回收）
        const graphAnalysis = analyzeForeshadowingGraph({
            foreshadowing: outlineData.foreshadowing,
            currentChapter: chapterNumber,
        });
        const graphHints = buildForeshadowingGraphContext(graphAnalysis, chapterNumber);
        const plotInput = [
            '## 本章故事架构师大纲分析',
            outlineComment || '（无大纲分析输出）',
            '',
            '## 本章正文',
            chapterContent.slice(0, 5000) + (chapterContent.length > 5000 ? '\n...（正文过长已截取前5000字）' : ''),
            '',
            '## 已有情节线索（JSON）',
            JSON.stringify(outlineData.plotThreads, null, 2),
            '',
            '## 已有伏笔（JSON）',
            JSON.stringify(outlineData.foreshadowing, null, 2),
            ...(overdueHints ? [
                '',
                '## 逾期伏笔（请积极判定回收）',
                '以下伏笔已严重逾期，只要本章正文有任何相关推进即可判定为 isResolved=true：',
                overdueHints,
            ] : []),
            ...(graphHints ? [
                '',
                '## 伏笔回收路径规划（按规划路径推进，不要随意提前回收）',
                graphHints,
            ] : []),
        ].join('\n');
        // 运行单个 Agent 的辅助函数
        const runAgent = async (role: any, inputText: string): Promise<any> => {
            const agent = this.agents.get(role);
            if (!agent) {
                throw new Error(`Agent "${role}" 未注册`);
            }
            onEvent?.({
                type: 'agent:start',
                agentRole: role,
                novelId,
                chapterNumber,
                data: '',
                timestamp: new Date().toISOString(),
            });
            const streamCallback = onEvent
                ? (chunk: string) => {
                    onEvent({
                        type: 'agent:chunk',
                        agentRole: role,
                        novelId,
                        chapterNumber,
                        data: chunk,
                        timestamp: new Date().toISOString(),
                    });
                }
                : undefined;
            let output;
            try {
                output = await agent.execute({ ...baseContext, inputText }, activeModel, streamCallback);
            }
            catch (error) {
                onEvent?.({
                    type: 'agent:error',
                    agentRole: role,
                    novelId,
                    chapterNumber,
                    data: error instanceof Error ? error.message : String(error),
                    timestamp: new Date().toISOString(),
                });
                throw error;
            }
            onEvent?.({
                type: 'agent:complete',
                agentRole: role,
                novelId,
                chapterNumber,
                data: output.content,
                timestamp: new Date().toISOString(),
                usage: typeof output.metadata?.inputTokens === 'number'
                  ? {
                        inputTokens: output.metadata.inputTokens as number,
                        outputTokens: output.metadata.outputTokens as number,
                        provider: String(output.metadata.provider ?? ''),
                        model: String(output.metadata.model ?? ''),
                    }
                  : undefined,
            });
            finalizeAgentOutputs.push(output);
            return output;
        };
        // 3. 并行运行 3 个专家 Agent（允许部分失败，保证兜底逻辑仍能执行）
        const settled = await Promise.allSettled([
            runAgent('character-merger', charInput),
            runAgent('world-merger', worldInput),
            runAgent('plot-analyst', plotInput),
        ]);
        const fallbackOutput = (role: string) => ({
            agentRole: role,
            content: '',
            timestamp: new Date().toISOString(),
        });
        const [charRes, worldRes, plotRes] = settled;
        const charOutput = charRes.status === 'fulfilled' ? charRes.value : fallbackOutput('character-merger');
        const worldOutput = worldRes.status === 'fulfilled' ? worldRes.value : fallbackOutput('world-merger');
        const plotOutput = plotRes.status === 'fulfilled' ? plotRes.value : fallbackOutput('plot-analyst');
        if (charRes.status === 'rejected') {
            onEvent?.({
                type: 'agent:chunk',
                agentRole: 'character-merger' as any,
                novelId,
                chapterNumber,
                data: `\n[系统兜底] 角色合并 Agent 执行失败，已跳过（${charRes.reason instanceof Error ? charRes.reason.message : String(charRes.reason)}）\n`,
                timestamp: new Date().toISOString(),
            });
        }
        if (worldRes.status === 'rejected') {
            onEvent?.({
                type: 'agent:chunk',
                agentRole: 'world-merger' as any,
                novelId,
                chapterNumber,
                data: `\n[系统兜底] 世界观合并 Agent 执行失败，已跳过（${worldRes.reason instanceof Error ? worldRes.reason.message : String(worldRes.reason)}）\n`,
                timestamp: new Date().toISOString(),
            });
        }
        if (plotRes.status === 'rejected') {
            onEvent?.({
                type: 'agent:chunk',
                agentRole: 'plot-analyst' as any,
                novelId,
                chapterNumber,
                data: `\n[系统兜底] 剧情合并 Agent 执行失败，已跳过（${plotRes.reason instanceof Error ? plotRes.reason.message : String(plotRes.reason)}）\n`,
                timestamp: new Date().toISOString(),
            });
        }
        // 4. 解析各 Agent 的 JSON 结果并执行合并
        const stats = { characters: 0, worldEntries: 0, plotThreads: 0, foreshadowing: 0 };
        const timestamp = new Date().toISOString();
        // === 角色合并 ===
        try {
            const charActions = parseMergeResult(charOutput.content, []);
            // 第一轮：创建新角色并收集 name→id 映射
            const nameToId = new Map();
            for (const c of characters) {
                nameToId.set(c.name, c.id);
                for (const alias of c.aliases) {
                    nameToId.set(alias, c.id);
                }
            }
            for (const action of charActions) {
                if (action.action === 'update' && action.id) {
                    const existing = characters.find((c: any) => c.id === action.id);
                    if (existing) {
                        const updated = applyCharacterUpdate(existing, action, timestamp);
                        await this.novelManager.saveCharacter(novelId, updated);
                        await this.tryIndexCharacter(novelId, updated);
                        stats.characters++;
                    }
                }
                else if (action.action === 'create' && action.name) {
                    const newChar = createCharacterFromAction(action, timestamp);
                    nameToId.set(action.name, newChar.id);
                    await this.novelManager.saveCharacter(novelId, newChar);
                    await this.tryIndexCharacter(novelId, newChar);
                    stats.characters++;
                }
            }
            // 第二轮：解析 relationships 中以角色名引用的 targetId，替换为实际 ID
            const allChars = await this.novelManager.getCharacters(novelId);
            for (const c of allChars) {
                let changed = false;
                const resolvedRels = c.relationships.map((rel: any) => {
                    // 如果 targetId 不是 UUID 格式，尝试通过角色名匹配
                    if (rel.targetId && !rel.targetId.includes('-')) {
                        const resolvedId = nameToId.get(rel.targetId);
                        if (resolvedId) {
                            changed = true;
                            return { ...rel, targetId: resolvedId };
                        }
                    }
                    return rel;
                });
                if (changed) {
                    const updatedChar = { ...c, relationships: resolvedRels, updatedAt: timestamp };
                    await this.novelManager.saveCharacter(novelId, updatedChar);
                    await this.tryIndexCharacter(novelId, updatedChar);
                }
            }
        }
        catch (err) {
            console.warn('[定稿管线] 角色合并失败:', err instanceof Error ? err.message : err);
        }
        // === 卡牌标签生成（复用共享模块，在角色合并后刷新） ===
        try {
            const { generateCardBlurbs } = await import('./card-blurb-generator.js');
            await generateCardBlurbs(
                {
                    novelManager: this.novelManager,
                    agents: this.agents,
                    modelClient: activeModel,
                },
                {
                    novelId,
                    chapterNumber,
                    chapterContent,
                    genre: novel.genre,
                    novelTitle: novel.title,
                    novelSynopsis: novel.synopsis,
                },
            );
        } catch (err) {
            console.warn('[定稿管线] 卡牌标签生成失败:', err instanceof Error ? err.message : err);
        }
        // === 正文退场标记扫描 ===
        try {
            const exitMarkers = extractExitMarkers(chapterContent);
            if (exitMarkers.length > 0) {
                const allCharsForExit = await this.novelManager.getCharacters(novelId);
                for (const marker of exitMarkers) {
                    const char = allCharsForExit.find((c: any) =>
                        c.name === marker.name || c.aliases.includes(marker.name)
                    );
                    if (char) {
                        const statusLabel = marker.status === 'dead' ? '已死亡' : '已退场';
                        const stateTag = marker.status === 'dead' ? '【状态：已死亡】' : '【状态：已退场】';
                        // 检查 currentState 最新条目是否已有标记
                        if (!char.currentState?.includes(stateTag)) {
                            const exitState = `[第${chapterNumber}章] 正文标记：${statusLabel}。${stateTag}`;
                            char.currentState = char.currentState
                                ? `${char.currentState}\n${exitState}`
                                : exitState;
                            char.status = marker.status;
                            char.updatedAt = timestamp;
                            await this.novelManager.saveCharacter(novelId, char);
                            await this.tryIndexCharacter(novelId, char);
                        }
                    }
                }
                // 从正文中剥离退场标记
                chapter.content = stripExitMarkers(chapter.content);
            }
        }
        catch (err) {
            console.warn('[定稿管线] 退场标记扫描失败:', err instanceof Error ? err.message : err);
        }
        // === 世界观合并 ===
        try {
            const worldActions = parseMergeResult(worldOutput.content, []);
            // 构建名称→ID 映射（已有条目 + 本次新建条目）
            const worldNameToId = new Map();
            for (const entry of worldEntries) {
                worldNameToId.set(entry.name, entry.id);
            }
            // 第一轮：创建/更新条目，收集 name→id 映射
            const pendingRelations = [];
            for (const action of worldActions) {
                if (isFactionActionForKnownCharacter(action, knownCharacterNames)) {
                    console.warn(`[定稿管线] 跳过误分类为势力的角色条目: ${getWorldMergeActionName(action)}`);
                    continue;
                }
                if (action.action === 'update' && action.id) {
                    const existing = worldEntries.find((e: any) => e.id === action.id);
                    if (existing) {
                        const updated = buildUpdatedWorldEntryFromMerge(existing, action, timestamp);
                        await this.novelManager.saveWorldEntry(novelId, updated);
                        await this.tryIndexWorldEntry(novelId, updated);
                        stats.worldEntries++;
                        // 收集待建立的关联
                        if (action.relatedNames && action.relatedNames.length > 0) {
                            pendingRelations.push({ entryId: existing.id, relatedNames: action.relatedNames });
                        }
                    }
                }
                else if (action.action === 'create' && action.name) {
                    const actionName = getWorldMergeActionName(action);
                    const duplicate = actionName
                        ? worldEntries.find((entry: any) => entry.name === actionName)
                        : undefined;
                    if (duplicate) {
                        const updated = buildUpdatedWorldEntryFromMerge(duplicate, action, timestamp);
                        await this.novelManager.saveWorldEntry(novelId, updated);
                        await this.tryIndexWorldEntry(novelId, updated);
                        stats.worldEntries++;
                        if (action.relatedNames && action.relatedNames.length > 0) {
                            pendingRelations.push({ entryId: duplicate.id, relatedNames: action.relatedNames });
                        }
                        continue;
                    }
                    const newEntry = buildCreatedWorldEntryFromMerge(
                        action,
                        chapterNumber,
                        timestamp,
                        randomUUID(),
                    );
                    worldNameToId.set(action.name, newEntry.id);
                    worldEntries.push(newEntry);
                    await this.novelManager.saveWorldEntry(novelId, newEntry);
                    await this.tryIndexWorldEntry(novelId, newEntry);
                    stats.worldEntries++;
                    // 收集待建立的关联
                    if (action.relatedNames && action.relatedNames.length > 0) {
                        pendingRelations.push({ entryId: newEntry.id, relatedNames: action.relatedNames });
                    }
                }
            }
            // 第二轮：解析 relatedNames → relatedEntries（双向关联）
            if (pendingRelations.length > 0) {
                const allEntries = await this.novelManager.getWorldEntries(novelId);
                // 重新构建名称映射（包含本次新建的）
                const nameMap = new Map();
                for (const entry of allEntries) {
                    nameMap.set(entry.name, entry.id);
                }
                const entryMap = new Map();
                for (const entry of allEntries) {
                    entryMap.set(entry.id, entry);
                }
                for (const { entryId, relatedNames } of pendingRelations) {
                    const entry = entryMap.get(entryId);
                    if (!entry)
                        continue;
                    for (const relName of relatedNames) {
                        const targetId = nameMap.get(relName);
                        if (!targetId || targetId === entryId)
                            continue;
                        // 双向添加关联（去重）
                        if (!entry.relatedEntries.includes(targetId)) {
                            entry.relatedEntries.push(targetId);
                        }
                        const target = entryMap.get(targetId);
                        if (target && !target.relatedEntries.includes(entryId)) {
                            target.relatedEntries.push(entryId);
                            const updatedTarget = { ...target, updatedAt: timestamp };
                            await this.novelManager.saveWorldEntry(novelId, updatedTarget);
                            await this.tryIndexWorldEntry(novelId, updatedTarget);
                        }
                    }
                    const updatedEntry = { ...entry, updatedAt: timestamp };
                    await this.novelManager.saveWorldEntry(novelId, updatedEntry);
                    await this.tryIndexWorldEntry(novelId, updatedEntry);
                }
            }
        }
        catch (err) {
            console.warn('[定稿管线] 世界观合并失败:', err instanceof Error ? err.message : err);
        }
        // === 剧情合并 ===
        try {
            const plotActions = parseMergeResult(plotOutput.content, {
                plotThreads: [],
                foreshadowing: [],
            });
            const updatedOutline = { ...outlineData };
            // 处理情节线索
            for (const action of plotActions.plotThreads ?? []) {
                if (action.action === 'update' && action.id) {
                    const idx = updatedOutline.plotThreads.findIndex((t: any) => t.id === action.id);
                    if (idx >= 0) {
                        const existing = updatedOutline.plotThreads[idx];
                        updatedOutline.plotThreads[idx] = {
                            ...existing,
                            status: action.status || existing.status,
                            resolvedInChapter: action.resolvedInChapter ?? existing.resolvedInChapter,
                            notes: action.notes ? `${existing.notes}\n${action.notes}`.trim() : existing.notes,
                        };
                        stats.plotThreads++;
                    }
                }
                else if (action.action === 'create' && action.name) {
                    updatedOutline.plotThreads.push({
                        id: randomUUID(),
                        name: action.name,
                        description: action.description || '',
                        status: action.status || 'planted',
                        plantedInChapter: action.plantedInChapter ?? chapterNumber,
                        relatedCharacters: action.relatedCharacters || [],
                        notes: action.notes || '',
                    });
                    stats.plotThreads++;
                }
            }
            // 处理伏笔
            for (const action of plotActions.foreshadowing ?? []) {
                if (action.action === 'update' && action.id) {
                    const idx = updatedOutline.foreshadowing.findIndex((f: any) => f.id === action.id);
                    if (idx >= 0) {
                        const existing = updatedOutline.foreshadowing[idx];
                        updatedOutline.foreshadowing[idx] = {
                            ...existing,
                            isResolved: action.isResolved ?? existing.isResolved,
                            resolution: action.resolution || existing.resolution,
                            resolvedInChapter: action.resolvedInChapter ?? existing.resolvedInChapter,
                        };
                        stats.foreshadowing++;
                    }
                }
                else if (action.action === 'create' && action.hint) {
                    const normalizedHint = normalizeForeshadowingHint(action.hint);
                    const existingIdx = normalizedHint
                        ? updatedOutline.foreshadowing.findIndex((f: any) =>
                            normalizeForeshadowingHint(f.hint) === normalizedHint)
                        : -1;
                    if (existingIdx >= 0) {
                        const existing = updatedOutline.foreshadowing[existingIdx];
                        updatedOutline.foreshadowing[existingIdx] = {
                            ...existing,
                            // 已有条目优先保留原 hint，避免同义重复扩散
                            priority: pickHigherForeshadowingPriority(existing.priority, action.priority),
                            resolution: action.resolution || existing.resolution,
                            isResolved: action.isResolved ?? existing.isResolved,
                            resolvedInChapter: action.resolvedInChapter ?? existing.resolvedInChapter,
                            relatedPlotThreads: Array.from(new Set([
                                ...(existing.relatedPlotThreads ?? []),
                                ...(action.relatedPlotThreads ?? []),
                            ])),
                            plantedInChapter: Math.min(
                                existing.plantedInChapter ?? chapterNumber,
                                action.plantedInChapter ?? chapterNumber,
                            ),
                        };
                        stats.foreshadowing++;
                        continue;
                    }
                    updatedOutline.foreshadowing.push({
                        id: randomUUID(),
                        hint: action.hint,
                        plantedInChapter: action.plantedInChapter ?? chapterNumber,
                        resolution: action.resolution || '',
                        isResolved: action.isResolved ?? false,
                        relatedPlotThreads: action.relatedPlotThreads || [],
                        priority: action.priority || 'medium',
                    });
                    stats.foreshadowing++;
                }
            }
            // === 大纲章节条目回写 ===
            // 若 outline.chapters 中缺少当前章节条目，从章节数据补建
            const hasChapterEntry = updatedOutline.chapters.some(
                (c: any) => c.chapterNumber === chapterNumber,
            );
            if (!hasChapterEntry) {
                const backfillTitle = chapter.title || `第${chapterNumber}章`;
                const backfillSummary = chapter.summary || chapterContent.slice(0, 300);
                updatedOutline.chapters.push({
                    chapterNumber,
                    title: backfillTitle,
                    summary: backfillSummary,
                    beats: [],
                    tensionTarget: 5,
                    plotThreadsAdvanced: [],
                    keyEvents: [],
                    notes: '[自动回写] 定稿时补建',
                });
                updatedOutline.chapters.sort(
                    (a: any, b: any) => a.chapterNumber - b.chapterNumber,
                );
                (stats as any).outlineBackfill = true;
            }

            await this.novelManager.saveOutline(novelId, updatedOutline);
        }
        catch (err) {
            console.warn('[定稿管线] 剧情合并失败:', err instanceof Error ? err.message : err);
            // 剧情合并失败时，仍尝试回写缺失的大纲章节条目
            try {
                const fallbackOutline = await this.novelManager.getOutline(novelId);
                const hasFallbackEntry = fallbackOutline.chapters.some(
                    (c: any) => c.chapterNumber === chapterNumber,
                );
                if (!hasFallbackEntry) {
                    fallbackOutline.chapters.push({
                        chapterNumber,
                        title: chapter.title || `第${chapterNumber}章`,
                        summary: chapter.summary || chapterContent.slice(0, 300),
                        beats: [],
                        tensionTarget: 5,
                        plotThreadsAdvanced: [],
                        keyEvents: [],
                        notes: '[自动回写] 定稿时补建（剧情合并失败兜底）',
                    });
                    fallbackOutline.chapters.sort(
                        (a: any, b: any) => a.chapterNumber - b.chapterNumber,
                    );
                    await this.novelManager.saveOutline(novelId, fallbackOutline);
                }
            } catch (backfillErr) {
                console.warn('[定稿管线] 大纲回写兜底失败:', backfillErr instanceof Error ? backfillErr.message : backfillErr);
            }
        }
        // 5. 更新章节状态为定稿
        let latestCharacters = await this.novelManager.getCharacters(novelId);

        // 兜底：若合并后仍无角色档案，优先从大纲“出场角色”+ 正文标记补建基础角色
        if (latestCharacters.length === 0) {
            const bootstrapNames = extractBootstrapCharacterNames({
                chapterContent,
                chapterOutlineSummary: chapterOutlineExtractionText,
            });
            if (bootstrapNames.length > 0) {
                for (const [index, name] of bootstrapNames.entries()) {
                    const bootstrapChar = createCharacterFromAction({
                        action: 'create',
                        name,
                        role: index === 0 ? 'protagonist' : 'supporting',
                        currentState: DEFAULT_BOOTSTRAP_CHARACTER_STATE(chapterNumber),
                    }, timestamp);
                    bootstrapChar.firstAppearance = chapterNumber;
                    bootstrapChar.tags = Array.from(new Set([...(bootstrapChar.tags ?? []), 'auto-bootstrap']));
                    await this.novelManager.saveCharacter(novelId, bootstrapChar);
                    await this.tryIndexCharacter(novelId, bootstrapChar);
                    stats.characters++;
                }
                latestCharacters = await this.novelManager.getCharacters(novelId);
                onEvent?.({
                    type: 'agent:chunk',
                    agentRole: 'character-merger',
                    novelId,
                    chapterNumber,
                    data: `\n[系统兜底] 检测到角色档案为空，已补建：${bootstrapNames.join('、')}\n`,
                    timestamp: new Date().toISOString(),
                });
            }
        }

        // 定稿时也执行一次说话人候选提取，避免“直接定稿未触发保存”导致候选池漏检
        try {
            await extractAndCreateMissingSpeakers(
                this.novelManager,
                novelId,
                chapterNumber,
                chapterContent,
            );
        }
        catch {
            // 候选提取失败不影响主流程
        }

        try {
            const snapshots = buildCharacterStateSnapshots({
                novelId,
                chapterNumber,
                chapterContent,
                characters: latestCharacters,
                timestamp,
            });
            for (const snapshot of snapshots) {
                await this.novelManager.saveCharacterStateSnapshot(novelId, snapshot);
            }
            // 提取角色金句与高光场面（粉丝向卡片内容，纯本地提取，复用 snapshot 的 isCritical）
            try {
                const highlights = extractChapterHighlights({
                    chapterContent,
                    characters: latestCharacters,
                    snapshots,
                    chapterNumber,
                });
                if (highlights.length > 0) {
                    await this.novelManager.appendCharacterHighlights(novelId, highlights);
                }
            } catch (hlErr) {
                console.warn('[定稿管线] 角色高光提取失败:', hlErr instanceof Error ? hlErr.message : hlErr);
            }
            // 提取角色关系（对话交锋，构建对手戏/羁绊卡）
            try {
                const relations = extractChapterRelations({
                    chapterContent,
                    characters: latestCharacters,
                    snapshots,
                    chapterNumber,
                });
                if (relations.length > 0) {
                    await this.novelManager.appendCharacterRelations(novelId, relations);
                }
            } catch (relErr) {
                console.warn('[定稿管线] 角色关系提取失败:', relErr instanceof Error ? relErr.message : relErr);
            }
        }
        catch (err) {
            console.warn('[定稿管线] 角色状态快照写入失败:', err instanceof Error ? err.message : err);
        }
        // 提取角色事件记忆链
        try {
            const events = extractCharacterEvents({
                novelId,
                chapterNumber,
                chapterContent,
                characters: latestCharacters,
                charMergerOutput: charOutput.content,
                plotAnalystOutput: plotOutput.content,
                timestamp,
            });
            if (events.length > 0) {
                await this.novelManager.appendCharacterEvents(novelId, events);
            }
        }
        catch (err) {
            console.warn('[定稿管线] 角色事件提取失败:', err instanceof Error ? err.message : err);
        }
        // === 伏笔回收路径规划 ===
        // 为未规划路径的伏笔自动生成 plannedResolveChapter / recoveryPath / prerequisites
        try {
            const planOutline = await this.novelManager.getOutline(novelId);
            const foreList = planOutline.foreshadowing ?? [];
            if (foreList.length > 0) {
                const planned = planRecoveryPaths(foreList, {
                    currentChapter: chapterNumber,
                });
                const plannedIds = new Set(planned.map(p => p.id));
                if (planned.length > 0) {
                    const updatedForeshadowing = foreList.map((f: any) => {
                        if (!plannedIds.has(f.id)) return f;
                        const p = planned.find(x => x.id === f.id)!;
                        return {
                            ...f,
                            plannedResolveChapter: p.plannedResolveChapter,
                            recoveryPath: p.recoveryPath,
                            prerequisites: p.prerequisites,
                            planVersion: p.planVersion,
                        };
                    });
                    const updatedPlanOutline = { ...planOutline, foreshadowing: updatedForeshadowing };
                    await this.novelManager.saveOutline(novelId, updatedPlanOutline);
                    const newlyPlanned = planned.filter(p => {
                        const orig = foreList.find((f: any) => f.id === p.id);
                        return !orig?.plannedResolveChapter;
                    });
                    if (newlyPlanned.length > 0) {
                        console.log(
                            `[定稿管线] 伏笔路径规划: 为 ${newlyPlanned.length} 条伏笔生成回收路径`,
                        );
                        for (const p of newlyPlanned) {
                            const orig = foreList.find((f: any) => f.id === p.id);
                            onEvent?.({
                                type: 'foreshadowing:planned' as any,
                                agentRole: 'plot-analyst' as any,
                                novelId,
                                chapterNumber,
                                data: JSON.stringify({
                                    foreshadowingId: p.id,
                                    hint: orig?.hint ?? '',
                                    plannedResolveChapter: p.plannedResolveChapter,
                                    recoveryPath: p.recoveryPath,
                                }),
                                timestamp: new Date().toISOString(),
                            });
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[定稿管线] 伏笔路径规划失败:', err instanceof Error ? err.message : err);
        }
        // === 角色自主演化 ===
        // 基于累积的状态快照（stress/beliefShift/trustChanges/trauma）自动触发性格 V2 字段演化
        try {
            const evolutionResults = await evolveCharactersAuto(
                this.novelManager,
                novelId,
                chapterNumber,
            );
            if (evolutionResults.length > 0) {
                const totalChanges = evolutionResults.reduce((s, r) => s + r.changes.length, 0);
                console.log(
                    `[定稿管线] 角色自主演化: ${evolutionResults.length} 个角色 / ${totalChanges} 项变更`,
                );
                for (const r of evolutionResults) {
                    for (const c of r.changes) {
                        onEvent?.({
                            type: 'character:auto-evolved' as any,
                            agentRole: 'character-merger' as any,
                            novelId,
                            chapterNumber,
                            data: JSON.stringify({
                                characterId: r.characterId,
                                characterName: r.characterName,
                                field: c.field,
                                action: c.action,
                                reason: c.reason,
                            }),
                            timestamp: new Date().toISOString(),
                        });
                    }
                }
            }
        } catch (err) {
            console.warn('[定稿管线] 角色自主演化失败:', err instanceof Error ? err.message : err);
        }
        // 提取章节事实（用于连贯性检查）
        try {
            const worldEntriesForFact = await this.novelManager.getWorldEntries(novelId);
            const fact = extractChapterFacts({
                chapterContent,
                characters: latestCharacters,
                worldEntries: worldEntriesForFact,
            });
            await this.novelManager.saveChapterFact(novelId, chapterNumber, fact);
        }
        catch (err) {
            console.warn('[定稿管线] 章节事实提取失败:', err instanceof Error ? err.message : err);
        }
        // 生成章节前情提要（LLM 压缩）
        try {
            const summaryMessages: Array<{ role: string; content: string }> = [
                { role: 'system', content: '你是专业小说编辑。将以下章节压缩为200-300字前情提要，保留关键情节转折、角色行动和悬念。只输出摘要文本，不要加任何前缀。' },
                { role: 'user', content: chapterContent.slice(0, 8000) },
            ];
            const summaryResp = await activeModel.chat(summaryMessages as any);
            chapter.summary = summaryResp.content.trim().slice(0, 500);
            finalizeAgentOutputs.push({
                agentRole: 'writing-assistant',
                content: summaryResp.content,
                metadata: {
                    latencyMs: 0,
                    inputTokens: summaryResp.usage.inputTokens,
                    outputTokens: summaryResp.usage.outputTokens,
                    model: summaryResp.model,
                    provider: activeModel.provider,
                },
                timestamp,
            });
        }
        catch (err) {
            console.warn('[定稿管线] 章节摘要生成失败:', err instanceof Error ? err.message : err);
        }
        // 节奏分析
        try {
            const profile = analyzePacing(chapterContent);
            const existingPacing = await this.novelManager.getPacing(novelId);
            const allProfiles = existingPacing.map((p: ChapterPacing) => p.profile);
            allProfiles.push(profile);
            const monotonyWarning = detectMonotony(allProfiles);
            const dominant = (Object.entries(profile) as [string, number][])
                .sort((a, b) => b[1] - a[1])[0][0];
            const newPacing = {
                chapterNumber,
                profile,
                dominantType: dominant,
                monotonyWarning,
                analyzedAt: timestamp,
            };
            const updatedPacing = existingPacing.filter((p: ChapterPacing) => p.chapterNumber !== chapterNumber);
            updatedPacing.push(newPacing);
            updatedPacing.sort((a: ChapterPacing, b: ChapterPacing) => a.chapterNumber - b.chapterNumber);
            await this.novelManager.savePacing(novelId, updatedPacing);
        }
        catch (err) {
            console.warn('[定稿管线] 节奏分析失败:', err instanceof Error ? err.message : err);
        }
        await this.persistEffectiveWorldUsage(novelId, chapterNumber, chapter.content, characters);
        chapter.status = 'finalized';
        chapter.updatedAt = timestamp;
        await this.saveChapterPreservingLatestDiagnostics(novelId, chapter);

        // === 定稿后自动梳理建议 ===
        let curationTriggers: Array<{ curator: string; reason: string; priority: 'high' | 'medium' | 'low' }> = [];
        try {
            const autoCurateConfig = getConfig().autoCurate;
            if (autoCurateConfig.enabled) {
                const latestOutline = await this.novelManager.getOutline(novelId);
                const latestWorldEntries = await this.novelManager.getWorldEntries(novelId);
                curationTriggers = this.detectCurationTriggers({
                    chapterContent,
                    worldEntries: latestWorldEntries,
                    outlineData: latestOutline,
                });

                for (const trigger of curationTriggers) {
                    onEvent?.({
                        type: 'curator:auto-trigger' as any,
                        agentRole: trigger.curator as any,
                        novelId,
                        chapterNumber,
                        data: JSON.stringify({ curator: trigger.curator, reason: trigger.reason, priority: trigger.priority }),
                        timestamp: new Date().toISOString(),
                    });
                }
            }
        } catch (err) {
            console.warn('[定稿管线] 自动梳理检测失败:', err instanceof Error ? err.message : err);
        }

        const costSummary = await this.persistFinalizeCost(novelId, chapterNumber, finalizeAgentOutputs, '章节定稿');
        return { ...stats, curationTriggers, finalizeMode, costSummary };
    }
}
