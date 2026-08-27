import type { NovelAgent, AgentRole, AgentContext, AgentOutput } from './types.js';
import type { ModelClient, ChatMessage, ModelCallOptions, StreamCallback } from '../models/types.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAgentSkillService } from '../agent-skills/service.js';
import { AGENT_SKILL_DEFAULT_PROMPT_BUDGET } from '../agent-skills/types.js';
import { buildSystemPromptAppendix } from '../agent-skills/skill-utils.js';
import {
  compileStartupOpeningStrategy,
  shouldCompileStartupOpeningStrategy,
  type StartupOpeningStrategyDigest,
} from '../agent-skills/opening-strategy.js';
import { wrapSystemPromptWithOpeningStrategy } from '../pipeline/opening-strategy-wrapper.js';
import { runWithAiUsageContextAsync } from '../ai/usage-context.js';
import { createLogger } from '../utils/logger.js';
import { isModelStreamingEnabled } from '../config/index.js';
import { callModelWithGatewayStreamFallback } from '../models/gateway-stream-fallback.js';

const log = createLogger('agent-skills:injector');

/**
 * Agent 基类
 * 所有具体 Agent 继承此类，实现 buildUserMessage 方法
 */
export abstract class BaseAgent implements NovelAgent {
  abstract readonly role: AgentRole;
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * 从 prompts/ 目录加载角色提示词模板
   * Writer Agent 会根据题材选择专属 Prompt
   */
  protected async loadPromptTemplate(): Promise<string> {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const promptPath = path.join(dir, 'prompts', `${this.role}.txt`);
    return fs.readFile(promptPath, 'utf-8');
  }

  /**
   * 子类实现：根据上下文构建用户消息
   */
  protected abstract buildUserMessage(context: AgentContext): string;

  /**
   * 子类可覆盖：自定义模型调用参数
   */
  protected getModelOptions(_context?: AgentContext): ModelCallOptions {
    return { temperature: 0.7, maxTokens: 4096 };
  }

  /**
   * 执行 Agent 任务：加载提示词 -> 构建消息 -> 调用模型
   */
  async execute(
    context: AgentContext,
    model: ModelClient,
    onChunk?: StreamCallback,
    signal?: AbortSignal,
  ): Promise<AgentOutput> {
    const startedAt = Date.now();
    const systemPrompt = await this.loadPromptTemplate();
    let finalSystemPrompt = systemPrompt;
    let effectiveContext = context;
    let selectedSkillIds: string[] = [];
    let droppedByBudget = 0;
    let startupOpeningStrategy: StartupOpeningStrategyDigest | undefined;
    try {
      const resolved = await getAgentSkillService().resolveSkills({
        role: this.role,
        novelId: context.novelId,
        genre: context.genre,
        chapterNumber: context.chapterNumber,
      });

      if (shouldCompileStartupOpeningStrategy(this.role, context)) {
        const compiled = compileStartupOpeningStrategy({
          role: this.role,
          context,
          skills: resolved.matchedSkills,
        });
        const rebuilt = buildSystemPromptAppendix(compiled.remainingSkills, AGENT_SKILL_DEFAULT_PROMPT_BUDGET);
        selectedSkillIds = [...new Set([...compiled.consumedSkillIds, ...rebuilt.selected.map(item => item.id)])];
        droppedByBudget = rebuilt.droppedByBudget;
        if (compiled.enabled && compiled.brief) {
          const mergedOpeningBrief = context.startupOpeningStrategyBrief?.includes(compiled.brief)
            ? context.startupOpeningStrategyBrief
            : [
                context.startupOpeningStrategyBrief,
                compiled.brief,
              ].filter(Boolean).join('\n\n');
          effectiveContext = {
            ...context,
            startupOpeningStrategyBrief: mergedOpeningBrief,
          };
        }
        startupOpeningStrategy = {
          enabled: compiled.enabled,
          brief: compiled.brief,
          summary: compiled.summary,
          conflicts: compiled.conflicts,
          consumedSkillIds: compiled.consumedSkillIds,
        };
        if (rebuilt.appendix) {
          finalSystemPrompt = `${systemPrompt}\n\n${rebuilt.appendix}`;
        }
      } else {
        selectedSkillIds = resolved.selectedSkills.map(item => item.id);
        droppedByBudget = resolved.droppedByBudget;
        if (resolved.systemPromptAppendix) {
          finalSystemPrompt = `${systemPrompt}\n\n${resolved.systemPromptAppendix}`;
        }
      }
    } catch (err) {
      log.warn('技能注入失败，已回退为原始提示词', {
        role: this.role,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 包裹 Opening Strategy 到 System Prompt 顶部（强化执行力）
    if (startupOpeningStrategy && startupOpeningStrategy.enabled) {
      finalSystemPrompt = wrapSystemPromptWithOpeningStrategy(finalSystemPrompt, startupOpeningStrategy);
    }

    const userMessage = this.buildUserMessage(effectiveContext);

    const messages: ChatMessage[] = [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: userMessage },
    ];

    const opts = this.getModelOptions(effectiveContext);
    if (context.temperatureOverride != null) {
      opts.temperature = context.temperatureOverride;
    }
    if (signal) {
      opts.signal = signal;
    }

    let response;
    try {
      response = await runWithAiUsageContextAsync({
        agentRole: this.role,
        novelId: context.novelId,
        chapterNumber: effectiveContext.chapterNumber,
      }, async () => callModelWithGatewayStreamFallback({
        model,
        messages,
        options: opts,
        onChunk,
        streamingEnabled: isModelStreamingEnabled(),
        onFallback: error => {
          log.warn('模型网关超时，当前模型实例切换为流式重试', {
            role: this.role,
            provider: model.provider,
            model: model.model,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      }));
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      void getAgentSkillService().recordExecution({
        novelId: context.novelId,
        genre: effectiveContext.genre,
        role: this.role,
        chapterNumber: effectiveContext.chapterNumber,
        skillIds: selectedSkillIds,
        droppedByBudget,
        inputChars: userMessage.length,
        outputChars: 0,
        latencyMs,
        modelProvider: model.provider,
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    const latencyMs = Date.now() - startedAt;

    void getAgentSkillService().recordExecution({
      novelId: context.novelId,
      genre: effectiveContext.genre,
      role: this.role,
      chapterNumber: effectiveContext.chapterNumber,
      skillIds: selectedSkillIds,
      droppedByBudget,
      inputChars: userMessage.length,
      outputChars: response.content.length,
      latencyMs,
      modelProvider: model.provider,
      modelName: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.inputTokens + response.usage.outputTokens,
      success: true,
    });

    return {
      agentRole: this.role,
      content: response.content,
      metadata: {
        skillIds: selectedSkillIds,
        droppedByBudget,
        startupOpeningStrategy,
        latencyMs,
        inputChars: userMessage.length,
        systemPromptChars: finalSystemPrompt.length,
        outputChars: response.content.length,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        model: response.model,
        provider: model.provider,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
