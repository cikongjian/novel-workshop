export type ClicheSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type ClicheCategory =
  | 'expression'
  | 'narrative'
  | 'plot'
  | 'character'
  | 'scene'
  | 'dialogue'
  | 'world';

export type DetectorType =
  | 'expression-pattern'
  | 'narrative-structure'
  | 'plot-template'
  | 'character-arc'
  | 'scene-repetition'
  | 'dialogue-cliche'
  | 'world-consistency';

export interface ClicheRule {
  id: string;
  type: DetectorType;
  category: ClicheCategory;
  name: string;
  description: string;
  pattern?: string | string[];
  regex?: string;
  severity: ClicheSeverity;
  threshold: number;
  enabled: boolean;
  priority: number;
  lastUpdated: string;
  hitCount: number;
  falsePositiveCount: number;
  precision?: number;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface ClicheFinding {
  ruleId: string;
  ruleName: string;
  type: DetectorType;
  category: ClicheCategory;
  severity: ClicheSeverity;
  pattern: string;
  location: {
    chapterNumber: number;
    paragraphIndex?: number;
    sentenceIndex?: number;
    start?: number;
    end?: number;
  };
  context: string;
  message: string;
  suggestion: string;
  confidence: number;
}

export interface ClicheDetectionReport {
  chapterNumber: number;
  totalFindings: number;
  findings: ClicheFinding[];
  score: number;
  breakdown: Record<ClicheCategory, { count: number; score: number }>;
  suggestions: string[];
  summary: string;
}

export interface EvolutionEvent {
  type: 'feedback' | 'auto-learn' | 'rule-update' | 'threshold-adjust';
  timestamp: string;
  ruleId: string;
  data: Record<string, unknown>;
}

export interface EvolutionStrategy {
  id: string;
  name: string;
  description: string;
  targetMetric: 'precision' | 'recall' | 'f1' | 'coverage';
  thresholds: {
    minPrecision: number;
    minRecall: number;
    minF1: number;
  };
  learningRate: number;
  enabled: boolean;
}

export interface DetectorConfig {
  type: DetectorType;
  enabled: boolean;
  priority: number;
  params: Record<string, unknown>;
}

export interface AntiClicheEngineState {
  rules: ClicheRule[];
  strategies: EvolutionStrategy[];
  detectorConfigs: DetectorConfig[];
  evolutionEvents: EvolutionEvent[];
  lastEvolutionRun: string;
  statistics: {
    totalRules: number;
    activeRules: number;
    totalFindings: number;
    autoLearnedRules: number;
    falsePositivesFixed: number;
  };
}

export interface DetectionContext {
  novelId: string;
  chapterNumber: number;
  content: string;
  outline?: string;
  previousChapters?: Array<{ content: string; chapterNumber: number }>;
  characterNames?: string[];
  sceneTypes?: string[];
  genre?: string;
}

export interface Detector {
  type: DetectorType;
  name: string;
  detect(context: DetectionContext, rules: ClicheRule[]): Promise<ClicheFinding[]>;
  learn?(context: DetectionContext, findings: ClicheFinding[]): Promise<void>;
}

export interface EvolutionResult {
  updatedRules: ClicheRule[];
  newRules: ClicheRule[];
  removedRules: string[];
  adjustedThresholds: string[];
  strategyApplied: string;
  statistics: {
    precisionImprovement: number;
    recallImprovement: number;
  };
}