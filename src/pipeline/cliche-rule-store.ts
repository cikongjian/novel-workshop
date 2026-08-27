import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { ClicheRule, EvolutionStrategy, DetectorConfig, AntiClicheEngineState } from './anti-cliche-types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('cliche-rule-store');

const STORE_VERSION = '1.0.0';
const RULES_FILE = 'cliche-rules.json';
const STATE_FILE = 'anti-cliche-state.json';
const GLOBAL_DIR = '_global';

const DEFAULT_STRATEGIES: EvolutionStrategy[] = [
  {
    id: 'precision-first',
    name: '精确优先',
    description: '优先保证规则精确性，减少误报',
    targetMetric: 'precision',
    thresholds: { minPrecision: 0.8, minRecall: 0.5, minF1: 0.6 },
    learningRate: 0.1,
    enabled: true,
  },
  {
    id: 'recall-first',
    name: '召回优先',
    description: '优先保证发现率，减少漏报',
    targetMetric: 'recall',
    thresholds: { minPrecision: 0.5, minRecall: 0.8, minF1: 0.6 },
    learningRate: 0.08,
    enabled: true,
  },
  {
    id: 'balanced',
    name: '平衡策略',
    description: '兼顾精确性和召回率',
    targetMetric: 'f1',
    thresholds: { minPrecision: 0.6, minRecall: 0.6, minF1: 0.7 },
    learningRate: 0.05,
    enabled: true,
  },
];

const DEFAULT_DETECTORS: DetectorConfig[] = [
  { type: 'expression-pattern', enabled: true, priority: 10, params: { minLength: 3, maxLength: 10 } },
  { type: 'narrative-structure', enabled: true, priority: 20, params: { windowSize: 5 } },
  { type: 'plot-template', enabled: true, priority: 30, params: { minMatchLength: 2 } },
  { type: 'character-arc', enabled: true, priority: 40, params: { minChapters: 3 } },
  { type: 'scene-repetition', enabled: true, priority: 50, params: { windowSize: 5 } },
  { type: 'dialogue-cliche', enabled: true, priority: 60, params: { minRepeat: 3 } },
  { type: 'world-consistency', enabled: true, priority: 70, params: {} },
];

const DEFAULT_RULES: ClicheRule[] = [
  {
    id: 'expr-001',
    type: 'expression-pattern',
    category: 'expression',
    name: '沉默套路',
    description: '过度使用"沉默"相关表达',
    pattern: ['沉默了几秒', '沉默片刻', '陷入沉默', '沉默不语', '沉默以对'],
    severity: 'medium',
    threshold: 2,
    enabled: true,
    priority: 100,
    lastUpdated: new Date().toISOString(),
    hitCount: 0,
    falsePositiveCount: 0,
    tags: ['表达', '重复'],
  },
  {
    id: 'expr-002',
    type: 'expression-pattern',
    category: 'expression',
    name: '冷笑套路',
    description: '过度使用"冷笑"相关表达',
    pattern: ['冷笑一声', '冷笑连连', '发出冷笑', '嘴角勾起冷笑'],
    severity: 'medium',
    threshold: 2,
    enabled: true,
    priority: 100,
    lastUpdated: new Date().toISOString(),
    hitCount: 0,
    falsePositiveCount: 0,
    tags: ['表达', '重复'],
  },
  {
    id: 'expr-003',
    type: 'expression-pattern',
    category: 'expression',
    name: '眼神套路',
    description: '过度使用"眼神"相关表达',
    pattern: ['眼神冰冷', '眼神犀利', '眼神深邃', '眼神锐利', '眼神复杂'],
    severity: 'low',
    threshold: 3,
    enabled: true,
    priority: 90,
    lastUpdated: new Date().toISOString(),
    hitCount: 0,
    falsePositiveCount: 0,
    tags: ['表达', '重复'],
  },
  {
    id: 'plot-001',
    type: 'plot-template',
    category: 'plot',
    name: '打脸套路',
    description: '经典打脸情节模板：挑衅→轻视→反杀→震惊',
    pattern: ['冷笑', '不自量力', '震惊', '不敢置信', '打脸'],
    severity: 'high',
    threshold: 3,
    enabled: true,
    priority: 80,
    lastUpdated: new Date().toISOString(),
    hitCount: 0,
    falsePositiveCount: 0,
    tags: ['情节', '模板'],
  },
  {
    id: 'plot-002',
    type: 'plot-template',
    category: 'plot',
    name: '扮猪吃虎',
    description: '主角隐藏实力被轻视，关键时刻爆发',
    pattern: ['隐藏实力', '扮猪吃虎', '深藏不露', '低调行事', '一鸣惊人'],
    severity: 'high',
    threshold: 2,
    enabled: true,
    priority: 80,
    lastUpdated: new Date().toISOString(),
    hitCount: 0,
    falsePositiveCount: 0,
    tags: ['情节', '模板'],
  },
  {
    id: 'narr-001',
    type: 'narrative-structure',
    category: 'narrative',
    name: '章末悬念套路',
    description: '每章结尾都用"下一章"或"敬请期待"',
    regex: '(下一章|敬请期待|未完待续)',
    severity: 'medium',
    threshold: 1,
    enabled: true,
    priority: 70,
    lastUpdated: new Date().toISOString(),
    hitCount: 0,
    falsePositiveCount: 0,
    tags: ['叙事', '结尾'],
  },
  {
    id: 'narr-002',
    type: 'narrative-structure',
    category: 'narrative',
    name: '系统提示套路',
    description: '过度依赖系统提示推动剧情',
    pattern: ['系统提示', '系统发布', '系统奖励', '系统任务', '叮'],
    severity: 'medium',
    threshold: 3,
    enabled: true,
    priority: 70,
    lastUpdated: new Date().toISOString(),
    hitCount: 0,
    falsePositiveCount: 0,
    tags: ['叙事', '系统流'],
  },
  {
    id: 'dialogue-001',
    type: 'dialogue-cliche',
    category: 'dialogue',
    name: '反问套路',
    description: '过度使用反问句式',
    regex: '(难道\\S+吗\\？|难道\\S+不成\\？)',
    severity: 'low',
    threshold: 3,
    enabled: true,
    priority: 60,
    lastUpdated: new Date().toISOString(),
    hitCount: 0,
    falsePositiveCount: 0,
    tags: ['对话', '句式'],
  },
  {
    id: 'dialogue-002',
    type: 'dialogue-cliche',
    category: 'dialogue',
    name: '咆哮对话',
    description: '过度使用感叹号表达情绪',
    regex: '！！',
    severity: 'low',
    threshold: 5,
    enabled: true,
    priority: 60,
    lastUpdated: new Date().toISOString(),
    hitCount: 0,
    falsePositiveCount: 0,
    tags: ['对话', '标点'],
  },
  {
    id: 'character-001',
    type: 'character-arc',
    category: 'character',
    name: '性格突变',
    description: '角色性格前后不一致',
    pattern: ['温柔', '暴躁', '冷酷', '善良', '残忍'],
    severity: 'high',
    threshold: 2,
    enabled: true,
    priority: 50,
    lastUpdated: new Date().toISOString(),
    hitCount: 0,
    falsePositiveCount: 0,
    tags: ['角色', '一致性'],
  },
];

