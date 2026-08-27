import type { OutlineData } from '../novel/types.js';
import { inspectGeneratedTitle, sanitizeGeneratedTitle } from '../agents/title-generation-strategy.js';

/**
 * 根据大纲章节数据构建场景计划文本
 */
export function buildScenePlanFromOutlineData(chapterOutline?: OutlineData['chapters'][number]): string | undefined {
    if (!chapterOutline || chapterOutline.keyEvents.length === 0) {
        return undefined;
    }
    return chapterOutline.keyEvents
        .slice(0, 6)
        .map((event, index) => `场景 ${index + 1}：${event}`)
        .join('\n');
}

/**
 * 从大纲文本中提取各场景的紧张度值，计算章节整体紧张度目标
 * 匹配格式：**紧张度**：N、**紧张度**：N（描述）等
 */
export function extractTensionTarget(outlineText: string): number {
    if (!outlineText)
        return 5;
    const tensionPattern = /\*{0,2}紧张度\*{0,2}[：:]\s*(\d+(?:\.\d+)?)/g;
    const tensions = [];
    let match;
    while ((match = tensionPattern.exec(outlineText)) !== null) {
        const value = parseFloat(match[1]);
        if (value >= 0 && value <= 10) {
            tensions.push(value);
        }
    }
    if (tensions.length === 0)
        return 5;
    const avg = tensions.reduce((sum, v) => sum + v, 0) / tensions.length;
    return Math.round(avg * 10) / 10;
}

/**
 * 从大纲文本中提取章节标题
 * 匹配格式：# 第N章：标题、**"标题"**、### 章节主题 等
 */
export function extractChapterTitle(outlineText: string): string {
    if (!outlineText)
        return '';
    // 匹配 "# 第N章：标题"
    const titleMatch = outlineText.match(/^#\s*(?:《[^》]+》)?第\d+章[：:\s]+(.+)$/m);
    if (titleMatch) {
        const title = sanitizeGeneratedTitle(titleMatch[1].trim().replace(/^大纲\s*/, ''));
        if (title)
            return title;
    }
    // 匹配 **"标题"** 或 **"标题"**（兼容中英文引号）
    const quoteMatch = outlineText.match(/\*{2}[""「]([^""」]+)[""」]\*{2}/);
    if (quoteMatch)
        return sanitizeGeneratedTitle(quoteMatch[1]);
    // 匹配 "## 章节主题" 或 "### 章节主题" 后面的首行内容
    const themeMatch = outlineText.match(/#{2,4}\s*章节主题\s*\n+(.+)/);
    if (themeMatch) {
        let theme = themeMatch[1].trim();
        theme = theme.replace(/\*{1,2}/g, '').replace(/[""「」]/g, '');
        const punct = theme.search(/[，。,\.——]/);
        if (punct > 0 && punct <= 20) {
            theme = theme.slice(0, punct);
        }
        else if (theme.length > 20) {
            theme = theme.slice(0, 20);
        }
        const title = sanitizeGeneratedTitle(theme);
        if (title && !inspectGeneratedTitle(title).mechanical)
            return title;
    }
    return '';
}

/**
 * 从大纲文本中提取关键事件（场景标题列表）
 * 匹配格式：#### 场景 N：标题
 */
export function extractKeyEvents(outlineText: string): string[] {
    if (!outlineText)
        return [];
    const scenePattern = /#{1,4}\s*场景\s*\d+[：:]\s*(.+)/g;
    const events = [];
    let match;
    while ((match = scenePattern.exec(outlineText)) !== null) {
        const title = match[1].trim();
        if (title) {
            events.push(title);
        }
    }
    return events;
}
