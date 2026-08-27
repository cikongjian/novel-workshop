import type { AgentOutput } from '../agents/types.js';
import type { Chapter } from '../novel/types.js';
import type { StartupOpeningGateReport } from './startup-opening-gate.js';
import type { QualityGateReport } from './quality-gate.js';
import type { ReaderDeliveryAudit } from './reader-delivery-audit.js';
import { auditReaderDelivery } from './reader-delivery-audit.js';
import {
  auditChapterReadability,
  mergeReadabilityAuditIntoDiagnostics,
} from './readability-audit.js';
import { auditGenreDrift } from './genre-drift-audit.js';
import type { NovelMetadata } from '../novel/types.js';
import type { buildNovelPromiseContract } from './novel-promise-contract.js';

export type ReaderDeliveryRepairSignal = {
  shouldRepair: boolean;
  audit: ReaderDeliveryAudit;
  reasons: string[];
  feedback: string;
};

export function buildReaderDeliveryRepairSignal(params: {
  novel: NovelMetadata;
  promiseContract: ReturnType<typeof buildNovelPromiseContract>;
  novelId: string;
  chapterNumber: number;
  title: string;
  content: string;
  readerScore: number;
  previousChapter?: Chapter | null;
  qualityReport?: QualityGateReport;
  startupOpeningReport?: StartupOpeningGateReport;
  authorNote?: string;
  agentOutputs?: AgentOutput[];
}): ReaderDeliveryRepairSignal {
  const timestamp = new Date().toISOString();
  const chapter = buildTemporaryChapter({
    ...params,
    timestamp,
  });
  const genreDrift = auditGenreDrift({
    chapterContent: params.content,
    title: params.novel.title,
    synopsis: params.novel.synopsis,
    genre: params.novel.genre,
    tags: params.novel.tags,
    constitutionTags: params.novel.constitutionTags,
    promiseContract: params.promiseContract,
  });
  const readabilityAudit = auditChapterReadability({
    chapterContent: params.content,
    readerScore: params.readerScore,
    previousReaderScore: params.previousChapter?.readerScore,
    qualityGate: chapter.diagnostics?.qualityGate,
    genreDrift,
  });
  chapter.diagnostics = mergeReadabilityAuditIntoDiagnostics(chapter, readabilityAudit);
  const audit = auditReaderDelivery({
    chapter,
    previousChapter: params.previousChapter,
  });
  const reasons = buildReasons(audit);

  return {
    shouldRepair: !audit.passed,
    audit,
    reasons,
    feedback: buildFeedback(audit),
  };
}

function buildTemporaryChapter(params: {
  novelId: string;
  chapterNumber: number;
  title: string;
  content: string;
  readerScore: number;
  qualityReport?: QualityGateReport;
  startupOpeningReport?: StartupOpeningGateReport;
  authorNote?: string;
  agentOutputs?: AgentOutput[];
  timestamp: string;
}): Chapter {
  return {
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    title: params.title,
    content: params.content,
    wordCount: params.content.length,
    status: 'reviewed',
    agentComments: (params.agentOutputs ?? []).map(output => ({
      agentRole: output.agentRole,
      comment: output.content,
      timestamp: output.timestamp,
    })),
    readerScore: params.readerScore,
    revisionCount: 0,
    summary: '',
    diagnostics: {
      startupOpeningReport: params.startupOpeningReport,
      qualityGate: params.qualityReport
        ? {
          overallScore: params.qualityReport.overallScore,
          structureScore: params.qualityReport.structureScore,
          styleScore: params.qualityReport.styleScore,
          emotionScore: params.qualityReport.emotionScore,
          passed: params.qualityReport.passed,
          summary: params.qualityReport.summary,
          findings: params.qualityReport.findings.map(finding => ({
            code: finding.code,
            level: finding.level,
            message: finding.message,
          })),
        }
        : undefined,
      updatedAt: params.timestamp,
    },
    authorNotes: params.authorNote ? [params.authorNote] : [],
    createdAt: params.timestamp,
    updatedAt: params.timestamp,
  };
}

function buildReasons(audit: ReaderDeliveryAudit): string[] {
  const reasons: string[] = [];
  if (!audit.passed) {
    reasons.push(`reader delivery failed: ${audit.score}/100`);
  }
  for (const [key, value] of Object.entries(audit.dimensions)) {
    if (value < 76) {
      reasons.push(`${key} dimension weak: ${value}/100`);
    }
  }
  return reasons;
}

