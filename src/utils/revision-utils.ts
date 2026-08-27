import type { CharacterProfile, WorldEntry } from '../novel/types.js';
import type { QualityGateReport } from '../pipeline/quality-gate.js';
import { buildQualityGateFixHints } from '../pipeline/quality-gate.js';
import type { StylePreset } from '../pipeline/chapter-enhancement.js';

export function buildRevisionCharacterContext(characters: CharacterProfile[]): string | undefined {
    if (characters.length === 0) return undefined;
    const lines = characters
        .slice(0, 10)
        .map((character) => {
            const traits = character.personalityTraits.slice(0, 3).join('、');
            const summary = [
                `角色：${character.name}`,
                character.role ? `定位：${character.role}` : '',
                character.personality ? `性格：${character.personality}` : '',
                traits ? `特征：${traits}` : '',
                character.motivation ? `动机：${character.motivation}` : '',
                character.currentState ? `当前状态：${character.currentState}` : '',
            ]
                .filter(Boolean)
                .join('；');
            return `- ${summary}`;
        });
    return `以下是角色约束，请保持行为一致并解释变化动机：\n${lines.join('\n')}`;
}

export function buildRevisionWorldContext(worldEntries: WorldEntry[]): string | undefined {
    const reusableEntries = worldEntries.filter((entry) => !entry.tags.includes('auto-generated'));
    if (reusableEntries.length === 0) return undefined;
    const lines = reusableEntries
        .slice(0, 12)
        .map((entry) => `- ${entry.name}（${entry.category}）：${entry.description.slice(0, 80)}`);
    return `以下是世界观约束，请避免与既有设定冲突：\n${lines.join('\n')}`;
}

export function buildResizeFeedback(opts: {
    mode: 'compress' | 'expand';
    currentWordCount: number;
    targetWordCount: number;
    preserveNotes?: string;
}): string {
    const { mode, currentWordCount, targetWordCount, preserveNotes } = opts;
    const ratio = Math.round((targetWordCount / currentWordCount) * 100);

    if (mode === 'compress') {
        return [
            `## 缩写任务（最高优先级）`,
            `当前章节约 ${currentWordCount} 字，你必须将其缩写到 ${targetWordCount} 字左右（约为原文的 ${ratio}%）。`,
            ``,
            `### ⚠️ 字数硬性约束`,
            `- **目标字数：${targetWordCount} 字，允许误差 ±10%，即 ${Math.floor(targetWordCount * 0.9)}-${Math.ceil(targetWordCount * 1.1)} 字**`,
            `- 这是最重要的约束，必须严格遵守，超出范围视为任务失败`,
            `- 不要试图保留所有内容，大幅删减是本次任务的核心目标`,
            ``,
            `### 缩写原则`,
            `- **保留所有关键剧情节点**：不得删除任何推动主线的事件、转折或冲突`,
            `- **保留所有角色互动的核心内容**：关键对话保留，但可精简冗余的对话轮次`,
            `- **保留说话人标记**：所有 (#角色名) 标记必须保留`,
            `- **保留退场标记**：所有 (#死亡:角色名) 和 (#退场:角色名) 标记必须保留`,
            `- **精简方向**：大幅压缩环境描写、删减重复的心理活动、合并相似的过渡段落、收紧对话节奏、删除不影响剧情的次要场景细节`,
            `- **不得新增**：不要添加原文没有的情节、角色或对话`,
            `- **保持文风一致**：缩写后的文字风格应与原文保持一致`,
            preserveNotes ? `\n### 用户特别要求\n${preserveNotes}` : '',
        ].filter(Boolean).join('\n');
    } else {
        return [
            `## 扩写任务（最高优先级）`,
            `当前章节约 ${currentWordCount} 字，你必须将其扩写到 ${targetWordCount} 字左右（约为原文的 ${ratio}%）。`,
            ``,
            `### ⚠️ 字数硬性约束`,
            `- **目标字数：${targetWordCount} 字，允许误差 ±10%，即 ${Math.floor(targetWordCount * 0.9)}-${Math.ceil(targetWordCount * 1.1)} 字**`,
            `- 这是最重要的约束，必须严格遵守，不足视为任务失败`,
            `- 你需要在原文基础上大量补充细节和描写`,
            ``,
            `### 扩写原则`,
            `- **不得改变已有剧情走向**：所有原文中的事件、对话、转折必须保留`,
            `- **保留说话人标记**：所有 (#角色名) 标记必须保留`,
            `- **保留退场标记**：所有 (#死亡:角色名) 和 (#退场:角色名) 标记必须保留`,
            `- **扩写方向**：丰富场景描写（五感细节）、深化角色心理活动、扩展关键对话的潜台词和情感层次、增加过渡段落让节奏更自然`,
            `- **不得新增主线剧情**：不要添加新的剧情转折或重大事件，只在已有框架内填充细节`,
            `- **保持文风一致**：扩写后的文字风格应与原文保持一致`,
            `- **避免注水**：每个新增段落都应有存在价值，不要为凑字数而重复描写`,
            preserveNotes ? `\n### 用户特别要求\n${preserveNotes}` : '',
        ].filter(Boolean).join('\n');
    }
}

