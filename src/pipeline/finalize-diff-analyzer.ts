/**
 * 定稿差异分析器
 *
 * 比较当前章节内容与上次定稿内容，判断是否需要重新运行完整的 3-Agent 管线。
 * 通过本地文本比较 + 角色名/世界观条目名匹配，零 API 消耗完成决策。
 */

export type FinalizeMode = 'skip' | 'quick' | 'full';

export interface FinalizeDiffResult {
    /** 定稿模式 */
    mode: FinalizeMode;
    /** 人类可读的决策原因 */
    reason: string;
    /** 变更比例 0~1 */
    changeRatio: number;
    /** 在变更区域命中的角色名/世界观条目名 */
    affectedElements: string[];
}

/** 变更比例阈值：超过此比例认为是大改，直接走 full */
const LARGE_CHANGE_RATIO = 0.05;

/**
 * 分析二次定稿是否需要走完整管线
 */
export function analyzeFinalizeNeed(params: {
    currentContent: string;
    previousFinalizedContent: string;
    characterNames: string[];
    worldEntryNames: string[];
}): FinalizeDiffResult {
    const { currentContent, previousFinalizedContent, characterNames, worldEntryNames } = params;

    // 1. 内容完全一致 → skip
    if (currentContent === previousFinalizedContent) {
        return {
            mode: 'skip',
            reason: '内容与上次定稿完全一致，无需重新处理',
            changeRatio: 0,
            affectedElements: [],
        };
    }

    // 2. 计算变更比例（基于行级 diff）
    const oldLines = previousFinalizedContent.split('\n');
    const newLines = currentContent.split('\n');
    const { changedText, changeRatio } = computeLineDiff(oldLines, newLines);

    // 3. 大比例改动 → full
    if (changeRatio >= LARGE_CHANGE_RATIO) {
        return {
            mode: 'full',
            reason: `内容变更比例 ${(changeRatio * 100).toFixed(1)}% 超过阈值，需要完整分析`,
            changeRatio,
            affectedElements: [],
        };
    }

    // 4. 检查变更文本是否涉及角色名或世界观条目
    const affectedElements = findAffectedElements(changedText, characterNames, worldEntryNames);

    if (affectedElements.length > 0) {
        return {
            mode: 'full',
            reason: `变更涉及故事元素：${affectedElements.join('、')}`,
            changeRatio,
            affectedElements,
        };
    }

    // 5. 小改动且不涉及任何元素 → quick
    return {
        mode: 'quick',
        reason: `仅有少量文字修改（${(changeRatio * 100).toFixed(1)}%），不涉及角色/世界观元素`,
        changeRatio,
        affectedElements: [],
    };
}

/**
 * 简单行级 diff：找出变更行并返回合并的变更文本
 */
function computeLineDiff(
    oldLines: string[],
    newLines: string[],
): { changedText: string; changeRatio: number } {
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    // 新增的行（在新内容中但不在旧内容中）
    const addedLines = newLines.filter(line => !oldSet.has(line));
    // 删除的行（在旧内容中但不在新内容中）
    const removedLines = oldLines.filter(line => !newSet.has(line));

    const changedText = [...addedLines, ...removedLines].join('\n');
    const totalChars = Math.max(
        oldLines.join('\n').length,
        newLines.join('\n').length,
        1, // 避免除零
    );
    const changedChars = changedText.length;
    const changeRatio = changedChars / totalChars;

    return { changedText, changeRatio };
}

/**
 * 在变更文本中查找命中的角色名和世界观条目名
 */
function findAffectedElements(
    changedText: string,
    characterNames: string[],
    worldEntryNames: string[],
): string[] {
    if (!changedText.trim()) return [];

    const affected: string[] = [];

    // 过滤掉太短的名称（1 字的容易误匹配）
    const meaningfulNames = [...characterNames, ...worldEntryNames]
        .filter(name => name.length >= 2);

    for (const name of meaningfulNames) {
        if (changedText.includes(name)) {
            affected.push(name);
        }
    }

    return [...new Set(affected)];
}
