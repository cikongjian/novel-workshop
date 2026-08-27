export interface KeyChapterInfo {
  chapterNumber: number;
  score: number;
  keyType: string;
  signals: string[];
  hasExistingNotes: boolean;
}

export type AuthorNoteBatchTarget = {
  chapterNumber: number;
  keyType: string;
};
