/**
 * Finalize Pipeline Merge Handlers
 *
 * Contains functions for parsing merge results and applying character updates.
 */

import { randomUUID } from 'node:crypto';
import { detectCharacterStatus } from '../utils/character-status.js';
import { MERGE_SEPARATOR } from './finalize-constants.js';
import {
    mergeArchivedMilestoneSummary,
    mergeChapterHistory,
    mergeDistinctText,
    mergeGrowthMilestones,
} from './character-profile-merge.js';

/**
 * Parse Agent output for JSON after ---MERGE_RESULT--- separator
 */
export function parseMergeResult(raw: string, fallback: any): any {
    const sepIdx = raw.indexOf(MERGE_SEPARATOR);
    if (sepIdx === -1) {
        console.warn('[定稿管线] 未找到 ---MERGE_RESULT--- 分隔符');
        return fallback;
    }
    const jsonStr = raw.slice(sepIdx + MERGE_SEPARATOR.length).trim();
    try {
        return JSON.parse(jsonStr);
    }
    catch (err) {
        // 尝试提取被 markdown 代码块包裹的 JSON
        const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            try {
                return JSON.parse(codeBlockMatch[1].trim());
            }
            catch {
                // 继续到下面的错误处理
            }
        }
        console.warn('[定稿管线] JSON 解析失败:', err instanceof Error ? err.message : err);
        return fallback;
    }
}

/**
 * Apply Agent update instructions to existing character profile
 */
export function applyCharacterUpdate(existing: any, action: any, timestamp: string): any {
    const updated = { ...existing, updatedAt: timestamp };
    // 每章只保留一个最新状态，重复定稿时替换同章记录。
    updated.currentState = mergeChapterHistory(existing.currentState, action.currentState);
    // 根据 currentState 同步 status 字段
    updated.status = detectCharacterStatus(updated.currentState);
    // 以下字段只在空缺时补充
    if (action.gender && !existing.gender) {
        updated.gender = action.gender;
    }
    if (action.age && !existing.age) {
        updated.age = action.age;
    }
    if (action.personality && !existing.personality) {
        updated.personality = action.personality;
    }
    if (action.appearance && !existing.appearance) {
        updated.appearance = action.appearance;
    }
    if (action.backstory) {
        updated.backstory = mergeDistinctText(existing.backstory, action.backstory);
    }
    if (action.speechStyle && !existing.speechStyle) {
        updated.speechStyle = action.speechStyle;
    }
    if (action.motivation && !existing.motivation) {
        updated.motivation = action.motivation;
    }
    if (action.arc) {
        updated.arc = mergeDistinctText(existing.arc, action.arc);
    }
    // abilities 和 personalityTraits 追加去重
    if (action.abilities && action.abilities.length > 0) {
        const existingSet = new Set(existing.abilities);
        const newAbilities = action.abilities.filter((a: any) => !existingSet.has(a));
        updated.abilities = [...existing.abilities, ...newAbilities];
    }
    if (action.personalityTraits && action.personalityTraits.length > 0) {
        const existingSet = new Set(existing.personalityTraits);
        const newTraits = action.personalityTraits.filter((t: any) => !existingSet.has(t));
        updated.personalityTraits = [...existing.personalityTraits, ...newTraits];
    }
    // relationships 追加去重（按 targetId 去重，新关系覆盖同 target 的旧关系）
    if (action.relationships && action.relationships.length > 0) {
        const relMap = new Map(existing.relationships.map((r: any) => [r.targetId, r]));
        for (const rel of action.relationships) {
            // 基线角色：保留既有关系，仅新增尚未记录的 targetId，
            // 防止后期漂移设定（如"断碑坐标修复锚点"）覆盖核心关系描述
            if (existing.baseline && relMap.has(rel.targetId)) continue;
            relMap.set(rel.targetId, rel);
        }
        updated.relationships = Array.from(relMap.values());
    }
    // persona（公私面具）：空缺时补充
    if (action.persona) {
        const ep = existing.persona || {};
        updated.persona = {
            publicPersona: ep.publicPersona || action.persona.publicPersona || '',
            privatePersona: ep.privatePersona || action.persona.privatePersona || '',
            maskTrigger: ep.maskTrigger || action.persona.maskTrigger || '',
        };
    }
    // psychology（心理画像）：空缺时补充，数组追加去重
    if (action.psychology) {
        const ep = existing.psychology || {};
        updated.psychology = {
            worldview: ep.worldview || action.psychology.worldview || '',
            copingMechanisms: [...new Set([...(ep.copingMechanisms || []), ...(action.psychology.copingMechanisms || [])])],
            emotionalTriggers: [...new Set([...(ep.emotionalTriggers || []), ...(action.psychology.emotionalTriggers || [])])],
        };
    }
    // socialIdentity（社会身份）：空缺时补充
    if (action.socialIdentity) {
        const es = existing.socialIdentity || {};
        updated.socialIdentity = {
            faction: es.faction || action.socialIdentity.faction || '',
            socialClass: es.socialClass || action.socialIdentity.socialClass || '',
            reputation: es.reputation || action.socialIdentity.reputation || '',
        };
    }
    // symbolism（象征系统）：空缺时补充
    if (action.symbolism) {
        const es = existing.symbolism || {};
        updated.symbolism = {
            symbolObject: es.symbolObject || action.symbolism.symbolObject || '',
            recurringMotif: es.recurringMotif || action.symbolism.recurringMotif || '',
            themeWord: es.themeWord || action.symbolism.themeWord || '',
        };
    }
    // growthTrack（成长轨迹）：里程碑追加，创伤和承诺按 AI 输出替换
    if (action.growthTrack) {
        const eg = existing.growthTrack || { milestones: [], archivedMilestonesSummary: '', unresolvedTrauma: [], pendingPromises: [] };
        let allMilestones = mergeGrowthMilestones(eg.milestones, action.growthTrack.milestones);
        let archivedSummary = eg.archivedMilestonesSummary || '';

        // 里程碑上限 50，超出部分归档为摘要文本
        const MILESTONE_CAP = 50;
        if (allMilestones.length > MILESTONE_CAP) {
            // 按章节号排序，保留最近的 50 条
            allMilestones.sort((a, b) => a.chapter - b.chapter);
            const overflow = allMilestones.slice(0, allMilestones.length - MILESTONE_CAP);
            allMilestones = allMilestones.slice(-MILESTONE_CAP);
            const overflowText = overflow
                .map(m => `第${m.chapter}章: ${m.event}${m.insight ? ` (${m.insight})` : ''}`)
                .join('; ');
            archivedSummary = mergeArchivedMilestoneSummary(archivedSummary, overflowText);
        }

        updated.growthTrack = {
            milestones: allMilestones,
            archivedMilestonesSummary: archivedSummary,
            // 基线角色：创伤与承诺不被 AI 整组替换，保留既有记录，防止漂移覆盖
            unresolvedTrauma: existing.baseline
                ? (eg.unresolvedTrauma ?? [])
                : (action.growthTrack.unresolvedTrauma ?? eg.unresolvedTrauma ?? []),
            pendingPromises: existing.baseline
                ? (eg.pendingPromises ?? [])
                : (action.growthTrack.pendingPromises ?? eg.pendingPromises ?? []),
        };
    }
    return updated;
}

