import { http } from './http';
import type { StartupOpeningStrategyDigest } from './generate';

// ==================== 平台技能中心 ====================

export type AgentSkillStatus = 'draft' | 'active' | 'archived';
export type AgentSkillActivation = 'manual' | 'auto';

export type AgentSkillDefinition = {
  id: string;
  name: string;
  description: string;
  instruction: string;
  targetRoles: string[];
  targetGenres: string[];
  priority: number;
  status: AgentSkillStatus;
  activation: AgentSkillActivation;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
};

export type AgentSkillPolicyScope = {
  enabledSkillIds: string[];
  disabledSkillIds: string[];
  roleEnabledSkillIds: Record<string, string[]>;
  roleDisabledSkillIds: Record<string, string[]>;
};

export type AgentSkillEffectsSummary = {
  rangeDays: number;
  totalRuns: number;
  runsWithSkills: number;
  adoptionRate: number;
  avgInputChars: number;
  avgOutputChars: number;
  avgLatencyMs: number;
  avgSkillsPerRun: number;
  byRole: Array<{
    role: string;
    runs: number;
    runsWithSkills: number;
    adoptionRate: number;
    avgOutputChars: number;
    avgLatencyMs: number;
  }>;
  topSkills: Array<{
    skillId: string;
    skillName: string;
    runs: number;
    share: number;
  }>;
};

export type CommercialPackMode = 'classic' | 'genre-layered';

export type ResolveAgentSkillsResponse = {
  role: string;
  novelId: string;
  genre: string;
  matchedSkills: AgentSkillDefinition[];
  selectedSkills: AgentSkillDefinition[];
  systemPromptAppendix: string;
  droppedByBudget: number;
  startupOpeningStrategyPreview?: StartupOpeningStrategyDigest;
};

export async function fetchAgentSkills(): Promise<AgentSkillDefinition[]> {
  const { data } = await http.get<{ skills: AgentSkillDefinition[] }>('/agent-skills');
  return data.skills ?? [];
}

export async function createAgentSkill(params: {
  name: string;
  description?: string;
  instruction: string;
  targetRoles: string[];
  targetGenres?: string[];
  priority?: number;
  status?: AgentSkillStatus;
  activation?: AgentSkillActivation;
  tags?: string[];
  createdBy?: string;
}): Promise<AgentSkillDefinition> {
  const { data } = await http.post<{ skill: AgentSkillDefinition }>('/agent-skills', params);
  return data.skill;
}

export async function updateAgentSkill(id: string, params: {
  name?: string;
  description?: string;
  instruction?: string;
  targetRoles?: string[];
  targetGenres?: string[];
  priority?: number;
  status?: AgentSkillStatus;
  activation?: AgentSkillActivation;
  tags?: string[];
  updatedBy?: string;
}): Promise<AgentSkillDefinition> {
  const { data } = await http.put<{ skill: AgentSkillDefinition }>(`/agent-skills/${id}`, params);
  return data.skill;
}

export async function deleteAgentSkill(id: string): Promise<void> {
  await http.delete(`/agent-skills/${id}`);
}

export async function publishAgentSkill(id: string): Promise<AgentSkillDefinition> {
  const { data } = await http.post<{ skill: AgentSkillDefinition }>(`/agent-skills/${id}/publish`);
  return data.skill;
}

export async function archiveAgentSkill(id: string): Promise<AgentSkillDefinition> {
  const { data } = await http.post<{ skill: AgentSkillDefinition }>(`/agent-skills/${id}/archive`);
  return data.skill;
}

export async function fetchAgentSkillGlobalPolicy(): Promise<AgentSkillPolicyScope> {
  const { data } = await http.get<{ policy: AgentSkillPolicyScope }>('/agent-skills/policy/global');
  return data.policy;
}

export async function updateAgentSkillGlobalPolicy(policy: AgentSkillPolicyScope): Promise<AgentSkillPolicyScope> {
  const { data } = await http.put<{ policy: AgentSkillPolicyScope }>('/agent-skills/policy/global', policy);
  return data.policy;
}

