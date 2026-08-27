import type { AgentOutput, AgentEvent } from '../agents/types.js';
import type {
  NovelMetadata,
  OutlineData,
  Chapter,
  Scene,
  CharacterProfile,
  WorldEntry,
  CharacterStateSnapshot,
  ChapterFact,
  CharacterEvent,
  ChapterPacing,
} from '../novel/types.js';
import type { FactGraph } from '../novel/fact-graph-types.js';
import type { PlotBranchTree } from '../novel/plot-branch-types.js';
import type {
  WorldContract,
  WorldContractFulfillment,
  WorldGateRewriteReport,
} from './world-contract.js';
import type {
  OutlineContract,
  OutlineContractFulfillment,
  OutlineGateRewriteReport,
} from './outline-gate.js';
import type {
  QualityGateReport,
  QualityGateRewriteReport,
} from './quality-gate.js';
import type {
  CommercialGateReport,
} from './commercial-gate.js';
import type {
  ChapterPromiseCard,
} from './chapter-promise-card.js';
import type {
  ChapterPromiseGateReport,
} from './chapter-promise-gate.js';
import type {
  StartupOpeningGateReport,
} from './startup-opening-gate.js';
import type { StartupOpeningStrategyDigest } from '../agent-skills/opening-strategy.js';
import type {
  ChapterLengthGuardResult,
} from './chapter-length-guard.js';
import type {
  ContinuityGateReport,
} from './continuity-gate.js';
import type {
  PowerRuleGateReport,
} from './power-rule-gate.js';
import type {
  AiTraceGateReport,
} from './ai-trace-gate.js';
import type { CollaborationEntry } from './collaboration-log.js';
import type { PerfReport } from './performance-tracker.js';
import type { StyleDNA } from '../style/style-types.js';

export type SpeakerWhitelistFinding = {
  name: string;
  occurrences: number;
  inPendingPool: boolean;
};

export type SpeakerWhitelistReport = {
  mode: 'off' | 'warn' | 'strict';
  passed: boolean;
  summary: string;
  findings: SpeakerWhitelistFinding[];
};

export type SuperLongDiagnosticModule = {
  key:
    | 'layered-memory'
    | 'character-ledger'
    | 'timeline-engine'
    | 'foreshadow-debt'
    | 'anti-ai-radar'
    | 'pov-lock'
    | 'chapter-goal-budget'
    | 'hook-planner';
  title: string;
  enabled: boolean;
  score?: number;
  summary: string;
  evidence?: string[];
};

export type SuperLongDiagnostics = {
  enabled: boolean;
  summary: string;
  modules: SuperLongDiagnosticModule[];
};

