import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import type { ChatMessage } from '../../../models/types.js';
import { ChatBody, ExpandIdeaBody } from './types.js';
import { createLogger } from '../../../utils/logger.js';
import {
  buildCreativeChatSystemPrompt,
  buildExpandIdeaMessages,
  buildExpandIdeaSystemPrompt,
  CHAT_ROUTE_TIMEOUT_MS,
  isChatTimeoutLikeError,
  resolveCreativeChatContext,
  resolveExpandIdeaContext,
  summarizeChatMessage,
} from './chat-support.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { beginAIBilling, settleAIBilling } from './billing-guard.js';

const log = createLogger('chat-handler');

export function registerChatRoutes(router: Router, deps: GenerateDeps): void {
    const { modelClient } = deps;

    // 聊天模式（灵感捕捉）
    router.post('/chat', async (req, res) => {
        const startedAt = Date.now();
        const requestMeta = {
            userId: req.auth?.id ?? '',
            novelId: typeof req.body?.novelId === 'string' ? req.body.novelId : '',
            ip: req.ip,
        };

        req.setTimeout(CHAT_ROUTE_TIMEOUT_MS, () => {
            log.warn('creative chat request timeout reached', {
                ...requestMeta,
                timeoutMs: CHAT_ROUTE_TIMEOUT_MS,
                durationMs: Date.now() - startedAt,
            });
        });
        res.setTimeout(CHAT_ROUTE_TIMEOUT_MS, () => {
            log.warn('creative chat response timeout reached', {
                ...requestMeta,
                timeoutMs: CHAT_ROUTE_TIMEOUT_MS,
                durationMs: Date.now() - startedAt,
            });
        });
        try {
            const parsed = ChatBody.safeParse(req.body);
            if (!parsed.success) {
                log.warn('creative chat validation failed', {
                    ...requestMeta,
                    issues: parsed.error.issues.map(issue => issue.message).slice(0, 3),
                });
                res.status(400).json({ error: parsed.error.issues[0].message });
                return;
            }
            const { novelId, message, maxTokens, temperature } = parsed.data;
            const normalizedRequestMeta = {
                ...requestMeta,
                novelId: novelId ?? '',
                messageChars: message.length,
                messagePreview: summarizeChatMessage(message),
                maxTokens: maxTokens ?? null,
                temperature: temperature ?? null,
            };
            log.info('creative chat request started', normalizedRequestMeta);
            const messages: ChatMessage[] = [];
            let systemPrompt = buildCreativeChatSystemPrompt({});
            let activeModelClient = modelClient;
            if (novelId) {
                try {
                    const context = await resolveCreativeChatContext({
                        deps,
                        novelId,
                        userId: req.auth?.id,
                        headers: req.headers,
                    });
                    if (context.blockedError) {
                        log.warn('creative chat blocked by unavailable user model', {
                            ...normalizedRequestMeta,
                            error: context.blockedError,
                        });
                        res.status(400).json({ error: context.blockedError, code: 'USER_API_UNAVAILABLE' });
                        return;
                    }
                    systemPrompt = context.systemPrompt;
                    activeModelClient = context.activeModelClient;
                }
                catch (contextError) {
                    log.warn('creative chat context load failed, continuing without full context', {
                        ...normalizedRequestMeta,
                        error: contextError instanceof Error ? contextError.message : String(contextError),
                    });
                    // 加载上下文失败不影响聊天
                }
            } else {
                const context = await resolveCreativeChatContext({
                    deps,
                    headers: req.headers,
                    userId: req.auth?.id,
                });
                systemPrompt = context.systemPrompt;
                activeModelClient = context.activeModelClient;
            }
            if (!activeModelClient) {
                res.status(503).json({ error: 'AI 模型未配置，请先在设置页面配置模型 API Key，或在"我的 → 自有模型"中添加个人 API' });
                return;
            }
            messages.push({ role: 'system', content: systemPrompt });
            messages.push({ role: 'user', content: message });
            const response = await activeModelClient.chat(messages, {
                ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
                ...(typeof temperature === 'number' ? { temperature } : {}),
            });
            res.json({
                reply: response.content,
                model: response.model,
                usage: response.usage,
            });
            log.info('creative chat request completed', {
                ...normalizedRequestMeta,
                durationMs: Date.now() - startedAt,
                model: response.model,
                replyChars: response.content.length,
                outputTokens: response.usage?.outputTokens ?? null,
                inputTokens: response.usage?.inputTokens ?? null,
            });
        }
        catch (err) {
            const rawMessage = err instanceof Error ? err.message : String(err);
            const message = safeErrorMessage(err, '聊天失败');
            log.error('creative chat request failed', {
                ...requestMeta,
                durationMs: Date.now() - startedAt,
                error: message,
                rawError: rawMessage !== message ? rawMessage : undefined,
                timeoutLike: isChatTimeoutLikeError(err),
            });
            res.status(500).json({ error: message, detail: rawMessage !== message ? rawMessage : undefined });
        }
    });

    // 灵感扩写（魔法棒）
    router.post('/expand-idea', async (req, res) => {
        const billingUserId = req.auth?.id;
        let bypassBilling = false;
        let freezeId: string | undefined;
        let frozenPoints = 0;
        try {
            const parsed = ExpandIdeaBody.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: parsed.error.issues[0].message });
                return;
            }
            const { novelId, text, field, chapterNumber } = parsed.data;

            let novelContext = '';
            let activeModelClient = modelClient;
            try {
                const context = await resolveExpandIdeaContext({
                    deps,
                    novelId,
                    userId: req.auth?.id,
                    headers: req.headers,
                    chapterNumber,
                });
                if (context.blockedError) {
                    res.status(400).json({ error: context.blockedError, code: 'USER_API_UNAVAILABLE' });
                    return;
                }
                novelContext = context.novelContext;
                activeModelClient = context.activeModelClient;
                bypassBilling = context.billingBypass;
            } catch {
                // 上下文加载失败不阻塞
            }

            const systemPrompt = buildExpandIdeaSystemPrompt(field);
            const messages: ChatMessage[] = buildExpandIdeaMessages({
                systemPrompt,
                novelContext,
                text,
            });

            // 计费守卫
            if (!bypassBilling && deps.billingService && billingUserId && billingUserId !== 'dev') {
              try {
                const guard = await beginAIBilling({
                  billingService: deps.billingService,
                  userId: billingUserId,
                  operation: 'expandIdea',
                  bizId: `novel:${novelId}:expand`,
                });
                freezeId = guard.freezeId;
                frozenPoints = guard.estimatedPoints;
              } catch (billingErr) {
                const msg = billingErr instanceof Error ? billingErr.message : String(billingErr);
                res.status(402).json({ error: msg, code: 'INSUFFICIENT_BALANCE' });
                return;
              }
            }

            const response = await activeModelClient.chat(messages, { temperature: 0.8, maxTokens: 512 });
            if (freezeId && deps.billingService) {
              await settleAIBilling(deps.billingService, billingUserId!, freezeId, frozenPoints);
            }
            res.json({ expanded: response.content.trim(), model: response.model, usage: response.usage });
        } catch (err) {
            if (freezeId && deps.billingService && billingUserId) {
              settleAIBilling(deps.billingService, billingUserId, freezeId, 0).catch(() => {});
            }
            const message = safeErrorMessage(err, '灵感扩写失败');
            res.status(500).json({ error: message });
        }
    });
}