/**
 * Create new character profile from Agent create instructions
 */
export function createCharacterFromAction(action: any, timestamp: string): any {
    return {
        id: randomUUID(),
        name: action.name,
        aliases: [],
        role: action.role || 'supporting',
        gender: action.gender,
        age: action.age,
        appearance: action.appearance || '',
        personality: action.personality || '',
        personalityTraits: action.personalityTraits || [],
        speechStyle: action.speechStyle || '',
        speechExamples: [],
        backstory: action.backstory || '',
        motivation: action.motivation || '',
        abilities: action.abilities || [],
        relationships: action.relationships || [],
        drives: {
            want: action.motivation || '',
            need: '',
            taboo: [],
        },
        personalityModel: {
            traits: action.personalityTraits || [],
            innerContradictions: [],
            moralBoundary: [],
        },
        speechDNA: {
            lexicon: [],
            tempo: 'mid',
            tone: action.speechStyle ? [action.speechStyle] : [],
            tics: [],
        },
        ttsProfile: {
            baseVoice: 'default',
            prosodyRange: {
                rate: [0.9, 1.1],
                pitch: [-2, 2],
            },
            emotionMap: {},
        },
        arc: action.arc || '',
        currentState: action.currentState || '',
        persona: action.persona || undefined,
        psychology: action.psychology || undefined,
        socialIdentity: action.socialIdentity || undefined,
        symbolism: action.symbolism || undefined,
        growthTrack: action.growthTrack || undefined,
        tags: ['auto-extracted'],
        voiceDesignStatus: 'none',
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}