export type ChapterGenerationResult = {
  chapterContent: string;
  outline: string;
  worldNotes: string;
  characterNotes: string;
  draft: string;
  editedContent: string;
  readerFeedback: string;
  agentOutputs: AgentOutput[];
  scenePlan?: string;
  scenes?: Scene[];
  sceneMode?: boolean;
  stylePreset?: string;
  worldContract?: WorldContract;
  worldFulfillment?: WorldContractFulfillment;
  worldGateRewrite?: WorldGateRewriteReport;
  outlineContract?: OutlineContract;
  outlineFulfillment?: OutlineContractFulfillment;
  outlineGateRewrite?: OutlineGateRewriteReport;
  qualityReport?: QualityGateReport;
  qualityGateRewrite?: QualityGateRewriteReport;
  chapterPromiseCard?: ChapterPromiseCard;
  chapterPromiseReport?: ChapterPromiseGateReport;
  chapterPromiseGateRewrite?: {
    attempted: boolean;
    applied: boolean;
    reason: string;
    before: ChapterPromiseGateReport;
    after: ChapterPromiseGateReport;
  };
  commercialReport?: CommercialGateReport;
  commercialGateRewrite?: {
    attempted: boolean;
    applied: boolean;
    reason: string;
    before: CommercialGateReport;
    after: CommercialGateReport;
  };
  startupOpeningReport?: StartupOpeningGateReport;
  startupOpeningGateRewrite?: {
    attempted: boolean;
    applied: boolean;
    reason: string;
    before: StartupOpeningGateReport;
    after: StartupOpeningGateReport;
  };
  startupOpeningStrategy?: StartupOpeningStrategyDigest;
  chapterLengthGuard?: ChapterLengthGuardResult & {
    attemptedCompression: boolean;
    attemptedExpansion: boolean;
    usedFallbackTrim: boolean;
    finalWordCount: number;
  };
  speakerWhitelistReport?: SpeakerWhitelistReport;
  powerRuleReport?: PowerRuleGateReport;
  /** 设定漂移门禁报告 */
  settingDriftReport?: import('./setting-drift-gate.js').SettingDriftGateReport;
  continuityReport?: ContinuityGateReport;
  /** AI 痕迹门禁检测报告 */
  aiTraceReport?: AiTraceGateReport;
  /** 自动修订闭环结果 */
  autoRevision?: {
    triggered: boolean;
    rounds: number;
    initialScore: number;
    finalScore: number;
    accepted?: boolean;
    reason?: string;
    selectedRound?: number;
    readerDeliveryInitialScore?: number;
    readerDeliveryFinalScore?: number;
    readerDeliveryPassed?: boolean;
  };
  /** 定稿后自动梳理结果 */
  autoCurators?: Array<{ curator: string; summary: string }>;
  /** Agent 协作日志 */
  collaborationLog?: CollaborationEntry[];
  /** 管线性能报告 */
  performanceReport?: PerfReport;
  superLongDiagnostics?: SuperLongDiagnostics;
  memoryContextAudit?: import('./memory-context-audit.js').MemoryContextAudit;
  userDirectionAnchorAudit?: import('./user-direction-anchor.js').UserDirectionAnchorAudit;
  /** 作者有话说（章末互动短文） */
  authorNote?: string;
  /** 结构化审计报告 (Phase 3) */
  auditReport?: import('./audit-dimension-types.js').AuditReport;
  /** 智能门禁报告（连续性审计、蓝图执行追踪、代价感检测） */
  smartGateReport?: import('./smart-gate-manager.js').SmartGateReport;
  /** 反套路检测报告 */
  antiClicheReport?: import('./anti-cliche-engine.js').ClicheDetectionReport;
  /**
   * Editor 在审稿后给出的「建议标题」。
   * 后台标题生成任务会优先采用此值，避免独立 title-generator 重复调用。
   * 若 editor 未给出，则为空字符串。
   */
  suggestedTitle?: string;
};

export type RevisionResult = {
  revisedContent: string;
  editedContent: string;
  readerFeedback: string;
  agentOutputs: AgentOutput[];
  /** AI 标记守卫结果（可选） */
  aiMarkerGuard?: {
    beforeScore: number;
    afterScore: number;
    delta: number;
    rejected: boolean;
    reason?: string;
  };
};

export type EventEmitter = (event: AgentEvent) => void;

export type MMROption = { enabled: boolean; lambda: number };

export interface PipelineMemory {
  searchChapterContext(novelId: string, query: string, chapterNumber: number): Promise<string>;
  searchWorldContext(novelId: string, query: string): Promise<string>;
  searchCharacterContext(novelId: string, query: string): Promise<string>;
  searchDigestContext?(novelId: string, query: string, currentChapter?: number, mmr?: MMROption): Promise<string>;
  searchMultiQuery?(novelId: string, queries: string[], options?: { category?: string; limit?: number; currentChapter?: number }): Promise<string>;
  searchArcContext?(novelId: string, query: string, currentChapter?: number, mmr?: MMROption): Promise<string>;
  searchFactContext?(novelId: string, query: string, currentChapter?: number, mmr?: MMROption): Promise<string>;
  searchThreadContext?(novelId: string, query: string, currentChapter?: number, mmr?: MMROption): Promise<string>;
  searchCharacterStateContext?(novelId: string, query: string, currentChapter?: number, mmr?: MMROption): Promise<string>;
  getCharacterRecap?(novelId: string, characterId: string, currentChapter?: number): Promise<string>;
}

