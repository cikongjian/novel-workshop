import { describe, expect, it } from 'vitest';
import { mergeChapterDiagnostics } from './chapter-generation-diagnostics.js';

describe('chapter generation memory diagnostics', () => {
  it('merges memory context audit without dropping existing diagnostics', () => {
    const updatedAt = new Date().toISOString();
    const existing = mergeChapterDiagnostics(undefined, {
      agentTrace: [],
    }, updatedAt);

    const merged = mergeChapterDiagnostics(existing, {
      memoryContextAudit: {
        mode: 'observe',
        retriever: 'legacy',
        totalChars: 42,
        promptChars: 30,
        unusedPersistedSources: ['truthFiles'],
        emptyPromptSources: ['factVector'],
        warnings: ['truth files exist but are not used in prompt'],
        sources: [
          {
            source: 'truthFiles',
            chars: 0,
            present: true,
            usedInPrompt: false,
            note: 'persisted but not injected in Phase 0',
          },
        ],
      },
    }, updatedAt);

    expect(merged?.agentTrace).toEqual([]);
    expect(merged?.memoryContextAudit).toEqual(expect.objectContaining({
      mode: 'observe',
      retriever: 'legacy',
      unusedPersistedSources: ['truthFiles'],
    }));
  });
});
