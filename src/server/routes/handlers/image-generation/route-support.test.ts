import { describe, expect, it, vi } from 'vitest';
import { savePortraitFile, streamPortraitImage } from './route-support.js';

describe('portrait storage path safety', () => {
  it('rejects an escaping generated portrait filename before writing', async () => {
    const saveCharacter = vi.fn();

    await expect(savePortraitFile({
      bytes: Buffer.from('image'),
      char: {},
      charId: '../escape',
      ext: '.png',
      novelId: 'novel-1',
      novelManager: { saveCharacter } as never,
      prompt: 'portrait',
    })).rejects.toThrow(/path traversal/);
    expect(saveCharacter).not.toHaveBeenCalled();
  });

  it('maps an escaping stored portrait path to a client-safe error', async () => {
    const request = { query: {}, headers: {} } as never;
    const response = {} as never;

    await expect(streamPortraitImage({
      char: { portraitImagePath: '../secret.png' },
      novelId: 'novel-1',
      req: request,
      res: response,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: 'PORTRAIT_PATH_INVALID',
    });
  });
});