export interface PipelineNovelManager {
  getDataDir?(): string;
  /** 列出所有小说（用于跨小说去重，如智能取名系统）。可选，不存在时跳过跨小说检查 */
  listNovels?(): Promise<readonly { id: string; title?: string }[]>;
  getNovel(novelId: string): Promise<NovelMetadata>;
  getOutline(novelId: string): Promise<OutlineData>;
  saveOutline(novelId: string, outline: OutlineData): Promise<void>;
  getChapter(novelId: string, chapterNumber: number): Promise<Chapter | null>;
  saveChapter(novelId: string, chapter: Chapter): Promise<void>;
  getCharacters(novelId: string): Promise<CharacterProfile[]>;
  getPendingCharacterCandidates?(
    novelId: string,
  ): Promise<Array<{ name: string; status: 'pending' | 'approved' | 'rejected' }>>;
  getCharacterStateSnapshots(novelId: string, characterId?: string): Promise<CharacterStateSnapshot[]>;
  getWorldEntries(novelId: string): Promise<WorldEntry[]>;
  saveWorldEntry?(novelId: string, entry: WorldEntry): Promise<void>;
  getChapterFacts(novelId: string): Promise<Record<number, ChapterFact>>;
  getChapterFact(novelId: string, chapterNumber: number): Promise<ChapterFact | null>;
  saveChapterFact(novelId: string, chapterNumber: number, fact: ChapterFact): Promise<void>;
  getCharacterEvents(novelId: string, characterId?: string): Promise<CharacterEvent[]>;
  appendCharacterEvents(novelId: string, events: CharacterEvent[]): Promise<void>;
  getPacing(novelId: string): Promise<ChapterPacing[]>;
  savePacing(novelId: string, pacing: ChapterPacing[]): Promise<void>;
  listChapters(novelId: string): Promise<{ chapterNumber: number; title: string; status: string; wordCount: number }[]>;
  getStyleDna?(novelId: string): Promise<StyleDNA | null>;
  getFactGraph?(novelId: string): Promise<FactGraph>;
  saveFactGraph?(novelId: string, graph: FactGraph): Promise<void>;
  getPlotBranchTree?(novelId: string): Promise<PlotBranchTree>;
}

// ==================== 爽文管线专用类型 ====================

export type ShuangwenHookGateReport = {
  passed: boolean;
  hasEndHook: boolean;
  hasPayoff: boolean;
  findings: string[];
  summary: string;
};

export type ShuangwenCycleGateReport = {
  passed: boolean;
  phaseDetected: string;
  findings: string[];
  summary: string;
};

export type ShuangwenForbiddenGateReport = {
  passed: boolean;
  violations: string[];
  summary: string;
};

export type ShuangwenGateReport = {
  hookGate: ShuangwenHookGateReport;
  cycleGate: ShuangwenCycleGateReport;
  forbiddenGate: ShuangwenForbiddenGateReport;
};

export type ShuangwenChapterResult = {
  chapterContent: string;
  outline: string;
  draft: string;
  editedContent: string;
  readerFeedback: string;
  agentOutputs: AgentOutput[];
  scenePlan?: string;
  qualityReport?: QualityGateReport;
  shuangwenGateReport?: ShuangwenGateReport;
  /** AI 生成的章末状态更新（权力威望、危机等级等），用于下一章参考 */
  statusUpdate?: string;
  autoRevision?: {
    triggered: boolean;
    rounds: number;
    initialScore: number;
    finalScore: number;
  };
};
