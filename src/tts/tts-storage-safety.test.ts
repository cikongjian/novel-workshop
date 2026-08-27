import { describe, expect, it } from 'vitest';
import { clearAllChapterCacheFiles } from './tts-service.js';

describe('TTS storage path safety', () => {
  it('rejects an escaping novel id', async () => {
    await expect(clearAllChapterCacheFiles('../escape')).rejects.toThrow(/path traversal/);
  });
});
