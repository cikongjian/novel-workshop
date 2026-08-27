export type DialogueBracketTransformMode = 'clean' | 'rewrite' | 'ai-rewrite';

export type Candidate = {
  id: string;
  start: number;
  end: number;
  replacement: string;
  tagText: string;
  patternType: 'prefix' | 'suffix';
  recommended: boolean;
  lineNumber: number;
  columnNumber: number;
  paragraphNumber: number;
};

export type DialogueBracketCleanupResult = {
  content: string;
  replacements: number;
  examples: Array<{
    id: string;
    before: string;
    after: string;
    tagText: string;
    recommended: boolean;
    patternType: 'prefix' | 'suffix';
    lineNumber: number;
    columnNumber: number;
    paragraphNumber: number;
  }>;
  beforeSample: string;
  afterSample: string;
};
