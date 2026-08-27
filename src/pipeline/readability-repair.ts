import type { QualityGateReport } from './quality-gate.js';
import type { GenreDriftAudit } from './genre-drift-audit.js';

export type ReadabilityRepairDecision = {
  shouldRepair: boolean;
  reasons: string[];
  hints: string;
};

export function buildReadabilityRepairDecision(params: {
  readerScore: number;
  scoreThreshold: number;
  previousReaderScore?: number;
  qualityReport?: QualityGateReport;
  genreDrift?: GenreDriftAudit;
}): ReadabilityRepairDecision {
  const { readerScore, scoreThreshold, previousReaderScore, qualityReport, genreDrift } = params;
  const reasons: string[] = [];
  const lines: string[] = [
    '以下是可读性修复要求：只做最小必要改写，不改变既有事实、人物关系、地点、物品归属和章尾钩子。',
  ];

  if (readerScore < scoreThreshold) {
    reasons.push(`readerScore ${readerScore.toFixed(1)} < ${scoreThreshold}`);
    lines.push('- 读者评分不足：增强场景推进、人物反应和章尾追读，不要只补设定名词。');
  }
  if (typeof previousReaderScore === 'number' && previousReaderScore - readerScore >= 0.3) {
    reasons.push(`readerScore dropped ${(previousReaderScore - readerScore).toFixed(1)} from previous chapter`);
    lines.push('- 读者评分较上一章明显下降：本次修复必须优先恢复阅读体验，不能只提高设定命中或抽象指标。');
    lines.push('- 保留已有事实，但要补强当场目标、阻碍升级、人物关系反应和章尾追读压力。');
  }
  const hasMomentumWarning = qualityReport?.findings.some(finding =>
    finding.code === 'stalled-momentum' || finding.code === 'low-scene-coverage',
  ) ?? false;
  const hasStalledMomentum = qualityReport?.findings.some(finding => finding.code === 'stalled-momentum') ?? false;
  if (
    typeof previousReaderScore === 'number'
    && previousReaderScore - readerScore >= 0.2
    && (hasMomentumWarning || (qualityReport?.emotionScore ?? 100) < 65)
  ) {
    reasons.push(`readerScore dropped ${(previousReaderScore - readerScore).toFixed(1)} with quality warnings`);
    lines.push('- 读者评分虽只小幅下降，但伴随推进停滞或情绪承托不足：必须做最小修复，优先让动作、代价和关系反应更顺。');
    lines.push('- 不要为了提高结构分增加设定解释；修复目标是读起来更顺、更有压力、更少硬句。');
    lines.push('- 流程化读感补救硬约束：不要继续堆文件、记录、日志、清单、时间表、签字、截图或系统提示；每个流程结果后必须补一个人物反应、站队变化、关系代价或当场选择。');
  }
  if (qualityReport && qualityReport.emotionScore < 65) {
    lines.push('- 不要用“沉默/没有回答/没有说话”批量替代人物反应；优先改成可见动作、身体代价、关系位置变化或当场选择。');
  }
  if (qualityReport && qualityReport.structureScore < 55) {
    reasons.push(`structureScore ${qualityReport.structureScore.toFixed(1)} < 55`);
    lines.push('- 结构分偏低：补足目标、阻碍、选择、即时后果，至少让一个行动改变局势。');
  }
  if (qualityReport && qualityReport.structureScore < 75 && qualityReport.findings.length > 0) {
    reasons.push(`structureScore ${qualityReport.structureScore.toFixed(1)} with quality findings`);
    lines.push('- 结构虽未跌破硬线但已影响阅读：删弱静态说明，补一个可见动作转折或即时后果。');
  }
  if (qualityReport && hasStalledMomentum && qualityReport.emotionScore < 65) {
    reasons.push(`stalled-momentum with emotionScore ${qualityReport.emotionScore.toFixed(1)} < 65`);
    lines.push('- 推进停滞且情绪承托偏弱：必须把连续说明段改成“动作阻断 -> 人物反应 -> 新后果”的节拍。');
    lines.push('- 至少处理一处中后段停滞：删掉重复解释，补一个角色当场改变方案、承受代价或关系位置变化的段落。');
  }
  if (qualityReport && qualityReport.emotionScore < 50) {
    reasons.push(`emotionScore ${qualityReport.emotionScore.toFixed(1)} < 50`);
    lines.push('- 情绪分偏低：补足两个情绪节拍，先写关键选择前的压力收束，再写选择后的关系反应或心理代价。');
    lines.push('- 情绪修复必须服务剧情：用角色动作、身体感受、沉默/迟疑、对方反应和实际代价呈现，不要堆砌“愤怒/恐惧/悲伤”等标签词刷分。');
    lines.push('- 若本章涉及世界规则或能力代价，必须让代价落到人物身上：伤、失去、误解、欠债、寿命损耗、关系裂痕至少兑现一种。');
  }
  if (qualityReport?.findings.some(finding => finding.code === 'stalled-momentum')) {
    lines.push('- 推进感不足：拆开静态说明段，用动作、阻断、反应、后果串起来。');
  }
  if (qualityReport?.findings.some(finding => finding.code === 'low-scene-coverage')) {
    lines.push('- 场景兑现不足：回到场景执行卡，补出至少一个可见事件落地。');
  }
  if (
    qualityReport?.findings.some(finding => finding.code === 'low-emotion-variance')
    && qualityReport.emotionScore < 60
  ) {
    reasons.push(`low-emotion-variance with emotionScore ${qualityReport.emotionScore.toFixed(1)} < 60`);
    lines.push('- 情绪起伏不足：不要只补系统提示和教学结果，必须补人物当场反应、身体代价、关系位置变化和选择后的余波。');
    lines.push('- 每个关键回报后至少落一笔“谁松了口气/谁受伤/谁改变了对主角的态度/谁承担下一步风险”。');
  }
  if (genreDrift && !genreDrift.qualityFloorPassed) {
    reasons.push('genre drift detected');
    lines.push('- 题材漂移修复：保留既有事实和世界要素，但必须把主驱动力改回本题材承诺，不能让秘密、真相、线索、调查接管章节。');
    lines.push('- 世界要素要服务题材主回报：甜宠写关系回报，美食/经营写制作与客流反馈，科幻写实验反馈，升级写突破和资源争夺。');
    for (const issue of genreDrift.issues.slice(0, 2)) {
      lines.push(`- 漂移问题：${issue}`);
    }
  }

  lines.push('- 禁止输出 (#角色名) 这类工具标记，正文必须是自然小说文本。');
  lines.push('- 如原文含 TTS 说话人标记，只能在内部保留语音元数据；面向读者的正文不得把标记显露出来。');
  lines.push('- 输出格式保持“润色后正文 + ---EDITOR_NOTES--- + 修改说明”。');

  return {
    shouldRepair: reasons.length > 0,
    reasons,
    hints: lines.join('\n'),
  };
}
