import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import type { OutlineDeps } from './route-types.js';

export type OutlineAiRouteDeps = Pick<OutlineDeps, 'novelManager' | 'agents' | 'modelClient' | 'broadcast' | 'authDb'>;

export async function resolveOutlineModelAccess(params: {
  deps: Pick<OutlineAiRouteDeps, 'authDb' | 'modelClient'>;
  novel: Awaited<ReturnType<OutlineAiRouteDeps['novelManager']['getNovel']>>;
  userId?: string;
  headers: Record<string, string | string[] | undefined>;
}) {
  const modelAccess = await resolveUserModelAccess({
    authDb: params.deps.authDb,
    userId: params.userId,
    headers: params.headers,
    novel: params.novel,
  });
  if (modelAccess.error && params.novel.modelConfig?.source === 'user-profile') {
    return {
      error: modelAccess.error,
      client: undefined,
      source: modelAccess.source,
    };
  }

  return {
    error: undefined,
    client: modelAccess.client ?? params.deps.modelClient,
    source: modelAccess.source,
  };
}

export function parseAgentJsonContent<T>(content: string): T | null {
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    return JSON.parse(jsonMatch[1]!.trim()) as T;
  } catch {
    return null;
  }
}
