import { parseJsonPayload } from '../../../utils/json-payload.js';
import type { GenerateDeps } from './types.js';

/** 从 AI 输出中安全解析 JSON，容忍 markdown 代码块和尾逗号 */
export function safeParseAgentJson(raw: string): unknown {
  try { return parseJsonPayload(raw); } catch { return { raw }; }
}

export function sendAdvancedDeprecated(
  res: import('express').Response,
  code: string,
): void {
  res.status(410).json({
    error: 'This generate endpoint has been deprecated.',
    code,
  });
}

export type AdvancedRouteDeps = GenerateDeps;
