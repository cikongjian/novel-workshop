/**
 * 章节质量度量类型定义
 *
 * 统一的度量 schema，用于跨章节量化对比。
 * 所有度量字段均为可选，按 Phase 逐步填充。
 */

// ==================== 核心度量类型 ====================

/** 质量门禁分数 (来自 quality-gate.ts) */
export type QualityGateScores = {
  overall: number;
  structure: number;
  style: number;
  emotion: number;
};

/** AI 痕迹检测分数 (来自 ai-trace-detector.ts) */
export type AiTraceScores = {
  /** 总分 0-100，越高越干净 */
  score: number;
  /** 违规条目数 */
  violations: number;
  /** 通过的规则数 */
  passedRules: number;
  /** 总规则数 */
  totalRules: number;
};

/** Truth File 覆盖度 (Phase 2) */
export type TruthFileCoverage = {
  /** 当前状态覆盖度 0-1 */
  currentState: number;
  /** 伏笔追踪覆盖度 0-1 */
  pendingHooks: number;
  /** 角色矩阵覆盖度 0-1 */
  characterMatrix: number;
};

/** 审计维度分数 (Phase 3) */
export type AuditDimensionScore = {
  score: number;
  weight: number;
  passed: boolean;
};

/** 门禁执行结果 */
export type GateResult = {
  mode: string;
  passed: boolean;
};

// ==================== 章节度量 ====================

/** 单章节的完整质量度量 */
export type ChapterQualityMetrics = {
  /** 章节号 */
  chapterNumber: number;
  /** 生成时间 */
  generatedAt: string;
  /** 质量门禁分数 */
  qualityGate?: QualityGateScores;
  /** Reader 评分 0-10 */
  readerScore?: number;
  /** AI 痕迹检测分数 (Phase 1) */
  aiTrace?: AiTraceScores;
  /** Truth File 覆盖度 (Phase 2) */
  truthFileCoverage?: TruthFileCoverage;
  /** 审计维度分数 (Phase 3) */
  auditDimensions?: Record<string, AuditDimensionScore>;
  /** 各门禁执行结果 */
  gateResults: Record<string, GateResult>;
};

// ==================== 趋势分析 ====================

/** 跨章节趋势 */
export type QualityTrend = {
  /** 章节范围 */
  chapterRange: { start: number; end: number };
  /** 总章节数 */
  totalChapters: number;
  /** 平均 Reader 评分 */
  avgReaderScore: number;
  /** 平均 AI 痕迹分数 */
  avgAiTraceScore: number;
  /** 平均质量门禁分数 */
  avgQualityGateOverall: number;
  /** 门禁通过率 */
  gatePassRates: Record<string, number>;
  /** 评分趋势方向 (-1=下降, 0=持平, 1=上升) */
  readerScoreTrend: -1 | 0 | 1;
  aiTraceScoreTrend: -1 | 0 | 1;
  /** 最近 5 章 vs 前 5 章的对比 */
  recentVsEarlier?: {
    recentAvgReader: number;
    earlierAvgReader: number;
    recentAvgAiTrace: number;
    earlierAvgAiTrace: number;
  };
};

/** 完整的质量报告 */
export type QualityReport = {
  novelId: string;
  metrics: ChapterQualityMetrics[];
  trend: QualityTrend;
};
