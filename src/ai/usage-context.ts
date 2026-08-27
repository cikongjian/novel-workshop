import { AsyncLocalStorage } from 'node:async_hooks';

export type AiUsageScope = 'http' | 'system' | 'script';

export type AiUsageContext = {
  scope: AiUsageScope;
  operationKey?: string;
  operationLabel?: string;
  operationRegistered?: boolean;
  userId?: string;
  username?: string;
  userRole?: string;
  novelId?: string;
  chapterNumber?: number;
  agentRole?: string;
  requestPath?: string;
  requestMethod?: string;
};

const storage = new AsyncLocalStorage<AiUsageContext>();

function normalizeChapterNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function getAiUsageContext(): AiUsageContext | undefined {
  return storage.getStore();
}

export function runWithAiUsageContext<T>(
  context: Partial<AiUsageContext>,
  callback: () => T,
): T {
  const current = getAiUsageContext();
  const merged: AiUsageContext = {
    scope: context.scope ?? current?.scope ?? 'system',
    operationKey: context.operationKey ?? current?.operationKey,
    operationLabel: context.operationLabel ?? current?.operationLabel,
    operationRegistered: context.operationRegistered ?? current?.operationRegistered,
    userId: context.userId ?? current?.userId,
    username: context.username ?? current?.username,
    userRole: context.userRole ?? current?.userRole,
    novelId: context.novelId ?? current?.novelId,
    chapterNumber: normalizeChapterNumber(context.chapterNumber ?? current?.chapterNumber),
    agentRole: context.agentRole ?? current?.agentRole,
    requestPath: context.requestPath ?? current?.requestPath,
    requestMethod: context.requestMethod ?? current?.requestMethod,
  };
  return storage.run(merged, callback);
}

export async function runWithAiUsageContextAsync<T>(
  context: Partial<AiUsageContext>,
  callback: () => Promise<T>,
): Promise<T> {
  return runWithAiUsageContext(context, callback);
}
