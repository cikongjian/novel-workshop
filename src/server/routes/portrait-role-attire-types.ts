export type RoleAttireEntry = {
  id: string;
  label: string;
  category: string;
  keywords: string[];
  identityPrompt: string;
  attirePrompt: string;
};

export type RoleEraScope = 'ancient-cn' | 'xianxia' | 'modern' | 'sci-fi' | 'western-medieval' | 'western-antiquity' | 'ancient-myth' | 'japanese-feudal' | 'post-apocalyptic' | 'generic';

export type RoleConflictGroup =
  | 'royal'
  | 'civil'
  | 'military'
  | 'court'
  | 'civilian'
  | 'mystic'
  | 'modern-profession'
  | 'generic';

export type RoleAttireCandidate = {
  id: string;
  label: string;
  category: string;
  score: number;
  priority: number;
  eraMatched: boolean;
  matchedKeywords: string[];
};

export type RoleAttireMatch = {
  entry: RoleAttireEntry;
  matched: boolean;
  matchedKeywords: string[];
  score: number;
  priority: number;
  preferredEras: RoleEraScope[];
  resolutionReason: string;
  candidates: RoleAttireCandidate[];
};
