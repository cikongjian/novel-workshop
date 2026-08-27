import { randomUUID } from 'node:crypto';
import type { ModelClient, ChatMessage } from '../models/types.js';
import type { TrendsRawResult, TrendsAnalysis } from './trends-types.js';
import {
  MAX_RAW_RESULTS_FOR_ANALYSIS,
  ANALYSIS_PARSE_MAX_RETRIES,
  ANALYSIS_PARSE_RETRY_DELAY_MS,
  ANALYSIS_RETRY_TEMPERATURE_STEP,
} from './trends-constants.js';
import { TRENDS_SYSTEM_PROMPT } from './trends-analyzer-prompt.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('trends-analyzer');

/** AI 分析温度（偏低以提高分析准确性） */
const ANALYSIS_TEMPERATURE = 0.4;
/** AI 最大输出 token */
const ANALYSIS_MAX_TOKENS = 8192;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 趋势分析器
 * 将原始搜索结果送入 AI 模型，获取结构化分析。
 */
export class TrendsAnalyzer {
  async analyze(
    rawResults: TrendsRawResult[],
    modelClient: ModelClient,
  ): Promise<TrendsAnalysis> {
    const truncated = rawResults.slice(0, MAX_RAW_RESULTS_FOR_ANALYSIS);

    if (truncated.length === 0) {
      log.warn('无原始数据可供分析，将生成基于模型知识的分析');
    }

    const userMessage = this.buildUserMessage(truncated);
    const messages: ChatMessage[] = [
      { role: 'system', content: TRENDS_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ];

    const maxAttempts = ANALYSIS_PARSE_MAX_RETRIES + 1;
    let lastResult: TrendsAnalysis | null = null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const temperature = ANALYSIS_TEMPERATURE + attempt * ANALYSIS_RETRY_TEMPERATURE_STEP;
      const attemptLabel = attempt === 0 ? '首次' : `第 ${attempt + 1} 次重试`;

      log.info(`开始 AI 分析（${attemptLabel}），输入 ${truncated.length} 条原始结果，温度 ${temperature.toFixed(1)}`);

      const response = await modelClient.chat(messages, {
        temperature,
        maxTokens: ANALYSIS_MAX_TOKENS,
        jsonMode: true,
      });

      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;

      const parsed = this.parseAnalysisResponse(response.content, truncated.length, response.model);

      if (!parsed.parseFailed) {
        if (attempt > 0) {
          log.info(`AI 分析在第 ${attempt + 1} 次尝试后解析成功`);
        }
        return {
          id: randomUUID(),
          analyzedAt: new Date().toISOString(),
          ...parsed,
          rawResultCount: truncated.length,
          modelUsed: response.model,
          analysisTokens: {
            input: totalInputTokens,
            output: totalOutputTokens,
          },
        };
      }

      lastResult = {
        id: randomUUID(),
        analyzedAt: new Date().toISOString(),
        ...parsed,
        rawResultCount: truncated.length,
        modelUsed: response.model,
        analysisTokens: {
          input: response.usage.inputTokens,
          output: response.usage.outputTokens,
        },
      };

      if (attempt < maxAttempts - 1) {
        log.warn(`AI 分析解析失败（${attemptLabel}），${ANALYSIS_PARSE_RETRY_DELAY_MS / 1000} 秒后重试`);
        await sleep(ANALYSIS_PARSE_RETRY_DELAY_MS);
      }
    }

    log.error(`AI 分析全部 ${maxAttempts} 次尝试均解析失败，返回最后一次结果`);
    return {
      ...lastResult!,
      analysisTokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
      },
    };
  }

  /** 将原始结果组装为用户消息 */
  private buildUserMessage(results: TrendsRawResult[]): string {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let message = `当前日期：${dateStr}\n\n`;

    if (results.length === 0) {
      message += '暂无搜索数据。请基于你对中国网络文学市场的了解，分析起点中文网、番茄小说、晋江文学城、七猫小说这四个平台当前的热门趋势并给出写作建议。\n\n';
      message += '【重要】请严格按照 system prompt 中的 JSON 格式输出，不要有任何额外文字。你的回复的第一个字符必须是 {，最后一个字符必须是 }。';
      return message;
    }

    // 按来源/查询分组
    const grouped = new Map<string, TrendsRawResult[]>();
    for (const r of results) {
      const key = r.query;
      const list = grouped.get(key) ?? [];
      list.push(r);
      grouped.set(key, list);
    }

    message += `以下是从多个来源获取的 ${results.length} 条搜索结果，请据此分析网文市场趋势：\n\n`;

    for (const [query, items] of grouped) {
      message += `### 查询: ${query}\n`;
      for (const item of items) {
        message += `- [${item.rank ?? '-'}] ${item.title}\n`;
        if (item.snippet) {
          message += `  摘要: ${item.snippet.slice(0, 300)}\n`;
        }
      }
      message += '\n';
    }

    message += '\n【重要】请严格按照 system prompt 中的 JSON 格式输出，不要有任何额外文字。你的回复的第一个字符必须是 {，最后一个字符必须是 }。';
    return message;
  }

  /** 尝试修复常见 JSON 问题（中文引号、尾逗号等） */
  private sanitizeJson(text: string): string {
    return text
      // 中文引号 → 英文引号
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // 去除尾逗号（} 或 ] 前的逗号）
      .replace(/,\s*([}\]])/g, '$1');
  }

  /** 尝试解析 JSON 字符串 */
  private tryParse(text: string): Record<string, unknown> | null {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      // 尝试修复后再解析
      try {
        return JSON.parse(this.sanitizeJson(text)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }

  /** 解析 AI 响应为结构化数据 */
  private parseAnalysisResponse(
    content: string,
    rawResultCount: number,
    modelUsed: string,
  ): Pick<TrendsAnalysis, 'platforms' | 'overallTrends' | 'recommendations' | 'rawResponseOnFailure' | 'parseFailed'> {
    const trimmed = content.trim();

    // 策略 1: 直接解析
    const direct = this.tryParse(trimmed);
    if (direct) return this.validateAndReturn(direct);

    // 策略 2: 提取 markdown 代码块
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      const parsed = this.tryParse(codeBlockMatch[1].trim());
      if (parsed) return this.validateAndReturn(parsed);
    }

    // 策略 3: 提取最外层花括号
    const braceStart = trimmed.indexOf('{');
    const braceEnd = trimmed.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      const extracted = trimmed.slice(braceStart, braceEnd + 1);
      const parsed = this.tryParse(extracted);
      if (parsed) return this.validateAndReturn(parsed);
    }

    // 策略 4: 模型有时会在 JSON 前后包裹解释文字，尝试提取第一个 { 到最后一个 }
    const nestedMatch = trimmed.match(/\{[\s\S]*\}/);
    if (nestedMatch) {
      // 尝试从外层向内层收缩，找到第一个可解析的 JSON 对象
      let candidate = nestedMatch[0];
      while (candidate.length > 2) {
        const parsed = this.tryParse(candidate);
        if (parsed) return this.validateAndReturn(parsed);
        // 去掉最外层的一对花括号再试
        candidate = candidate.slice(1, -1).trim();
        const nextBrace = candidate.indexOf('{');
        const lastBrace = candidate.lastIndexOf('}');
        if (nextBrace === -1 || lastBrace === -1 || nextBrace >= lastBrace) break;
        candidate = candidate.slice(nextBrace, lastBrace + 1);
      }
    }

    // 所有策略均失败，记录完整内容便于调试
    const failurePreview = trimmed.slice(0, 2000);
    log.error('无法解析 AI 分析结果', {
      contentPreview: failurePreview,
      contentLength: trimmed.length,
      rawResultCount,
      modelUsed,
    });
    return {
      platforms: [],
      overallTrends: {
        hotGenres: [],
        emergingThemes: [],
        decliningThemes: [],
        crossPlatformTrends: [],
        marketInsight: '分析结果解析失败，请重试。如频繁失败，请在配置中切换搜索 API 或更换 AI 模型。',
      },
      recommendations: [],
      rawResponseOnFailure: failurePreview,
      parseFailed: true,
    };
  }

  /** 校验必要字段并返回 */
  private validateAndReturn(data: Record<string, unknown>): Pick<
    TrendsAnalysis,
    'platforms' | 'overallTrends' | 'recommendations' | 'rawResponseOnFailure' | 'parseFailed'
  > {
    const platforms = Array.isArray(data.platforms) ? data.platforms : [];
    const overallTrends = (data.overallTrends as Record<string, unknown>) ?? {};
    const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];

    return {
      platforms,
      overallTrends: {
        hotGenres: Array.isArray(overallTrends.hotGenres) ? overallTrends.hotGenres : [],
        emergingThemes: Array.isArray(overallTrends.emergingThemes) ? overallTrends.emergingThemes : [],
        decliningThemes: Array.isArray(overallTrends.decliningThemes) ? overallTrends.decliningThemes : [],
        crossPlatformTrends: Array.isArray(overallTrends.crossPlatformTrends) ? overallTrends.crossPlatformTrends : [],
        marketInsight: typeof overallTrends.marketInsight === 'string' ? overallTrends.marketInsight : '',
      },
      recommendations,
      parseFailed: false,
    };
  }
}
