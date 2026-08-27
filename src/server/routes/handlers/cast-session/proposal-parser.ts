import { CastProposalSchema, type CastProposal } from './schemas.js';

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstObj = trimmed.indexOf('{');
  const lastObj = trimmed.lastIndexOf('}');
  if (firstObj >= 0 && lastObj > firstObj) {
    return trimmed.slice(firstObj, lastObj + 1);
  }
  return trimmed;
}

export function parseProposalFromModel(raw: string, maxCharacters: number): CastProposal {
  const jsonPayload = extractJsonPayload(raw);
  const parsed = JSON.parse(jsonPayload) as unknown;
  const proposal = CastProposalSchema.parse(parsed);
  return {
    ...proposal,
    characters: proposal.characters.slice(0, maxCharacters),
  };
}
