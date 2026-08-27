import { describe, expect, it } from 'vitest';
import { resolveHttpAiUsageOperation } from './usage-operation-registry.js';

describe('resolveHttpAiUsageOperation', () => {
  it('matches corrected generate endpoints', () => {
    expect(resolveHttpAiUsageOperation('POST', '/api/generate/resize-chapter')?.key).toBe('generate.resize');
    expect(resolveHttpAiUsageOperation('POST', '/api/generate/batch-author-notes/start')?.key).toBe('generate.author-note-batch');
    expect(resolveHttpAiUsageOperation('POST', '/api/generate/batch-digest')?.key).toBe('generate.digest');
    expect(resolveHttpAiUsageOperation('POST', '/api/generate/batch-arc-summary')).toBeUndefined();
    expect(resolveHttpAiUsageOperation('POST', '/api/generate/rewrite-chapter-preview')?.key).toBe('generate.rewrite-preview');
    expect(resolveHttpAiUsageOperation('POST', '/api/generate/rewrite-chapter')?.key).toBe('generate.rewrite');
    expect(resolveHttpAiUsageOperation('POST', '/api/generate/rewrite-batch')?.key).toBe('generate.rewrite-batch');
    expect(resolveHttpAiUsageOperation('POST', '/api/generate/dialogue-check')).toBeUndefined();
    expect(resolveHttpAiUsageOperation('POST', '/api/generate/parallel-compare')).toBeUndefined();
  });

  it('matches chapter and character AI maintenance endpoints', () => {
    expect(resolveHttpAiUsageOperation('POST', '/api/novels/n1/characters/backfill-tts')?.key).toBe('character.backfill-tts');
    expect(resolveHttpAiUsageOperation('POST', '/api/novels/n1/characters/backfill-position')?.key).toBe('character.backfill-position');
    expect(resolveHttpAiUsageOperation('POST', '/api/novels/n1/characters/detect-duplicates')?.key).toBe('character.detect-duplicates');
    expect(resolveHttpAiUsageOperation('POST', '/api/novels/n1/chapters/finalize/12')?.key).toBe('chapter.finalize');
    expect(resolveHttpAiUsageOperation('POST', '/api/novels/n1/chapters/12/generate-title')?.key).toBe('chapter.generate-title');
    expect(resolveHttpAiUsageOperation('POST', '/api/novels/n1/chapters/backfill-titles')?.key).toBe('chapter.backfill-titles');
    expect(resolveHttpAiUsageOperation('POST', '/api/novels/n1/chapters/clean-dialogue-bracket-preview')?.key).toBe('chapter.clean-dialogue-bracket-preview');
    expect(resolveHttpAiUsageOperation('POST', '/api/novels/n1/chapters/apply-clean-dialogue-bracket')?.key).toBe('chapter.clean-dialogue-bracket-apply');
  });

  it('matches background-triggering AI endpoints', () => {
    expect(resolveHttpAiUsageOperation('POST', '/api/agent-skills/ab-test')?.key).toBe('agent-skills.ab-test');
    expect(resolveHttpAiUsageOperation('POST', '/api/auth/user-api/test-draft')?.key).toBe('auth.user-api.test-draft');
    expect(resolveHttpAiUsageOperation('POST', '/api/admin/zhihu-assistant/chat')?.key).toBe('admin.zhihu-assistant.chat');
    expect(resolveHttpAiUsageOperation('POST', '/api/anchors/generate/n1')?.key).toBe('anchors.generate');
    expect(resolveHttpAiUsageOperation('POST', '/api/fun/cangjie/chat')?.key).toBe('fun.cangjie.chat');
    expect(resolveHttpAiUsageOperation('POST', '/api/fun/cangjie/organize')?.key).toBe('fun.cangjie.organize');
    expect(resolveHttpAiUsageOperation('POST', '/api/fun/cangjie/seed-idea')?.key).toBe('fun.cangjie.seed-idea');
    expect(resolveHttpAiUsageOperation('POST', '/api/series/story-state/n1/backfill')?.key).toBe('series.story-state-backfill');
    expect(resolveHttpAiUsageOperation('POST', '/api/settings/reindex-memory')?.key).toBe('settings.memory-reindex');
    expect(resolveHttpAiUsageOperation('POST', '/api/novels/n1/memory/reindex')?.key).toBe('memory.reindex');
  });
});
