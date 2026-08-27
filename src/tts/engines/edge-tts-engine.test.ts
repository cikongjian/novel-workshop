import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClose, mockRecordAiUsage, mockSetMetadata, mockToStream } = vi.hoisted(() => ({
  mockClose: vi.fn(),
  mockRecordAiUsage: vi.fn(),
  mockSetMetadata: vi.fn(),
  mockToStream: vi.fn(),
}));

vi.mock('msedge-tts', () => {
  class MsEdgeTTS {
    setMetadata = mockSetMetadata;
    toStream = mockToStream;
    close = mockClose;
  }

  return {
    MsEdgeTTS,
    OUTPUT_FORMAT: {
      AUDIO_24KHZ_96KBITRATE_MONO_MP3: 'audio-24khz-96kbitrate-mono-mp3',
    },
  };
});

vi.mock('../../ai/usage-recorder.js', () => ({
  recordAiUsage: mockRecordAiUsage,
}));

import { EdgeTTSEngine } from './edge-tts-engine.js';

describe('EdgeTTSEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetMetadata.mockResolvedValue(undefined);
    mockToStream.mockReturnValue({
      audioStream: Readable.from([Buffer.alloc(120)]),
    });
  });

  it('escapes user text before synthesis and closes the client', async () => {
    const result = await new EdgeTTSEngine().synthesize({
      text: '<tag>&',
      voice: 'zh-CN-YunyangNeural',
      rate: '+10%',
    });

    expect(mockSetMetadata).toHaveBeenCalledWith(
      'zh-CN-YunyangNeural',
      'audio-24khz-96kbitrate-mono-mp3',
    );
    expect(mockToStream).toHaveBeenCalledWith('&lt;tag&gt;&amp;', { rate: '+10%' });
    expect(mockClose).toHaveBeenCalledOnce();
    expect(mockRecordAiUsage).toHaveBeenCalledOnce();
    expect(result.buffer).toHaveLength(120);
  });

  it('rejects an invalid speech rate before opening a remote connection', async () => {
    await expect(new EdgeTTSEngine().synthesize({
      text: 'safe text',
      voice: 'zh-CN-YunyangNeural',
      rate: '"/><break time="10s"/>',
    })).rejects.toThrow('Edge TTS');

    expect(mockSetMetadata).not.toHaveBeenCalled();
  });
});
