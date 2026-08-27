import { randomUUID } from 'node:crypto';
import type { ChapterOutline, CharacterProfile, OutlineData, WorldEntry } from '../../../../novel/types.js';
import type { DnaCreateNovelBody, DnaFateProfile, DnaStoryDesign } from './dna-schemas.js';

const DEFAULT_TENSION_TARGET = 5;

function now(): string {
  return new Date().toISOString();
}

function buildMappingNotes(design: DnaStoryDesign): string[] {
  return design.storyBlueprint.decisionMappings
    .map(mapping => `${mapping.source} => ${mapping.novelUse}`)
    .filter(Boolean);
}

export function buildDnaEnhancedOutline(design: DnaStoryDesign): OutlineData {
  const mappingNotes = buildMappingNotes(design);
  const plotThreadId = randomUUID();
  const chapters: ChapterOutline[] = design.storyBlueprint.chapterOutline.map((chapter, index) => {
    const mapping = mappingNotes[index % Math.max(mappingNotes.length, 1)] ?? '';
    return {
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      summary: chapter.summary,
      beats: mapping ? [{
        id: randomUUID(),
        summary: mapping,
        characters: [],
        location: '',
        tension: DEFAULT_TENSION_TARGET,
        notes: 'DNA选择约束',
      }] : [],
      tensionTarget: DEFAULT_TENSION_TARGET,
      plotThreadsAdvanced: [plotThreadId],
      keyEvents: [chapter.summary, mapping].filter(Boolean),
      notes: mapping ? `DNA选择约束：${mapping}` : '',
    };
  });

  return {
    chapters,
    plotThreads: [
      {
        id: plotThreadId,
        name: '命运主线',
        description: design.storyBlueprint.mainConflict || design.storyBlueprint.premise,
        status: 'planted',
        notes: [
          design.storyBlueprint.volumeArc,
          ...mappingNotes.slice(0, 6),
        ].filter(Boolean).join('\n'),
        prerequisites: [],
        parallelThreads: [],
        relatedCharacters: [],
      },
    ],
    foreshadowing: design.storyBlueprint.decisionMappings.length
      ? design.storyBlueprint.decisionMappings.slice(0, 6).map((mapping, index) => ({
          id: randomUUID(),
          hint: mapping.novelUse,
          plantedInChapter: index + 1,
          resolution: design.storyBlueprint.volumeArc,
          isResolved: false,
          relatedPlotThreads: [plotThreadId],
          priority: index < 3 ? 'high' : 'medium',
        }))
      : [],
  };
}

