import type { AgentContext, AgentOutput, AgentRole } from '../agents/types.js';
import type { WorldEntry } from '../novel/types.js';
import { parseEditorOutput } from './editor-output-parser.js';
import { buildWorldGateFixHints, shouldAttemptWorldGateFix } from './gate-orchestrator.js';
import {
  evaluateWorldContractFulfillment,
  type WorldContract,
  type WorldContractFulfillment,
  type WorldGateRewriteReport,
  type WorldGateMode,
} from './world-contract.js';

function isImproved(before: WorldContractFulfillment, after: WorldContractFulfillment): boolean {
  return (
    after.findings.length < before.findings.length
    || after.requiredHit > before.requiredHit
    || after.unsourcedTerms.length < before.unsourcedTerms.length
  ) && after.requiredHit >= before.requiredHit
    && after.unsourcedTerms.length <= before.unsourcedTerms.length;
}

export async function enforceFinalWorldContract(params: {
  contract: WorldContract;
  chapterContent: string;
  finalEditedContent: string;
  gateMode: WorldGateMode;
  knownWorldEntries: WorldEntry[];
  knownCharacterNames: string[];
  skipStrictGate: boolean;
  editorContext: AgentContext;
  runAgent: (role: AgentRole, context: AgentContext) => Promise<AgentOutput>;
  traceStage?: (stage: string, text: string) => void;
}): Promise<{
  chapterContent: string;
  finalEditedContent: string;
  fulfillment: WorldContractFulfillment;
  rewrite?: WorldGateRewriteReport;
}> {
  const before = evaluateWorldContractFulfillment({
    contract: params.contract,
    chapterContent: params.chapterContent,
    gateMode: params.gateMode,
    knownWorldEntries: params.knownWorldEntries,
    knownCharacterNames: params.knownCharacterNames,
  });
  if (!shouldAttemptWorldGateFix({
    fulfillment: before,
    contract: params.contract,
    gateMode: params.gateMode,
    skipStrictGate: params.skipStrictGate,
  })) {
    return {
      chapterContent: params.chapterContent,
      finalEditedContent: params.finalEditedContent,
      fulfillment: before,
    };
  }

  const fixHints = buildWorldGateFixHints(before, params.contract);
  const editorOutput = await params.runAgent('editor', {
    ...params.editorContext,
    inputText: params.chapterContent,
    worldGateFixHints: fixHints,
  });
  const parsed = parseEditorOutput(editorOutput.content);
  const candidateContent = parsed.polishedText || params.chapterContent;
  const after = evaluateWorldContractFulfillment({
    contract: params.contract,
    chapterContent: candidateContent,
    gateMode: params.gateMode,
    knownWorldEntries: params.knownWorldEntries,
    knownCharacterNames: params.knownCharacterNames,
  });
  const applied = parsed.polishedText.length > 0 && isImproved(before, after);
  if (applied) params.traceStage?.('world-gate.final-rewrite', candidateContent);

  return {
    chapterContent: applied ? candidateContent : params.chapterContent,
    finalEditedContent: applied ? editorOutput.content : params.finalEditedContent,
    fulfillment: applied ? after : before,
    rewrite: {
      attempted: true,
      applied,
      reason: fixHints,
      before,
      after,
    },
  };
}