function createEmptyState(): AntiClicheEngineState {
  return {
    rules: DEFAULT_RULES,
    strategies: DEFAULT_STRATEGIES,
    detectorConfigs: DEFAULT_DETECTORS,
    evolutionEvents: [],
    lastEvolutionRun: '',
    statistics: {
      totalRules: DEFAULT_RULES.length,
      activeRules: DEFAULT_RULES.filter(r => r.enabled).length,
      totalFindings: 0,
      autoLearnedRules: 0,
      falsePositivesFixed: 0,
    },
  };
}

function loadState(filePath: string): AntiClicheEngineState {
  try {
    if (!existsSync(filePath)) return createEmptyState();
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AntiClicheEngineState>;

    const state = createEmptyState();
    if (parsed.rules) state.rules = parsed.rules;
    if (parsed.strategies) state.strategies = parsed.strategies;
    if (parsed.detectorConfigs) state.detectorConfigs = parsed.detectorConfigs;
    if (parsed.evolutionEvents) state.evolutionEvents = parsed.evolutionEvents;
    if (parsed.lastEvolutionRun) state.lastEvolutionRun = parsed.lastEvolutionRun;
    if (parsed.statistics) state.statistics = parsed.statistics;

    return state;
  } catch (err) {
    log.warn(`加载反套路状态失败，使用默认配置: ${filePath}`, {
      reason: err instanceof Error ? err.message : String(err),
    });
    return createEmptyState();
  }
}