function buildFeedback(audit: ReaderDeliveryAudit): string {
  if (audit.passed) return '';
  const lines = [
    `Reader delivery failed before save: ${audit.score}/100.`,
    'Revise for reader-facing chapter quality, not just memory or setting coverage.',
    'Keep existing facts, continuity, locations, ownership, and ending hook unless directly fixing the reader-facing problem.',
    ...audit.issues.slice(0, 5).map(issue => `Issue: ${issue}`),
    ...audit.suggestions.slice(0, 5).map(suggestion => `Fix: ${suggestion}`),
  ];
  if (audit.dimensions.readability < 74) {
    lines.push('Fix: 读者交付自动修复硬约束：本次修复必须在当前章补足至少两个“结果后的余波”节拍，不能只把问题推到下一章。');
    lines.push('Fix: 读者交付自动修复硬约束：每个关键结果后，下一段必须让一个具体角色出现可见动作、身体感受、关系位置变化或即时选择后果之一。');
    lines.push('Fix: 读者交付自动修复硬约束：不要用“沉默、点头、继续等待、系统确认”当作主要反应；补的反应必须改变读者对人物处境或关系压力的感受。');
    lines.push('Fix: 流程化读感补救硬约束：不要继续堆文件、记录、日志、清单、时间表、签字、截图或系统提示；每个流程结果后必须补一个人物反应、站队变化、关系代价或当场选择。');
  }
  if (shouldAddEngineeringRepairConstraints(audit)) {
    lines.push('Fix: 工程题材自动修复硬约束：不要把修复写成继续查日志、确认来源、比对签名、调监控或等待文件；这些只能占前半章，后半章必须回到设备现场。');
    lines.push('Fix: 工程题材自动修复硬约束：最后 300 字必须落到一个可执行设备压力点：报警升级、压力读数异常、阀门卡死、备用电池过热、模块离线、倒计时维修或现场协作选择。');
    lines.push('Fix: 工程题材自动修复硬约束：如果保留签名/来源/日志线索，下一段必须让它触发当场拆修动作或设备状态恶化，不能把“谁签的/谁改的/来源是谁”当最终钩子。');
  }
  if (shouldAddWarStatecraftRepairConstraints(audit)) {
    lines.push('Fix: 战争权谋自动修复硬约束：密信、油布、路线、旧案、暗号只能作为军政动作的触发器；出现后同一场必须转成军令、押解、换防、问罪、收编、兵权或旧贵族公开反扑。');
    lines.push('Fix: 战争权谋自动修复硬约束：最后 300 字不得收在“哪座山/谁留下的/图上画着什么/还要查什么”，必须收在天亮前出兵、换防落地、廷议开场、押解执行、军令改变或门阀新条件。');
    lines.push('Fix: 战争权谋自动修复硬约束：每个战场或府衙结果后，必须补一个命名角色的可见反应、站队变化或代价，不能只罗列军政节点。');
  }
  if (shouldAddShowbizRepairConstraints(audit)) {
    lines.push('Fix: 娱乐圈自动修复硬约束：前 1000 字必须出现公开主场景、主角要争的角色/资源/热搜/直播机会、具体行业阻碍和第一次可见反馈；普通吐槽、轻微阴阳怪气不算阻碍。');
    lines.push('Fix: 娱乐圈自动修复硬约束：每次试镜、直播、热搜或资源结果后，下一段必须给导演、经纪人、品牌方、对家、粉丝或评论区的可见反应，并改变角色归属、通告、站队、舆论或关系位置。');
    lines.push('Fix: 娱乐圈自动修复硬约束：最后 300 字不得停在查幕后、等消息、看文件或私下谈条件，必须收在下一场直播/试镜、品牌限时条件、热搜反扑、对家公开动作或资源截胡下一步。');
  }
  return lines.join('\n');
}

function shouldAddEngineeringRepairConstraints(audit: ReaderDeliveryAudit): boolean {
  if (audit.dimensions.endingHook < 76 || audit.dimensions.promisePayoff < 76) {
    const text = [...audit.issues, ...audit.suggestions].join('\n');
    return /工程|科幻|设备|气闸|报警|压力|读数|阀门|泵组|模块|备用电池|日志|文件|签名|来源|信号源|HUD/u.test(text);
  }
  return false;
}

function shouldAddWarStatecraftRepairConstraints(audit: ReaderDeliveryAudit): boolean {
  if (audit.dimensions.endingHook >= 82 && audit.dimensions.readability >= 74) return false;
  const text = [...audit.issues, ...audit.suggestions].join('\n');
  return /战争|权谋|朝堂|军令|兵权|城门|府衙|廷议|换防|押解|旧贵族|密信|油布|路线|暗号|问罪/u.test(text);
}

function shouldAddShowbizRepairConstraints(audit: ReaderDeliveryAudit): boolean {
  if (
    audit.dimensions.opening >= 84
    && audit.dimensions.promisePayoff >= 80
    && audit.dimensions.endingHook >= 82
    && audit.dimensions.readability >= 74
  ) {
    return false;
  }
  const text = [...audit.issues, ...audit.suggestions].join('\n');
  return /娱乐圈|热搜|直播|片场|试镜|品牌方|资源|站队|经纪人|导演|对家|通告|评论区|粉丝|休息室|会客室|私下谈判/u.test(text);
}
