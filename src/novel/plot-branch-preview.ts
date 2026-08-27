import type { ChatMessage } from '../models/types.js';
import type { CharacterProfile, NovelMetadata, OutlineData, WorldEntry } from './types.js';
import type { PlotBranchNode } from './plot-branch-types.js';

type BuildPlotBranchPreviewMessagesInput = {
  novel: NovelMetadata;
  node: PlotBranchNode;
  outline: OutlineData;
  currentChapterSummary?: string;
  previousChapterSummary?: string;
  characters: CharacterProfile[];
  worldEntries: WorldEntry[];
};

function buildOutlineContext(outline: OutlineData, chapterNumber: number): string {
  return outline.chapters
    .filter(chapter => chapter.chapterNumber <= chapterNumber)
    .slice(-8)
    .map(chapter => (
      `第${chapter.chapterNumber}章 ${chapter.title}\n`
      + `摘要：${chapter.summary || '无'}\n`
      + `关键事件：${chapter.keyEvents.join('、') || '无'}\n`
      + `备注：${chapter.notes || '无'}`
    ))
    .join('\n\n');
}

export function buildPlotBranchPreviewMessages(input: BuildPlotBranchPreviewMessagesInput): ChatMessage[] {
  const characterContext = input.characters
    .slice(0, 12)
    .map(character => (
      `${character.name}（${character.role}）：`
      + `${character.personality || '性格未补充'}；`
      + `动机=${character.motivation || '未补充'}；`
      + `当前状态=${character.currentState || '未补充'}`
    ))
    .join('\n');

  const worldContext = input.worldEntries
    .slice(0, 12)
    .map(entry => `[${entry.category}] ${entry.name}：${entry.description || '无'}`)
    .join('\n');

  const systemPrompt = [
    '你是一位擅长长篇网文分支试写的小说策划兼作者。',
    '你的任务不是重做大纲，而是基于既有正文和指定分支，生成一段可供作者判断方向是否成立的“分支预览”。',
    '输出要求：',
    '1. 直接输出正文式预览，不要 JSON，不要标题，不要解释。',
    '2. 长度控制在 500-900 字，2-5 段。',
    '3. 必须体现该分支会如何改变接下来剧情，而不是重复已有内容。',
    '4. 保持角色口吻、世界设定、章节气质一致。',
    '5. 可以写成“下一章核心场景试写”或“接下来短段落预演”，但必须具体、有戏剧冲突。',
    '6. 禁止使用“（动作）台词”类括号标签写法。',
  ].join('\n');

  const userPrompt = [
    `小说标题：${input.novel.title}`,
    `题材类型：${input.novel.genre || '未设置'}`,
    `小说简介：${input.novel.synopsis || input.novel.description || '无'}`,
    '',
    `当前分支锚点：第${input.node.chapterNumber}章`,
    `分支标题：${input.node.title}`,
    `分支说明：${input.node.description}`,
    input.node.impactPrediction ? `影响预测：${input.node.impactPrediction}` : '',
    input.node.characterImpacts.length > 0
      ? `角色影响：${input.node.characterImpacts.map(item => `${item.name}：${item.impact}`).join('；')}`
      : '',
    '',
    input.previousChapterSummary ? `前一章摘要：${input.previousChapterSummary}` : '',
    input.currentChapterSummary ? `当前章节摘要/正文摘录：${input.currentChapterSummary}` : '',
    '',
    '最近相关大纲：',
    buildOutlineContext(input.outline, input.node.chapterNumber) || '无',
    '',
    characterContext ? `角色资料：\n${characterContext}` : '',
    worldContext ? `世界设定：\n${worldContext}` : '',
    '',
    '请据此写出这个分支一旦被采用，接下来最值得作者判断的一段剧情预览。',
  ].filter(Boolean).join('\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}