function saveState(filePath: string, state: AntiClicheEngineState): void {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    log.warn(`保存反套路状态失败: ${filePath}`, {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

function getNovelStatePath(novelsDir: string, novelId: string): string {
  return join(novelsDir, novelId, STATE_FILE);
}

function getGlobalStatePath(novelsDir: string): string {
  return join(novelsDir, GLOBAL_DIR, STATE_FILE);
}

export class ClicheRuleStore {
  private novelsDir: string;
  private novelStates = new Map<string, AntiClicheEngineState>();
  private globalState: AntiClicheEngineState;

  constructor(novelsDir: string) {
    this.novelsDir = novelsDir;
    this.globalState = loadState(getGlobalStatePath(novelsDir));
  }

  getGlobalRules(): ClicheRule[] {
    return this.globalState.rules;
  }

  getNovelRules(novelId: string): ClicheRule[] {
    this.ensureNovelState(novelId);
    const novelState = this.novelStates.get(novelId)!;
    return [...this.globalState.rules, ...novelState.rules];
  }

  getStrategies(): EvolutionStrategy[] {
    return this.globalState.strategies;
  }

  getDetectorConfigs(): DetectorConfig[] {
    return this.globalState.detectorConfigs;
  }

  addRule(rule: ClicheRule, novelId?: string): void {
    if (novelId) {
      this.ensureNovelState(novelId);
      const state = this.novelStates.get(novelId)!;
      const exists = state.rules.find(r => r.id === rule.id);
      if (!exists) {
        state.rules.push(rule);
        state.statistics.totalRules++;
        if (rule.enabled) state.statistics.activeRules++;
        saveState(getNovelStatePath(this.novelsDir, novelId), state);
      }
    } else {
      const exists = this.globalState.rules.find(r => r.id === rule.id);
      if (!exists) {
        this.globalState.rules.push(rule);
        this.globalState.statistics.totalRules++;
        if (rule.enabled) this.globalState.statistics.activeRules++;
        saveState(getGlobalStatePath(this.novelsDir), this.globalState);
      }
    }
  }

  updateRule(ruleId: string, updates: Partial<ClicheRule>, novelId?: string): boolean {
    let targetState: AntiClicheEngineState;
    if (novelId) {
      this.ensureNovelState(novelId);
      targetState = this.novelStates.get(novelId)!;
    } else {
      targetState = this.globalState;
    }

    const index = targetState.rules.findIndex((r: ClicheRule) => r.id === ruleId);
    if (index === -1) return false;

    targetState.rules[index] = { ...targetState.rules[index], ...updates, lastUpdated: new Date().toISOString() };

    if (novelId) {
      saveState(getNovelStatePath(this.novelsDir, novelId), targetState);
    } else {
      saveState(getGlobalStatePath(this.novelsDir), targetState);
    }
    return true;
  }

  deleteRule(ruleId: string, novelId?: string): boolean {
    let targetState: AntiClicheEngineState;
    if (novelId) {
      this.ensureNovelState(novelId);
      targetState = this.novelStates.get(novelId)!;
    } else {
      targetState = this.globalState;
    }

    const initialLength = targetState.rules.length;
    targetState.rules = targetState.rules.filter((r: ClicheRule) => r.id !== ruleId);

    if (targetState.rules.length !== initialLength) {
      targetState.statistics.totalRules--;
      if (novelId) {
        saveState(getNovelStatePath(this.novelsDir, novelId), targetState);
      } else {
        saveState(getGlobalStatePath(this.novelsDir), targetState);
      }
      return true;
    }
    return false;
  }

  recordHit(ruleId: string, novelId?: string): void {
    this.updateRule(ruleId, { hitCount: (this.getRule(ruleId, novelId)?.hitCount || 0) + 1 }, novelId);
  }

  recordFalsePositive(ruleId: string, novelId?: string): void {
    const rule = this.getRule(ruleId, novelId);
    if (rule) {
      const newFalsePositiveCount = rule.falsePositiveCount + 1;
      const newPrecision = rule.hitCount + newFalsePositiveCount > 0
        ? rule.hitCount / (rule.hitCount + newFalsePositiveCount)
        : undefined;
      this.updateRule(ruleId, { falsePositiveCount: newFalsePositiveCount, precision: newPrecision }, novelId);
    }
  }

  getRule(ruleId: string, novelId?: string): ClicheRule | undefined {
    if (novelId) {
      this.ensureNovelState(novelId);
      const novelState = this.novelStates.get(novelId);
      return novelState?.rules.find(r => r.id === ruleId) || this.globalState.rules.find(r => r.id === ruleId);
    }
    return this.globalState.rules.find(r => r.id === ruleId);
  }

  addEvolutionEvent(event: Omit<AntiClicheEngineState['evolutionEvents'][0], 'timestamp'>): void {
    this.globalState.evolutionEvents.push({
      ...event,
      timestamp: new Date().toISOString(),
    });

    if (this.globalState.evolutionEvents.length > 1000) {
      this.globalState.evolutionEvents = this.globalState.evolutionEvents.slice(-500);
    }

    saveState(getGlobalStatePath(this.novelsDir), this.globalState);
  }

  getState(novelId?: string): AntiClicheEngineState {
    if (novelId) {
      this.ensureNovelState(novelId);
      return this.novelStates.get(novelId)!;
    }
    return this.globalState;
  }

  private ensureNovelState(novelId: string): void {
    if (!this.novelStates.has(novelId)) {
      const state = loadState(getNovelStatePath(this.novelsDir, novelId));
      this.novelStates.set(novelId, state);
    }
  }

  generateRuleId(type: string): string {
    const prefix = type.slice(0, 4);
    const timestamp = Date.now().toString(36);
    return `${prefix}-${timestamp}`;
  }
}