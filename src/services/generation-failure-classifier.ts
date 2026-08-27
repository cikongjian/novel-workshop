function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

export function isGenerationTimeoutFailure(error: unknown, signal?: AbortSignal): boolean {
  const reason = signal?.aborted ? errorMessage(signal.reason) : '';
  const message = `${errorMessage(error)}\n${reason}`;
  return /(?:空闲|总时长|请求|stream)?超时|timed?\s*out|timeout/iu.test(message);
}

export function shouldPersistGenerationFailure(params: {
  error: unknown;
  signal?: AbortSignal;
}): boolean {
  if (!params.signal?.aborted) return true;
  return isGenerationTimeoutFailure(params.error, params.signal);
}
