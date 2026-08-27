export type CoverPromptFailureCategory =
  | 'authentication'
  | 'gateway'
  | 'invalid-response'
  | 'rate-limit'
  | 'timeout'
  | 'unknown';

export type CoverPromptErrorDiagnostic = {
  category: CoverPromptFailureCategory;
  name: string;
  message: string;
  code?: string;
  status?: number;
  type?: string;
};

export type CoverPromptDiagnostics = {
  modelAccess: {
    source: string;
    clientAvailable: boolean;
    provider?: string;
    model?: string;
    profileId?: string;
    storageMode?: string;
  };
  aiAttempt: {
    outcome: 'ai' | 'template-fallback' | 'template-no-client';
    elapsedMs: number;
    error?: CoverPromptErrorDiagnostic;
  };
};

function stringProperty(error: unknown, key: string): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberProperty(error: unknown, key: string): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function redactDiagnosticMessage(message: string): string {
  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9._-]{8,}/giu, 'sk-[redacted]')
    .replace(/((?:api[_ -]?key|token|authorization)\s*[:=]\s*)[^\s,;]+/giu, '$1[redacted]')
    .slice(0, 500);
}

function classifyFailure(message: string, status?: number): CoverPromptFailureCategory {
  const normalized = message.toLowerCase();
  if (status === 429 || /rate.?limit|too many requests|quota|capacity/iu.test(normalized)) return 'rate-limit';
  if (status === 401 || status === 403 || /invalid.?api.?key|unauthori[sz]ed|forbidden/iu.test(normalized)) {
    return 'authentication';
  }
  if (/timed?\s*out|timeout|超时/iu.test(normalized)) return 'timeout';
  if ([502, 503, 504, 520, 522, 524].includes(status ?? 0)
    || /gateway|upstream|econnreset|connection reset|socket hang up/iu.test(normalized)) {
    return 'gateway';
  }
  if (/json|format|格式|empty|为空|unexpected token/iu.test(normalized)) return 'invalid-response';
  return 'unknown';
}

export function buildCoverPromptErrorDiagnostic(error: unknown): CoverPromptErrorDiagnostic {
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const status = numberProperty(error, 'status') ?? numberProperty(error, 'statusCode');
  return {
    category: classifyFailure(rawMessage, status),
    name: error instanceof Error ? error.name : 'Error',
    message: redactDiagnosticMessage(rawMessage),
    code: stringProperty(error, 'code'),
    status,
    type: stringProperty(error, 'type'),
  };
}
