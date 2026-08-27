import { describe, expect, it, vi } from 'vitest';
import type { ModelClient } from './types.js';
import {
  callModelWithGatewayStreamFallback,
  isTransientGatewayError,
} from './gateway-stream-fallback.js';

function client() {
  const chat = vi.fn();
  const chatStream = vi.fn();
  return {
    model: { provider: 'custom-openai', model: 'gateway-model', chat, chatStream } as ModelClient,
    chat,
    chatStream,
  };
}

const response = {
  content: 'ok',
  model: 'gateway-model',
  usage: { inputTokens: 10, outputTokens: 2 },
};

describe('gateway stream fallback', () => {
  it('recognizes structured and HTML gateway timeout errors', () => {
    expect(isTransientGatewayError({ status: 503 })).toBe(true);
    expect(isTransientGatewayError(new Error('504 <html>Gateway Time-out</html>'))).toBe(true);
    expect(isTransientGatewayError(new Error('401 Unauthorized'))).toBe(false);
  });

  it('falls back to streaming after a gateway timeout and remembers the client', async () => {
    const mock = client();
    mock.chat.mockRejectedValueOnce(new Error('504 Gateway Time-out'));
    mock.chatStream.mockResolvedValue(response);
    const onFallback = vi.fn();
    const onChunk = vi.fn();
    const common = {
      model: mock.model,
      messages: [{ role: 'user' as const, content: 'long prompt' }],
      onChunk,
      streamingEnabled: false,
      onFallback,
    };

    await expect(callModelWithGatewayStreamFallback(common)).resolves.toEqual(response);
    expect(mock.chat).toHaveBeenCalledOnce();
    expect(mock.chatStream).toHaveBeenCalledOnce();
    expect(onFallback).toHaveBeenCalledOnce();

    await expect(callModelWithGatewayStreamFallback(common)).resolves.toEqual(response);
    expect(mock.chat).toHaveBeenCalledOnce();
    expect(mock.chatStream).toHaveBeenCalledTimes(2);
  });

  it('does not change transport for authentication failures', async () => {
    const mock = client();
    mock.chat.mockRejectedValueOnce(new Error('401 Unauthorized'));

    await expect(callModelWithGatewayStreamFallback({
      model: mock.model,
      messages: [{ role: 'user', content: 'prompt' }],
      onChunk: vi.fn(),
      streamingEnabled: false,
    })).rejects.toThrow('401 Unauthorized');
    expect(mock.chatStream).not.toHaveBeenCalled();
  });
});