export function buildDnaCharacter(
  input: DnaCreateNovelBody,
  fateProfile: DnaFateProfile,
  design: DnaStoryDesign,
): CharacterProfile {
  const timestamp = now();
  const dnaTraits = design.protagonist.dnaTraits.length
    ? design.protagonist.dnaTraits
    : fateProfile.characterDna;
  return {
    id: randomUUID(),
    name: design.protagonist.name,
    aliases: [],
    gender: design.protagonist.gender,
    role: 'protagonist',
    position: design.protagonist.belief || fateProfile.protagonistArchetype,
    appearance: design.protagonist.appearance,
    personality: design.protagonist.personality,
    personalityTraits: dnaTraits,
    speechStyle: design.protagonist.personality.slice(0, 80),
    speechExamples: [],
    backstory: design.protagonist.backstory,
    motivation: design.protagonist.goal,
    abilities: [
      ...input.constitutionTags,
      ...fateProfile.openingObligations,
    ].filter(Boolean),
    relationships: [],
    arc: design.storyBlueprint.volumeArc,
    currentState: design.storyBlueprint.openingHook,
    voiceDesignStatus: 'none',
    drives: {
      want: design.protagonist.goal,
      need: design.protagonist.belief || '把选择变成可见战果',
      fear: design.protagonist.weakness || fateProfile.conflictBias,
      secret: fateProfile.coreFate,
      taboo: fateProfile.openingObligations,
    },
    personalityModel: {
      traits: dnaTraits,
      innerContradictions: [design.protagonist.weakness || fateProfile.conflictBias].filter(Boolean),
      moralBoundary: fateProfile.openingObligations,
    },
    psychology: {
      worldview: design.protagonist.belief || fateProfile.coreFate,
      copingMechanisms: fateProfile.readerPleasure,
      emotionalTriggers: fateProfile.decisionEvidence.map(item => item.selectedOption),
    },
    socialIdentity: {
      faction: input.theme,
      socialClass: fateProfile.protagonistArchetype,
      reputation: design.storyBlueprint.mainConflict,
    },
    symbolism: {
      symbolObject: input.title?.trim() || design.title,
      recurringMotif: fateProfile.titleDirection,
      themeWord: fateProfile.storyKeywords[0] ?? input.theme,
    },
    growthTrack: {
      milestones: design.storyBlueprint.decisionMappings.slice(0, 6).map((mapping, index) => ({
        chapter: index + 1,
        event: mapping.novelUse,
        insight: mapping.source,
      })),
      archivedMilestonesSummary: '',
      unresolvedTrauma: [design.protagonist.weakness || fateProfile.conflictBias].filter(Boolean),
      pendingPromises: fateProfile.openingObligations,
    },
    tags: [...input.constitutionTags, ...fateProfile.storyKeywords].filter(Boolean),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function buildDnaWorldEntries(
  input: DnaCreateNovelBody,
  fateProfile: DnaFateProfile,
  design: DnaStoryDesign,
): WorldEntry[] {
  const timestamp = now();
  const entries: Array<{ name: string; description: string; tags: string[] }> = [
    {
      name: 'DNA背景宪章',
      description: design.storyBlueprint.backgroundCharter.join('\n'),
      tags: ['dna', 'background-charter'],
    },
    {
      name: '人物DNA规则',
      description: design.storyBlueprint.characterDnaRules.join('\n'),
      tags: ['dna', 'character-rules'],
    },
    {
      name: '答题选择剧情映射',
      description: design.storyBlueprint.decisionMappings
        .map(mapping => `${mapping.source} => ${mapping.novelUse}`)
        .join('\n'),
      tags: ['dna', 'decision-mapping'],
    },
  ];

  return entries.filter(entry => entry.description.trim()).map(entry => ({
    id: randomUUID(),
    category: 'rule',
    name: entry.name,
    description: entry.description,
    state: 'active',
    storyRole: 'constraint',
    constraints: [...fateProfile.worldConstraints, ...fateProfile.openingObligations],
    consequences: design.storyBlueprint.decisionMappings.map(mapping => mapping.novelUse),
    introducedIn: 1,
    source: 'manual',
    details: {
      theme: input.theme,
      fate: fateProfile.coreFate,
    },
    dependencies: [],
    conflicts: [],
    relatedEntries: [],
    tags: entry.tags,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export function buildDnaBlueprint(
  input: DnaCreateNovelBody,
  fateProfile: DnaFateProfile,
  design: DnaStoryDesign,
): Record<string, unknown> {
  return {
    audience: input.gender === '女' ? 'female' : 'male',
    genre: input.genre,
    titleCandidates: [design.title],
    logline: design.sellingPoint || design.storyBlueprint.premise,
    synopsis: design.synopsis,
    tags: input.constitutionTags,
    dna: {
      answers: input.answers,
      radar: input.radar,
      decisionEvidence: fateProfile.decisionEvidence,
      characterDna: fateProfile.characterDna,
      worldConstraints: fateProfile.worldConstraints,
      openingObligations: fateProfile.openingObligations,
      decisionMappings: design.storyBlueprint.decisionMappings,
    },
    hook: {
      openingScene: design.storyBlueprint.openingHook || design.storyBlueprint.premise,
      incitingIncident: design.storyBlueprint.mainConflict,
      firstPayoff: design.storyBlueprint.openingHook,
      chapterEndHookRule: design.storyBlueprint.volumeArc,
    },
    protagonist: {
      name: design.protagonist.name,
      archetype: fateProfile.protagonistArchetype,
      goal: design.protagonist.goal,
      flaw: design.protagonist.weakness || fateProfile.conflictBias,
      dnaTraits: design.protagonist.dnaTraits,
      belief: design.protagonist.belief,
    },
    antagonist: {
      name: '',
      archetype: '命运阻力',
      threat: design.storyBlueprint.mainConflict,
    },
    engine: {
      cycleFormula: fateProfile.openingPromise || design.storyBlueprint.premise,
      escalationRule: design.storyBlueprint.volumeArc,
      constraints: [
        ...fateProfile.themeTraits,
        ...design.storyBlueprint.backgroundCharter,
      ],
    },
    styleGuide: fateProfile.emotionalTone || '移动端高爽节奏，开篇快速兑现。',
    forbidden: [],
  };
}
