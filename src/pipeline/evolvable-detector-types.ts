export type EvolutionStrategy = 'precision' | 'recall' | 'balanced';

export type DetectorRuleSeverity = 'info' | 'warn' | 'error';

export interface DetectorRule {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: DetectorRuleSeverity;
  enabled: boolean;
  priority: number;
  threshold: number;
  weight: number;
  hitCount: number;
  falsePositiveCount: number;
  truePositiveCount: number;
  precision?: number;
  lastUpdated: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface DetectorFinding {
  ruleId: string;
  ruleName: string;
  level: DetectorRuleSeverity;
  message: string;
  confidence: number;
  chapter: number;
  details?: Record<string, unknown>;
}

export interface DetectorReport<F extends DetectorFinding = DetectorFinding> {
  findings: F[];
  passed: boolean;
  summary: string;
  score: number;
  totalRules: number;
  triggeredRules: number;
}

export interface GenreBaseline {
  genre: string;
  metrics: Record<string, number>;
}

export interface DetectorConfig {
  detectorType: string;
  strategy: EvolutionStrategy;
  enabled: boolean;
  globalThresholdMultiplier: number;
  genre?: string;
}

export interface DetectorRuleStore {
  getRules(detectorType: string, genre?: string): DetectorRule[];
  updateRule(ruleId: string, updates: Partial<DetectorRule>): boolean;
  recordHit(ruleId: string, detectorType: string): void;
  recordFalsePositive(ruleId: string, detectorType: string): void;
  recordTruePositive(ruleId: string, detectorType: string): void;
  getStrategy(detectorType: string): EvolutionStrategy;
  setStrategy(detectorType: string, strategy: EvolutionStrategy): void;
  getGenreBaseline(genre: string): Record<string, number> | undefined;
}

export interface DetectorStats {
  totalRules: number;
  enabledRules: number;
  totalHits: number;
  avgPrecision: number;
}
