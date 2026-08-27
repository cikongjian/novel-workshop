import { http } from './http';

// ==================== 同步类型 ====================

export type SyncAction = 'push' | 'pull' | 'in_sync' | 'local_only' | 'remote_only' | 'conflict';

export interface SyncPlan {
  syncId: string;
  title: string;
  action: SyncAction;
  localId?: string;
  remoteId?: string;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
}

export interface SyncResult {
  syncId: string;
  title: string;
  success: boolean;
  action: 'push' | 'pull';
  error?: string;
}

export interface SyncRemoteAuthPayload {
  remoteToken?: string;
  remoteUsername?: string;
  remotePassword?: string;
}

// ==================== 同步 API ====================

/** 对比本地与远端小说清单 */
export async function compareSyncManifest(
  remoteUrl: string,
  auth?: SyncRemoteAuthPayload,
): Promise<SyncPlan[]> {
  const { data } = await http.post<SyncPlan[]>(
    '/sync/compare',
    { remoteUrl, ...auth },
    { timeout: 60_000 },
  );
  return data;
}

/** 执行同步操作 */
export async function executeSyncActions(
  remoteUrl: string,
  actions: Array<{ syncId: string; action: 'push' | 'pull'; localId?: string; remoteId?: string }>,
  auth?: SyncRemoteAuthPayload,
): Promise<{ results: SyncResult[] }> {
  const { data } = await http.post<{ results: SyncResult[] }>(
    '/sync/execute',
    { remoteUrl, actions, ...auth },
    { timeout: 600_000 },
  );
  return data;
}
