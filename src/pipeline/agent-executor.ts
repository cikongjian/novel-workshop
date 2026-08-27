import type { AgentRole, AgentContext, AgentOutput, NovelAgent } from '../agents/types.js';
import type { ModelClient, StreamCallback } from '../models/types.js';
import { RateLimitError } from '../models/openai.js';
import { getRetryPolicy, validateAgentOutput, buildValidationRetryDirective } from './output-validator.js';
import type { PerformanceTracker } from './performance-tracker.js';

export interface AgentExecutorOptions {
  novelId: string;
  chapterNumber: number;
  runId: string;
  onEvent?: (event: AgentExecutorEvent) => void;
  onHeartbeat?: (message: string) => void;
  signal?: AbortSignal;
  skipStrictGate?: boolean;
  perfTracker?: PerformanceTracker;
  model: ModelClient;
  allOutputs?: AgentOutput[];
}

export interface AgentExecutorEvent {
  type: 'agent:start' | 'agent:chunk' | 'agent:complete' | 'agent:error';
  agentRole: AgentRole;
  novelId: string;
  chapterNumber: number;
  data: string;
  timestamp: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    provider?: string;
    model?: string;
  };
}

const STREAM_HEARTBEAT_THROTTLE_MS = 5_000;
const MAX_RATE_LIMIT_RETRIES = 3;

