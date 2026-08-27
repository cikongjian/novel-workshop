import type {
  ChatMessage,
  ModelCallOptions,
  ModelClient,
  ModelResponse,
  StreamCallback,
} from './types.js';

const streamPreferredClients = new WeakSet<ModelClient>();
const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);

export function isTransientGatewayError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && TRANSIENT_GATEWAY_STATUSES.has(status)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b(?:502|503|504)\b[\s\S]{0,240}(?:gateway|service unavailable)/iu.test(message);
}

export async function callModelWithGatewayStreamFallback(params: {
  model: ModelClient;
  messages: ChatMessage[];
  options?: ModelCallOptions;
  onChunk?: StreamCallback;
  streamingEnabled: boolean;
  onFallback?: (error: unknown) => void;
}): Promise<ModelResponse> {
  const canStream = Boolean(params.onChunk);
  const useStream = canStream
    && (params.streamingEnabled || streamPreferredClients.has(params.model));
  if (useStream) {
    return params.model.chatStream(params.messages, params.options, params.onChunk);
  }

  try {
    return await params.model.chat(params.messages, params.options);
  } catch (error) {
    if (!canStream || !isTransientGatewayError(error)) throw error;
    streamPreferredClients.add(params.model);
    params.onFallback?.(error);
    return params.model.chatStream(params.messages, params.options, params.onChunk);
  }
}
