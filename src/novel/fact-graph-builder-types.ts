import type {
  CharacterAppearance,
  CharacterStateChange,
  FactEvent,
  ItemStatusEntry,
  LocationVisit,
  TimelineEvent,
} from './fact-graph-types.js';

export type ChapterFactExtractionInput = {
  chapterContent: string;
  chapterNumber: number;
  characterNames: string[];
};

export type ExtractedFacts = {
  characterAppearances: CharacterAppearance[];
  itemTimeline: ItemStatusEntry[];
  locationVisits: LocationVisit[];
  timelineEvents: TimelineEvent[];
  characterStateChanges: CharacterStateChange[];
  factEvents: FactEvent[];
};