export function createAgentExecutor(
  agents: Map<AgentRole, NovelAgent>,
  options: AgentExecutorOptions,
) {
  const {
    novelId,
    chapterNumber,
    runId,
    onEvent,
    onHeartbeat,
    signal,
    skipStrictGate = false,
    perfTracker,
    model,
    allOutputs = [],
  } = options;

  const emitHeartbeat = (stage: string): void => {
    try {
      onHeartbeat?.(stage);
    } catch {
      // 心跳回调失败不影响生成主流程
    }
  };

  const runAgent = async (role: AgentRole, ctx: AgentContext): Promise<AgentOutput> => {
    const agent = agents.get(role);
    if (!agent) {
      throw new Error(`Agent "${role}" 未注册`);
    }

    const endStep = perfTracker?.startStep(`agent:${role}`, 'agent', role);

    onEvent?.({
      type: 'agent:start',
      agentRole: role,
      novelId,
      chapterNumber,
      data: '',
      timestamp: new Date().toISOString(),
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        provider: model.provider,
        model: model.model,
      },
    });
    emitHeartbeat(`agent:${role}:start`);

    let lastStreamHeartbeatAt = 0;
    const emitStreamHeartbeat = (): void => {
      const now = Date.now();
      if (now - lastStreamHeartbeatAt < STREAM_HEARTBEAT_THROTTLE_MS) return;
      lastStreamHeartbeatAt = now;
      emitHeartbeat(`agent:${role}:streaming`);
    };

    const streamCallback: StreamCallback | undefined = (chunk: string) => {
      emitStreamHeartbeat();
      onEvent?.({
        type: 'agent:chunk',
        agentRole: role,
        novelId,
        chapterNumber,
        data: chunk,
        timestamp: new Date().toISOString(),
      });
    };

    const retryPolicy = skipStrictGate && (role === 'writer' || role === 'editor')
      ? { ...getRetryPolicy(role), maxRetries: 0 }
      : getRetryPolicy(role);
    let output: AgentOutput;
    let lastError: Error | undefined;
    let retryDirective = '';

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        emitHeartbeat(`agent:${role}:attempt:${attempt + 1}`);
        const retryCtx = attempt > 0
          ? {
              ...ctx,
              userDirection: [ctx.userDirection, retryDirective].filter(Boolean).join('\n\n'),
              temperatureOverride: (ctx.temperatureOverride ?? 0.7) + retryPolicy.temperatureIncrement * attempt,
            }
          : ctx;
        output = await agent.execute(retryCtx, model, streamCallback, signal);
        emitHeartbeat(`agent:${role}:response`);

        const validation = validateAgentOutput(output);
        if (validation.valid || attempt === retryPolicy.maxRetries) {
          if (!validation.valid && !(skipStrictGate && (role === 'writer' || role === 'editor'))) {
            onEvent?.({
              type: 'agent:error',
              agentRole: role,
              novelId,
              chapterNumber,
              data: `输出校验警告（已用尽重试）：${validation.issues.join('；')}`,
              timestamp: new Date().toISOString(),
            });
          }
          break;
        }

        onEvent?.({
          type: 'agent:error',
          agentRole: role,
          novelId,
          chapterNumber,
          data: `输出校验失败，第 ${attempt + 1} 次重试：${validation.issues.join('；')}`,
          timestamp: new Date().toISOString(),
        });
        retryDirective = buildValidationRetryDirective(role, validation.issues);
        continue;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof RateLimitError) {
          const baseDelayMs = Math.min(error.retryAfterMs, 30_000);
          let rlSuccess = false;
          for (let rlAttempt = 0; rlAttempt < MAX_RATE_LIMIT_RETRIES; rlAttempt++) {
            const delayMs = Math.min(baseDelayMs * Math.pow(2, rlAttempt), 120_000);
            onEvent?.({
              type: 'agent:error',
              agentRole: role,
              novelId,
              chapterNumber,
              data: `${role} 遇到 AI API 限速，${Math.round(delayMs / 1000)} 秒后自动重试（第 ${rlAttempt + 1}/${MAX_RATE_LIMIT_RETRIES} 次）…`,
              timestamp: new Date().toISOString(),
            });
            emitHeartbeat(`agent:${role}:rate-limit-wait`);
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, delayMs);
              if (signal) {
                const onAbort = () => { clearTimeout(timer); resolve(); };
                signal.addEventListener('abort', onAbort, { once: true });
              }
            });
            if (signal?.aborted) {
              onEvent?.({
                type: 'agent:error',
                agentRole: role,
                novelId,
                chapterNumber,
                data: '生成已被取消，停止限速重试。',
                timestamp: new Date().toISOString(),
              });
              throw new Error('生成已被取消');
            }
            try {
              emitHeartbeat(`agent:${role}:rate-limit-retry:${rlAttempt + 1}`);
              output = await agent.execute(ctx, model, streamCallback, signal);
              emitHeartbeat(`agent:${role}:response`);
              const validation = validateAgentOutput(output);
              if (validation.valid) {
                lastError = undefined;
                rlSuccess = true;
                break;
              }
              retryDirective = buildValidationRetryDirective(role, validation.issues);
              rlSuccess = true;
              break;
            } catch (rlErr) {
              if (rlErr instanceof RateLimitError && rlAttempt < MAX_RATE_LIMIT_RETRIES - 1) {
                error = rlErr;
                continue;
              }
              lastError = rlErr instanceof Error ? rlErr : new Error(String(rlErr));
              break;
            }
          }
          if (!lastError) continue;
          if (rlSuccess) continue;
        }

        if (attempt === retryPolicy.maxRetries) {
          onEvent?.({
            type: 'agent:error',
            agentRole: role,
            novelId,
            chapterNumber,
            data: lastError.message,
            timestamp: new Date().toISOString(),
          });
          throw lastError;
        }
      }
    }

    endStep?.({ agentRole: role });

    onEvent?.({
      type: 'agent:complete',
      agentRole: role,
      novelId,
      chapterNumber,
      data: output!.content,
      timestamp: new Date().toISOString(),
      usage: typeof output!.metadata?.inputTokens === 'number'
        ? {
            inputTokens: output!.metadata.inputTokens as number,
            outputTokens: output!.metadata.outputTokens as number,
            provider: output!.metadata.provider as string | undefined,
            model: output!.metadata.model as string | undefined,
          }
        : undefined,
    });
    emitHeartbeat(`agent:${role}:complete`);

    allOutputs.push(output!);
    return output!;
  };

  return { runAgent, allOutputs };
}