export async function seedCommercialAgentSkills(params?: {
  enableByDefault?: boolean;
  refreshExisting?: boolean;
  mode?: CommercialPackMode;
  createdBy?: string;
}): Promise<{
  message: string;
  mode?: CommercialPackMode;
  createdCount: number;
  updatedCount: number;
  reusedCount: number;
  enabledSkillIds: string[];
  created: AgentSkillDefinition[];
  updated: AgentSkillDefinition[];
  reused: AgentSkillDefinition[];
}> {
  const { data } = await http.post('/agent-skills/seed-commercial-pack', params ?? {});
  return data;
}

export type AgentSkillAbScore = {
  overall: number;
  structure: number;
  style: number;
  emotion: number;
  summary: string;
};

export type AgentSkillAbComparison = {
  label: string;
  novelId: string;
  chapterNumber: number;
  skillCountBefore: number;
  skillCountAfter: number;
  before: AgentSkillAbScore;
  after: AgentSkillAbScore;
  delta: {
    overall: number;
    structure: number;
    style: number;
    emotion: number;
  };
};

export type AgentSkillAbTestResult = {
  testedAt: string;
  durationMs: number;
  seedMode: CommercialPackMode;
  sampleCount: number;
  seedResult: {
    createdCount: number;
    updatedCount: number;
    reusedCount: number;
  };
  comparisons: AgentSkillAbComparison[];
  averageDelta: {
    overall: number;
    structure: number;
    style: number;
    emotion: number;
  };
};

export async function runAgentSkillCommercialAbTest(params?: {
  sampleCount?: number;
  seedMode?: CommercialPackMode;
  refreshExisting?: boolean;
}): Promise<AgentSkillAbTestResult> {
  const { data } = await http.post<AgentSkillAbTestResult>('/agent-skills/ab-test', params ?? {}, { timeout: 1800000 });
  return data;
}

export async function fetchAgentSkillEffectsSummary(params?: {
  days?: number;
  role?: string;
  novelId?: string;
}): Promise<AgentSkillEffectsSummary> {
  const { data } = await http.get<AgentSkillEffectsSummary>('/agent-skills/effects/summary', { params });
  return data;
}

export type AgentSkillTrendDataPoint = {
  date: string;
  totalRuns: number;
  runsWithSkills: number;
  adoptionRate: number;
  avgOutputChars: number;
  avgLatencyMs: number;
  avgSkillsPerRun: number;
};

export type AgentSkillEffectsTrend = {
  rangeDays: number;
  dataPoints: AgentSkillTrendDataPoint[];
};

export async function fetchAgentSkillEffectsTrend(params?: {
  days?: number;
  role?: string;
  novelId?: string;
}): Promise<AgentSkillEffectsTrend> {
  const { data } = await http.get<AgentSkillEffectsTrend>('/agent-skills/effects/trend', { params });
  return data;
}

export type AgentSkillComparisonMetrics = {
  runs: number;
  adoptionRate: number;
  avgOutputChars: number;
  avgLatencyMs: number;
  avgSkillsPerRun: number;
};

export type AgentSkillComparison = {
  skillAId: string;
  skillAName: string;
  skillBId: string;
  skillBName: string;
  rangeDays: number;
  skillA: AgentSkillComparisonMetrics;
  skillB: AgentSkillComparisonMetrics;
  delta: {
    runs: number;
    adoptionRate: number;
    avgOutputChars: number;
    avgLatencyMs: number;
    avgSkillsPerRun: number;
  };
};

export async function compareAgentSkills(params: {
  skillAId: string;
  skillBId: string;
  days?: number;
  role?: string;
  novelId?: string;
}): Promise<AgentSkillComparison> {
  const { data } = await http.get<AgentSkillComparison>('/agent-skills/effects/compare', { params });
  return data;
}

export type QualityCorrelationDataPoint = {
  skillCount: number;
  chapterCount: number;
  avgQualityScore: number;
  avgStructureScore: number;
  avgStyleScore: number;
  avgEmotionScore: number;
};

export type AgentSkillQualityCorrelation = {
  rangeDays: number;
  totalChapters: number;
  dataPoints: QualityCorrelationDataPoint[];
  correlation: {
    overall: number;
    structure: number;
    style: number;
    emotion: number;
  };
  summary: string;
};

export async function fetchAgentSkillQualityCorrelation(params?: {
  days?: number;
  role?: string;
  novelId?: string;
}): Promise<AgentSkillQualityCorrelation> {
  const { data } = await http.get<AgentSkillQualityCorrelation>('/agent-skills/effects/quality-correlation', { params });
  return data;
}