export function roundRevisionScore(value: number): number {
    return Math.round(value * 10) / 10;
}

export function toRevisionQualitySnapshot(report: QualityGateReport): {
    overallScore: number;
    structureScore: number;
    styleScore: number;
    emotionScore: number;
    findingsCount: number;
    passed: boolean;
    summary: string;
} {
    return {
        overallScore: report.overallScore,
        structureScore: report.structureScore,
        styleScore: report.styleScore,
        emotionScore: report.emotionScore,
        findingsCount: report.findings.length,
        passed: report.passed,
        summary: report.summary,
    };
}

export function isRevisionQualityBetter(next: QualityGateReport, current: QualityGateReport): boolean {
    if (next.overallScore !== current.overallScore) {
        return next.overallScore > current.overallScore;
    }
    if (next.passed !== current.passed) {
        return next.passed;
    }
    if (next.findings.length !== current.findings.length) {
        return next.findings.length < current.findings.length;
    }
    const nextComposite = next.structureScore + next.styleScore + next.emotionScore;
    const currentComposite = current.structureScore + current.styleScore + current.emotionScore;
    return nextComposite > currentComposite;
}

export function buildRevisionQualityBoostFeedback(params: {
    originalFeedback: string;
    beforeQuality: QualityGateReport;
    afterQuality: QualityGateReport;
    minExpectedDelta: number;
    roundNumber: number;
    stylePreset?: StylePreset;
    scenePlan?: string;
}): string {
    const currentDelta = roundRevisionScore(params.afterQuality.overallScore - params.beforeQuality.overallScore);
    const remainingDelta = Math.max(1, roundRevisionScore(params.minExpectedDelta - currentDelta));
    const fixHints = buildQualityGateFixHints(params.afterQuality, params.stylePreset, params.scenePlan);

    return [
        `## 最高优先级：用户修订要求（必须严格遵守）`,
        params.originalFeedback,
        '',
        `## 辅助目标：质量补强（第 ${params.roundNumber} 轮）`,
        `在完整落实用户要求的前提下，尝试提升质量门禁得分。`,
        `当前总分 ${params.afterQuality.overallScore}，首轮变化 ${currentDelta >= 0 ? '+' : ''}${currentDelta}，期望再提升 ${remainingDelta} 分。`,
        '以下门禁短板可作为润色参考，但不得与用户要求冲突：',
        fixHints,
    ].join('\n');
}

/**
 * 从读者评价中提取评分
 * 尝试匹配常见格式：8/10、评分：7.5、得分 8 分等
 */
export function extractReaderScore(feedback: string): number | undefined {
    if (!feedback)
        return undefined;
    const jsonScore = extractStructuredOverallScore(feedback);
    if (jsonScore != null) {
        return jsonScore;
    }
    const overallScoreMatch = feedback.match(/"overallScore"\s*:\s*(\d+(?:\.\d+)?)/);
    if (overallScoreMatch) {
        const score = parseFloat(overallScoreMatch[1]);
        if (score >= 0 && score <= 10)
            return score;
    }
    // 匹配 "X/10" 格式
    const slashMatch = feedback.match(/(\d+(?:\.\d+)?)\s*[/／]\s*10/);
    if (slashMatch) {
        const score = parseFloat(slashMatch[1]);
        if (score >= 0 && score <= 10)
            return score;
    }
    // 匹配 "评分：X" 或 "得分：X" 或 "总评：X" 格式
    const labelMatch = feedback.match(/(?:评分|得分|总评|总分|打分)[：:]\s*(\d+(?:\.\d+)?)/);
    if (labelMatch) {
        const score = parseFloat(labelMatch[1]);
        if (score >= 0 && score <= 10)
            return score;
    }
    // 匹配 "X 分" 格式
    const fenMatch = feedback.match(/(\d+(?:\.\d+)?)\s*分/);
    if (fenMatch) {
        const score = parseFloat(fenMatch[1]);
        if (score >= 0 && score <= 10)
            return score;
    }
    return undefined;
}

function extractStructuredOverallScore(feedback: string): number | undefined {
    const jsonMatch = feedback.match(/```json\s*([\s\S]*?)```/) ?? feedback.match(/(\{[\s\S]*\})/);
    const payload = jsonMatch?.[1];
    if (!payload)
        return undefined;
    try {
        const parsed = JSON.parse(payload) as { overallScore?: unknown };
        const score = Number(parsed.overallScore);
        return Number.isFinite(score) && score >= 0 && score <= 10 ? score : undefined;
    } catch {
        return undefined;
    }
}
