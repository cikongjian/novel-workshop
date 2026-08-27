import type { Chapter } from '../novel/types.js';
import type { GenreDriftAudit } from './genre-drift-audit.js';

export type ChapterReadabilityAudit = {
  readerScore?: number;
  previousReaderScore?: number;
  readerScoreDelta?: number;
  wordCount: number;
  speakerMarkerCount: number;
  dialogueCount: number;
  paragraphCount: number;
  averageParagraphLength: number;
  sceneBreakCount: number;
  silentReactionCount: number;
  silentReactionPer1k: number;
  explanationContrastCount: number;
  explanationContrastPer1k: number;
  qualityGateOverall?: number;
  qualityGateStructure?: number;
  qualityGateEmotion?: number;
  genreDrift?: GenreDriftAudit;
  qualityFloorPassed: boolean;
  issues: string[];
  suggestions: string[];
};

const SPEAKER_MARKER_RE = /[\(\uFF08]\s*[#\uFF03][^()\uFF08\uFF09\n]{1,30}\s*[\)\uFF09]/g;
const DIALOGUE_RE = /[“"「『][^”"」』\n]{2,160}[”"」』]/g;
const SCENE_BREAK_RE = /\n\s*(?:\*\s*\*\s*\*|-{3,}|#{1,4}\s*场景|\d+[\.、]\s*)/g;
const SILENT_REACTION_RE = /(?:没有|没)(?:回答|接话|回头|说话|移开目光)|沉默(?:了?[一二三四五六七八九十\d]+息)?/g;
const EXPLANATION_CONTRAST_RE = /不是|并非|而是|是因为|不是因为|不在[^。！？\n]{1,16}在/g;
const CONCRETE_COST_RE = /受伤|烫伤|烧伤|穿孔|出血|血|痛|疼|气密损失|氧压|生命体征|伤情|代价|裂口|封补|失去|损失/g;
const EXTERNAL_REACTION_RE = /调度|同伴|队友|班组|人群|弹幕|族长|阿骨|虎牙|独耳|Lisa|顾砚舟|林栀|他|她|众人|频道|通讯/g;
const POSITION_PAYOFF_RE = /OA通知|项目负责人|负责人变更|林经理|客户|王总|周维|赵宏|签|确认书|方案|预算|成本|工期|调度权|会议室|工位|项目组|项目交接|同意|点头|改口|站队/g;

function per1k(count: number, chars: number): number {
  if (chars <= 0) return 0;
  return Number((count / (chars / 1000)).toFixed(1));
}

function countMatches(text: string, regex: RegExp): number {
  const matches = text.match(new RegExp(regex.source, 'g'));
  return matches?.length ?? 0;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function auditChapterReadability(params: {
  chapterContent: string;
  readerScore?: number;
  previousReaderScore?: number;
  qualityGate?: NonNullable<Chapter['diagnostics']>['qualityGate'];
  genreDrift?: GenreDriftAudit;
}): ChapterReadabilityAudit {
  const { chapterContent, readerScore, previousReaderScore, qualityGate, genreDrift } = params;
  const paragraphs = splitParagraphs(chapterContent);
  const paragraphChars = paragraphs.reduce((sum, item) => sum + item.length, 0);
  const wordCount = chapterContent.length;
  const speakerMarkerCount = countMatches(chapterContent, SPEAKER_MARKER_RE);
  const dialogueCount = countMatches(chapterContent, DIALOGUE_RE);
  const sceneBreakCount = countMatches(chapterContent, SCENE_BREAK_RE);
  const silentReactionCount = countMatches(chapterContent, SILENT_REACTION_RE);
  const silentReactionPer1k = per1k(silentReactionCount, wordCount);
  const explanationContrastCount = countMatches(chapterContent, EXPLANATION_CONTRAST_RE);
  const explanationContrastPer1k = per1k(explanationContrastCount, wordCount);
  const concreteCostCount = countMatches(chapterContent, CONCRETE_COST_RE);
  const externalReactionCount = countMatches(chapterContent, EXTERNAL_REACTION_RE);
  const positionPayoffCount = countMatches(chapterContent, POSITION_PAYOFF_RE);
  const averageParagraphLength = paragraphs.length > 0
    ? Math.round(paragraphChars / paragraphs.length)
    : 0;

  const issues: string[] = [];
  const suggestions: string[] = [];
  const readerScoreDelta = typeof readerScore === 'number' && typeof previousReaderScore === 'number'
    ? Number((readerScore - previousReaderScore).toFixed(1))
    : undefined;
  const hasConcreteEmotionalSupport = concreteCostCount >= 3
    && externalReactionCount >= 2
    && typeof readerScore === 'number'
    && readerScore >= 7.2;
  const hasPositionPayoffSupport = positionPayoffCount >= 10
    && externalReactionCount >= 2
    && typeof readerScore === 'number'
    && readerScore >= 7.5
    && (genreDrift?.promiseDrift.promiseHits ?? 0) >= 5
    && (genreDrift?.promiseDrift.suspenseShare ?? 1) <= 0.12;

  if (typeof readerScore === 'number' && readerScore < 7) {
    issues.push(`读者评分偏低：${readerScore.toFixed(1)}/10。`);
    suggestions.push('后续生成不能只提高要素命中，要优先补强场景推进、情绪递进和章尾钩子。');
  }
  if (typeof readerScoreDelta === 'number' && readerScoreDelta <= -0.3) {
    issues.push(`读者评分较上一章下降 ${Math.abs(readerScoreDelta).toFixed(1)} 分。`);
    suggestions.push('下一章必须先修复阅读体验，再追求更多设定命中。');
  } else if (typeof readerScoreDelta === 'number' && readerScoreDelta < 0) {
    suggestions.push(`读者评分较上一章轻微回落 ${Math.abs(readerScoreDelta).toFixed(1)} 分；下一章继续优先保持自然读感和人物行动压力。`);
  }
  if (typeof qualityGate?.structureScore === 'number' && qualityGate.structureScore < 55) {
    issues.push(`结构分偏低：${qualityGate.structureScore.toFixed(1)}，场景推进不足。`);
    suggestions.push('补足完整场景链：目标、阻碍、选择、即时后果、章尾变化。');
  }
  if (qualityGate?.findings?.some(finding => finding.code === 'ai-meta-leak')) {
    issues.push('正文存在 AI/写作元信息泄露，会直接破坏小说阅读沉浸。');
    suggestions.push('必须删除“本文/本章/这段文字”等写作说明，改成角色可感知的动作、场景或结果。');
  }
  if (
    typeof qualityGate?.emotionScore === 'number'
    && qualityGate.emotionScore < 50
    && !hasPositionPayoffSupport
  ) {
    issues.push(`情绪分偏低：${qualityGate.emotionScore.toFixed(1)}，人物反应和情绪递进不足。`);
    suggestions.push('每个关键设定或动作代价后必须写出关系变化、他人反馈或心理递进，不能只堆身体反应。');
  }
  const hasStalledMomentum = qualityGate?.findings?.some(finding => finding.code === 'stalled-momentum') ?? false;
  const hasLowEmotionVariance = qualityGate?.findings?.some(finding => finding.code === 'low-emotion-variance') ?? false;
  if (
    hasStalledMomentum
    && typeof qualityGate?.emotionScore === 'number'
    && qualityGate.emotionScore < 65
    && !hasConcreteEmotionalSupport
    && !hasPositionPayoffSupport
  ) {
    issues.push(`推进停滞且情绪承托偏弱：情绪分 ${qualityGate.emotionScore.toFixed(1)}。`);
    suggestions.push('下一章必须减少连续说明段，把中后段改成动作阻断、人物反应和即时后果。');
  }
  if (
    hasLowEmotionVariance
    && typeof qualityGate?.emotionScore === 'number'
    && typeof readerScoreDelta === 'number'
    && readerScoreDelta < 0
    && qualityGate.emotionScore < 60
  ) {
    issues.push(`读者分回落且情绪起伏不足：读者分变化 ${readerScoreDelta.toFixed(1)}，情绪分 ${qualityGate.emotionScore.toFixed(1)}。`);
    suggestions.push('下一章必须优先恢复读感：让关键回报后出现更具体的人物反应、关系变化或可见代价，不要只增加项目节点。');
  } else if (
    hasLowEmotionVariance
    && typeof qualityGate?.emotionScore === 'number'
    && qualityGate.emotionScore < 60
    && !hasConcreteEmotionalSupport
    && !hasPositionPayoffSupport
  ) {
    issues.push(`情绪起伏不足：情绪分 ${qualityGate.emotionScore.toFixed(1)}，人物反应和代价没有托住事件。`);
    suggestions.push('下一章每个关键回报后必须给出人物反应、身体代价或关系位置变化，不能只写系统提示和设定结果。');
  }
  if (wordCount < 1200) {
    issues.push(`章节篇幅偏短：${wordCount} 字符，容易像剧情梗概。`);
    suggestions.push('下一章至少扩成两个完整场景：选择前的压力、选择后的即时后果。');
  }
  if (speakerMarkerCount > 0) {
    issues.push(`正文含 ${speakerMarkerCount} 个说话人标记，普通阅读会被打断。`);
    suggestions.push('面向阅读展示或发布时应隐藏说话人标记；生成正文需避免把标记当自然文本。');
  }
  if (dialogueCount > 0 && speakerMarkerCount >= dialogueCount) {
    issues.push('几乎每句对话都带显式说话人标记，阅读质感偏工具化。');
    suggestions.push('保留结构化说话人数据，但阅读正文应呈现自然对话。');
  }
  if (paragraphs.length < 10) {
    issues.push('段落数量偏少，场景铺展不足。');
    suggestions.push('增加动作承接、环境压力和人物反应段落，不要只交代设定结论。');
  }
  if (silentReactionCount >= 8 && silentReactionPer1k > 2.2) {
    issues.push(`静默反应句式偏密：${silentReactionCount} 次，约 ${silentReactionPer1k}/千字，人物反应容易变钝。`);
    suggestions.push('减少“没有回答/沉默”等同类承接，改用具体动作、视线变化、身体代价或关系位置变化承接压力。');
  }
  if (explanationContrastCount >= 14 && explanationContrastPer1k > 4) {
    issues.push(`解释/对照句偏密：${explanationContrastCount} 次，约 ${explanationContrastPer1k}/千字，读感容易变硬。`);
    suggestions.push('压缩“不是/而是/是因为”解释链，把设定差异落到角色当场行动和后果上。');
  }
  if (genreDrift && !genreDrift.qualityFloorPassed) {
    issues.push(...genreDrift.issues);
    suggestions.push(...genreDrift.suggestions);
  }

  const qualityFloorPassed = issues.length === 0;

  return {
    readerScore,
    previousReaderScore,
    readerScoreDelta,
    wordCount,
    speakerMarkerCount,
    dialogueCount,
    paragraphCount: paragraphs.length,
    averageParagraphLength,
    sceneBreakCount,
    silentReactionCount,
    silentReactionPer1k,
    explanationContrastCount,
    explanationContrastPer1k,
    qualityGateOverall: qualityGate?.overallScore,
    qualityGateStructure: qualityGate?.structureScore,
    qualityGateEmotion: qualityGate?.emotionScore,
    genreDrift,
    qualityFloorPassed,
    issues,
    suggestions,
  };
}

export function mergeReadabilityAuditIntoDiagnostics(
  chapter: Chapter,
  audit: ChapterReadabilityAudit,
): Chapter['diagnostics'] {
  return {
    ...(chapter.diagnostics ?? {}),
    readabilityAudit: audit,
    updatedAt: new Date().toISOString(),
  } as Chapter['diagnostics'];
}

export function buildReadabilityForwardHints(chapter: Chapter | null | undefined): string {
  const audit = chapter?.diagnostics?.readabilityAudit;
  if (!audit || audit.qualityFloorPassed) return '';

  const lines: string[] = [
    `上一章可读性审计提示（第 ${chapter.chapterNumber} 章）：`,
  ];
  for (const issue of audit.issues.slice(0, 4)) {
    lines.push(`- ${issue}`);
  }
  for (const suggestion of audit.suggestions.slice(0, 3)) {
    lines.push(`- ${suggestion}`);
  }
  const structureLow = typeof audit.qualityGateStructure === 'number' && audit.qualityGateStructure < 55;
  const emotionLow = typeof audit.qualityGateEmotion === 'number' && audit.qualityGateEmotion < 60;
  if (structureLow) {
    lines.push('- 本章生成前置硬要求：先写清“目标 -> 阻碍 -> 抉择 -> 即时后果 -> 章尾变化”的完整场景链，再补设定说明。');
    lines.push('- 至少让一个世界要素改变角色行动路线、谈判筹码或受伤/失去/欠债等现实代价，不能只作为背景名词出现。');
  }
  if (emotionLow) {
    lines.push('- 本章生成前置硬要求：关键选择前后各安排一个人物反应节拍，必须包含身体感受、具体迟疑动作、对方关系反馈或心理代价之一。');
    lines.push('- 低情绪修复必须写成“结果 -> 公开反馈 -> 角色位置变化 -> 下一步选择”的场景链；至少一次让客户、上级、恋爱对象、队友、社员或同伴当场改变态度、站队或提出新条件。');
    lines.push('- 不要只补身体反应或心理标签；每个情绪节拍必须改变关系压力、资源归属、站队变化或可执行目标之一。');
    lines.push('- 情绪推进要绑定事件后果，不要只增加情绪标签词或氛围句。');
  }
  if (typeof audit.readerScoreDelta === 'number' && audit.readerScoreDelta < 0) {
    lines.push('- 上一章读者分下降，本章不得用更多设定命中掩盖阅读体验回退；优先恢复可读的行动目标和追读钩子。');
  }
  if (
    typeof audit.readerScoreDelta === 'number'
    && audit.readerScoreDelta < 0
    && emotionLow
  ) {
    lines.push('- 流程化读感补救硬约束：本章减少文件、记录、日志、清单、时间表、签字、截图、系统提示连续出现；每出现一次流程结果，下一段必须转成人的反应、站队变化、关系代价或当场选择。');
    lines.push('- 记忆补全不得写成角色复盘资料或后台核查，要写成现场阻碍、人物动作和即时后果。');
  }
  if (audit.genreDrift && !audit.genreDrift.qualityFloorPassed) {
    lines.push('- 上一章存在题材漂移：世界要素必须服务本题材主回报，不能被秘密、真相、调查、线索接管。');
    for (const suggestion of audit.genreDrift.suggestions.slice(0, 2)) {
      lines.push(`- ${suggestion}`);
    }
  }
  lines.push('- 本章优先保证自然阅读体验：不要让设定说明、标记符号或指标任务压过人物行动和情绪推进。');
  return lines.join('\n');
}
