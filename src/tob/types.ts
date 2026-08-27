export type TobJobType = 'generate' | 'intervene';

export type TobJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface TobProject {
  id: string;
  name: string;
  brief: string;
  pipelineNovelId?: string;
  sourceNovelId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TobGeneratePayload {
  pipelineKey?: string;
  prompt?: string;
  constraints?: string;
  sourceNovelId?: string;
  sourceChapterStart?: number;
  sourceChapterEnd?: number;
  adaptationMode?: 'short-drama' | 'comic';
  qualityProfile?: 'balanced' | 'hook-first';
  outputFormat?: 'mp3' | 'm4a';
  includeChapterMarkers?: boolean;
  autoDesignVoices?: boolean;
}

export interface TobIntervenePayload {
  pipelineKey?: string;
  instruction: string;
  baseJobId: string;
}

export type TobJobPayload = TobGeneratePayload | TobIntervenePayload;

export interface TobPipelineRef {
  pipelineKey: string;
  novelId: string;
  chapterNumber: number;
  mode:
    | 'chapter-pipeline'
    | 'revision-pipeline'
    | 'adapt-short-drama'
    | 'adapt-comic'
    | 'sop-short-drama'
    | 'mock';
}

export interface TobJob {
  id: string;
  projectId: string;
  type: TobJobType;
  status: TobJobStatus;
  payload: TobJobPayload;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  outputFile?: string;
  outputPreview?: string;
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  pipeline?: TobPipelineRef;
  error?: string;
  progressMessage?: string;
}

export interface TobState {
  projects: Record<string, TobProject>;
  jobs: Record<string, TobJob>;
  projectJobs: Record<string, string[]>;
  queue: string[];
}

export interface TobJobRunResult {
  markdown: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  pipeline?: TobPipelineRef;
}

export interface TobPipelineSummary {
  key: string;
  name: string;
  description: string;
  supportsIntervention: boolean;
}
