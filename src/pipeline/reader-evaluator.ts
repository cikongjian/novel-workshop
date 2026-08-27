import type { AgentOutput, AgentRole, AgentContext } from '../agents/types.js';
import { synthesizeDeterministicReader, type DeterministicReaderInput } from './deterministic-reader.js';
import { getAdaptiveTemperature } from './context-builders.js';

export interface ReaderEvaluatorOptions extends DeterministicReaderInput {
  useLlmReader: boolean;
  baseContext: Omit<AgentContext, 'inputText'>;
  scenePlan?: string;
  outlineContract?: string;
  worldContract?: string;
  structuredAuditEnabled: boolean;
  chapterContent: string;
  runAgent: (role: AgentRole, ctx: AgentContext) => Promise<AgentOutput>;
  allOutputs: AgentOutput[];
  pipelineLog: { debug: (msg: string) => void };
}

export interface ReaderEvaluationResult {
  readerOutput: AgentOutput;
  usedLlm: boolean;
}

export async function evaluateReader(
  options: ReaderEvaluatorOptions,
): Promise<ReaderEvaluationResult> {
  const {
    useLlmReader,
    baseContext,
    scenePlan,
    outlineContract,
    worldContract,
    structuredAuditEnabled,
    chapterContent,
    qualityReport,
    aiTraceReport,
    continuityReport,
    commercialReport,
    worldFulfillment,
    outlineFulfillment,
    speakerWhitelistReport,
    runAgent,
    allOutputs,
    pipelineLog,
  } = options;

  let readerOutput: AgentOutput = {
    agentRole: 'reader' as AgentRole,
    content: '',
    timestamp: new Date().toISOString(),
  };

  if (!useLlmReader) {
    readerOutput.content = synthesizeDeterministicReader({
      chapterContent,
      qualityReport,
      aiTraceReport,
      continuityReport,
      commercialReport,
      worldFulfillment,
      outlineFulfillment,
      speakerWhitelistReport,
    });
    pipelineLog.debug('使用确定性 Reader（自动修订已禁用，跳过 LLM Reader）');
    allOutputs.push(readerOutput);
    return { readerOutput, usedLlm: false };
  }

  const readerContext: AgentContext = {
    ...baseContext,
    scenePlan,
    outlineContract: outlineContract || undefined,
    worldContract,
    inputText: chapterContent,
    temperatureOverride: getAdaptiveTemperature('reader', false),
    useStructuredAudit: structuredAuditEnabled,
  };
  readerOutput = await runAgent('reader', readerContext);
  return { readerOutput, usedLlm: true };
}
