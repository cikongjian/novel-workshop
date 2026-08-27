import type { TrendsRawResult } from './trends-types.js';

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxResults: number): Promise<TrendsRawResult[]>;
}
