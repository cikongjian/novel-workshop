import type { AgentOutput, AgentRole } from '../agents/types.js';
import type { NovelMetadata, CharacterProfile } from '../novel/types.js';
import type {
  ChapterGenerationResult,
  PipelineMemory,
  PipelineNovelManager,
} from './types.js';
import type { ModelClient } from '../models/types.js';
import type { PerformanceTracker } from './performance-tracker.js';
import type { CollaborationLog } from './collaboration-log.js';
import type { WorldContract } from './world-contract.js';

export interface PipelineContext {
  novelId: string;
  chapterNumber: number;
  runId: string;
  novel: NovelMetadata;
  characters: CharacterProfile[];
  worldEntries: unknown[];
  memory: PipelineMemory;
  novelManager: PipelineNovelManager;
  model: ModelClient;
  perfTracker: PerformanceTracker;
  collaborationLog: CollaborationLog;
  allOutputs: AgentOutput[];
}

export interface GateResults {
  worldFulfillment?: ChapterGenerationResult['worldFulfillment'];
  worldGateRewrite?: ChapterGenerationResult['worldGateRewrite'];
  outlineFulfillment?: ChapterGenerationResult['outlineFulfillment'];
  outlineGateRewrite?: ChapterGenerationResult['outlineGateRewrite'];
  qualityReport?: ChapterGenerationResult['qualityReport'];
  qualityGateRewrite?: ChapterGenerationResult['qualityGateRewrite'];
  chapterPromiseReport?: ChapterGenerationResult['chapterPromiseReport'];
  chapterPromiseGateRewrite?: ChapterGenerationResult['chapterPromiseGateRewrite'];
  commercialReport?: ChapterGenerationResult['commercialReport'];
  commercialGateRewrite?: ChapterGenerationResult['commercialGateRewrite'];
  startupOpeningReport?: ChapterGenerationResult['startupOpeningReport'];
  startupOpeningGateRewrite?: ChapterGenerationResult['startupOpeningGateRewrite'];
  continuityReport?: ChapterGenerationResult['continuityReport'];
  speakerWhitelistReport?: ChapterGenerationResult['speakerWhitelistReport'];
  powerRuleReport?: ChapterGenerationResult['powerRuleReport'];
  chapterLengthGuard?: ChapterGenerationResult['chapterLengthGuard'];
}

export interface PipelineOutputs {
  outlineOutput: AgentOutput;
  worldOutput?: AgentOutput;
  charOutput?: AgentOutput;
  writerOutput?: AgentOutput;
  editorOutput?: AgentOutput;
  readerOutput?: AgentOutput;
}

export interface PipelineContexts {
  baseContext: Record<string, unknown>;
  outlineContext: Record<string, unknown>;
  writerContext: Record<string, unknown>;
  editorContext: Record<string, unknown>;
}

export class ChapterPipelineState {
  context: PipelineContext;
  outputs: PipelineOutputs = {} as PipelineOutputs;
  contexts: PipelineContexts = {} as PipelineContexts;
  gateResults: GateResults = {};

  outlineContract?: ChapterGenerationResult['outlineContract'];
  worldContract?: WorldContract;
  scenePlan?: unknown;
  styleProfile?: unknown;

  chapterDraftText = '';
  polishedText = '';
  finalEditedContent = '';

  knownCharacterNames: string[] = [];
  domainStructureKeywords: string[] = [];

  constructor(context: PipelineContext) {
    this.context = context;
  }

  get novelId(): string {
    return this.context.novelId;
  }

  get chapterNumber(): number {
    return this.context.chapterNumber;
  }

  get novel(): NovelMetadata {
    return this.context.novel;
  }

  get characters(): CharacterProfile[] {
    return this.context.characters;
  }

  get perfTracker(): PerformanceTracker {
    return this.context.perfTracker;
  }

  addOutput(role: AgentRole, output: AgentOutput): void {
    const outputsRecord = this.outputs as unknown as Record<AgentRole, AgentOutput>;
    outputsRecord[role] = output;
    this.context.allOutputs.push(output);
  }

  getOutput(role: AgentRole): AgentOutput | undefined {
    const outputsRecord = this.outputs as unknown as Record<AgentRole, AgentOutput>;
    return outputsRecord[role];
  }

  setGateResult<K extends keyof GateResults>(key: K, value: GateResults[K]): void {
    this.gateResults[key] = value;
  }

  getGateResult<K extends keyof GateResults>(key: K): GateResults[K] | undefined {
    return this.gateResults[key];
  }
}
