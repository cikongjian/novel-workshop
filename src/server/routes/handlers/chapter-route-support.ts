import { getTemplate } from '../../../novel/templates/index.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';

const STRICT_GATE_FAILURE_RE = /未通过（strict）|未通过\(strict\)/;
const HARD_BLOCK_FAILURE_RE = /命中硬阻断规则/;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] ?? '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return fallback;
}

/**
 * 单章后台任务空闲超时（毫秒）。只在长时间没有 pipeline 心跳时判定卡死。
 */
export const CHAPTER_ROUTE_IDLE_TIMEOUT_MS = readPositiveIntEnv(
  'CHAPTER_ROUTE_IDLE_TIMEOUT_MS',
  8 * 60 * 1000,
);

/**
 * 单章后台任务绝对总时长兜底上限（毫秒）。兼容旧的 CHAPTER_ROUTE_TIMEOUT_MS 配置名。
 */
export const CHAPTER_ROUTE_MAX_TOTAL_TIMEOUT_MS = readPositiveIntEnv(
  'CHAPTER_ROUTE_MAX_TOTAL_TIMEOUT_MS',
  readPositiveIntEnv('CHAPTER_ROUTE_TIMEOUT_MS', 60 * 60 * 1000),
);

/** @deprecated Use CHAPTER_ROUTE_MAX_TOTAL_TIMEOUT_MS. */
export const CHAPTER_ROUTE_TIMEOUT_MS = CHAPTER_ROUTE_MAX_TOTAL_TIMEOUT_MS;

function isStrictGateFailure(error: unknown): error is Error {
  return error instanceof Error && STRICT_GATE_FAILURE_RE.test(error.message);
}

function isHardBlockFailure(error: unknown): error is Error {
  return error instanceof Error && HARD_BLOCK_FAILURE_RE.test(error.message);
}

function isAbortLikeFailure(error: unknown): error is Error {
  return error instanceof Error
    && (error.name === 'AbortError' || /超时|timeout|aborted/i.test(error.message));
}

export function classifyGenerationFailure(error: unknown): {
  status: number;
  code: string;
  retryable: boolean;
  message: string;
} {
  const message = safeErrorMessage(error, '生成章节失败');
  if (isHardBlockFailure(error)) {
    return {
      status: 422,
      code: 'CHAPTER_HARD_BLOCK',
      retryable: false,
      message: `本次生成被宪章门禁拦截：${message}`,
    };
  }
  if (isStrictGateFailure(error)) {
    return {
      status: 422,
      code: 'CHAPTER_STRICT_GATE_BLOCK',
      retryable: true,
      message,
    };
  }
  if (isAbortLikeFailure(error)) {
    return {
      status: 504,
      code: 'CHAPTER_GENERATION_TIMEOUT',
      retryable: true,
      message: `章节生成超时，已自动中断当前任务并释放锁：${message}`,
    };
  }
  return {
    status: 500,
    code: 'CHAPTER_GENERATION_FAILED',
    retryable: true,
    message,
  };
}

export function buildGenreTraceOverrides(genre?: string) {
  const tmpl = genre ? getTemplate(genre) : null;
  if (!tmpl?.writingRules) {
    return undefined;
  }
  return {
    prohibitions: tmpl.writingRules.prohibitions,
    fatigueWords: tmpl.writingRules.fatigueWords,
  };
}