export async function fetchAgentSkillNovelPolicy(novelId: string): Promise<AgentSkillPolicyScope> {
  const { data } = await http.get<{ novelId: string; policy: AgentSkillPolicyScope }>(`/agent-skills/policy/novels/${novelId}`);
  return data.policy;
}

export async function updateAgentSkillNovelPolicy(novelId: string, policy: AgentSkillPolicyScope): Promise<AgentSkillPolicyScope> {
  const { data } = await http.put<{ message: string; novelId: string; policy: AgentSkillPolicyScope }>(`/agent-skills/policy/novels/${novelId}`, policy);
  return data.policy;
}

export async function generateAgentSkill(params: {
  novelId: string;
  requirement: string;
  targetGenre?: string;
  targetRoles?: string[];
}): Promise<{
  message: string;
  skill: AgentSkillDefinition;
  reasoning: string;
  costPoints: number;
}> {
  const { data } = await http.post('/agent-skills/generate', params);
  return data;
}

export async function resolveAgentSkills(params: {
  novelId: string;
  genre: string;
  role: string;
  chapterNumber?: number;
  promptBudgetChars?: number;
  startupPlatformProfile?: 'auto' | 'fanqie' | 'qidian';
  maxWordCount?: number;
}): Promise<ResolveAgentSkillsResponse> {
  const { data } = await http.post<ResolveAgentSkillsResponse>('/agent-skills/resolve', params);
  return data;
}

// ==================== 技能效果追踪 ====================

export type SkillEffectRecord = {
  id: string;
  novelId: string;
  chapterNumber: number;
  appliedSkills: string[];
  qualityBefore?: {
    overall: number;
    structure: number;
    style: number;
    emotion: number;
  };
  qualityAfter: {
    overall: number;
    structure: number;
    style: number;
    emotion: number;
  };
  userFeedback?: 'helpful' | 'neutral' | 'unhelpful';
  agentRole: string;
  createdAt: string;
  updatedAt: string;
};

export async function submitSkillFeedback(params: {
  novelId: string;
  chapterNumber: number;
  feedback: 'helpful' | 'neutral' | 'unhelpful';
}): Promise<{ message: string; record: SkillEffectRecord }> {
  const { data } = await http.post(
    `/agent-skills/novels/${params.novelId}/chapters/${params.chapterNumber}/skill-feedback`,
    { feedback: params.feedback }
  );
  return data;
}

export async function fetchChapterSkillEffects(params: {
  novelId: string;
  chapterNumber: number;
}): Promise<{ effects: SkillEffectRecord[] }> {
  const { data } = await http.get(
    `/agent-skills/novels/${params.novelId}/chapters/${params.chapterNumber}/skill-effects`
  );
  return data;
}

// ==================== 技能版本历史 ====================

export type AgentSkillVersion = {
  versionId: string;
  skillId: string;
  name: string;
  description: string;
  instruction: string;
  targetRoles: string[];
  targetGenres: string[];
  priority: number;
  status: AgentSkillStatus;
  activation: AgentSkillActivation;
  tags: string[];
  createdAt: string;
  createdBy?: string;
  changeNote?: string;
};

export type AgentSkillVersionHistory = {
  skillId: string;
  currentVersion: string;
  versions: AgentSkillVersion[];
};

export type AgentSkillVersionDiff = {
  versionAId: string;
  versionBId: string;
  changes: Array<{
    field: string;
    oldValue: any;
    newValue: any;
    changeType: 'added' | 'removed' | 'modified';
  }>;
};

export async function fetchAgentSkillVersionHistory(skillId: string): Promise<AgentSkillVersionHistory> {
  const { data } = await http.get<AgentSkillVersionHistory>(`/agent-skills/${skillId}/versions`);
  return data;
}

export async function compareAgentSkillVersions(versionAId: string, versionBId: string): Promise<AgentSkillVersionDiff> {
  const { data } = await http.get<AgentSkillVersionDiff>(`/agent-skills/versions/${versionAId}/compare/${versionBId}`);
  return data;
}

export async function rollbackAgentSkillToVersion(params: {
  skillId: string;
  versionId: string;
  updatedBy?: string;
}): Promise<{ message: string; skill: AgentSkillDefinition }> {
  const { data } = await http.post(`/agent-skills/${params.skillId}/rollback/${params.versionId}`, {
    updatedBy: params.updatedBy,
  });
  return data;
}
