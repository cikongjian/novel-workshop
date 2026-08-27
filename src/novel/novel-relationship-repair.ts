import type { CharacterProfile } from './types.js';

export type OrphanRelationshipRepair = {
  characterId: string;
  previousTargetId: string;
  nextTargetId: string;
  targetName: string;
  relationshipIndex: number;
};

function relationshipEvidence(
  relationship: CharacterProfile['relationships'][number],
): string {
  return [
    relationship.description,
    relationship.emotionalDebt,
    relationship.sharedHistory,
    relationship.publicVsPrivate,
  ].filter(Boolean).join('\n');
}

export function planOrphanRelationshipRepairs(
  characters: CharacterProfile[],
): OrphanRelationshipRepair[] {
  const existingIds = new Set(characters.map(character => character.id));
  const candidates: Array<{
    character: CharacterProfile;
    relationshipIndex: number;
    relationship: CharacterProfile['relationships'][number];
    targets: CharacterProfile[];
  }> = [];

  for (const character of characters) {
    character.relationships.forEach((relationship, relationshipIndex) => {
      if (existingIds.has(relationship.targetId)) return;
      const evidence = relationshipEvidence(relationship);
      if (!evidence) return;

      const targets = characters.filter(candidate => (
        candidate.id !== character.id
        && [candidate.name, ...candidate.aliases]
          .filter(name => name.trim().length >= 2)
          .some(name => evidence.includes(name))
      ));
      candidates.push({
        character,
        relationshipIndex,
        relationship,
        targets: [...new Map(targets.map(target => [target.id, target])).values()],
      });
    });
  }

  const directTargetIdsByPreviousId = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (candidate.targets.length !== 1) continue;
    const targetIds = directTargetIdsByPreviousId.get(candidate.relationship.targetId) ?? new Set();
    targetIds.add(candidate.targets[0]!.id);
    directTargetIdsByPreviousId.set(candidate.relationship.targetId, targetIds);
  }

  const plans: OrphanRelationshipRepair[] = [];
  for (const candidate of candidates) {
    const consensusIds = directTargetIdsByPreviousId.get(candidate.relationship.targetId);
    const consensusTarget = consensusIds?.size === 1
      ? characters.find(character => character.id === [...consensusIds][0])
      : undefined;
    const target = candidate.targets.length === 1 ? candidate.targets[0] : consensusTarget;
    if (!target || target.id === candidate.character.id) continue;
    plans.push({
        characterId: candidate.character.id,
        previousTargetId: candidate.relationship.targetId,
        nextTargetId: target.id,
        targetName: target.name,
        relationshipIndex: candidate.relationshipIndex,
      });
  }
  return plans;
}

export function applyOrphanRelationshipRepairs(
  characters: CharacterProfile[],
  plans: OrphanRelationshipRepair[],
): CharacterProfile[] {
  const plansByCharacter = new Map<string, Map<number, OrphanRelationshipRepair>>();
  for (const plan of plans) {
    const characterPlans = plansByCharacter.get(plan.characterId) ?? new Map();
    characterPlans.set(plan.relationshipIndex, plan);
    plansByCharacter.set(plan.characterId, characterPlans);
  }

  return characters.map(character => {
    const characterPlans = plansByCharacter.get(character.id);
    if (!characterPlans) return character;
    return {
      ...character,
      relationships: character.relationships.map((relationship, index) => {
        const plan = characterPlans.get(index);
        return plan ? { ...relationship, targetId: plan.nextTargetId } : relationship;
      }),
    };
  });
}
