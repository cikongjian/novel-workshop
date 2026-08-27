/**
 * 跨实例同步类型定义
 */

/** 同步清单条目（manifest 端点返回） */
export interface SyncManifestEntry {
  id: string;
  syncId: string;
  title: string;
  updatedAt: string;
  chapterCount: number;
}

/** 同步动作类型 */
export type SyncAction =
  | 'push'         // 本地更新，推送到远端
  | 'pull'         // 远端更新，拉取到本地
  | 'in_sync'      // 两端一致
  | 'local_only'   // 仅本地有
  | 'remote_only'  // 仅远端有
  | 'conflict';    // 两端都修改过（时间差 < 阈值）

/** 同步计划条目（compare 端点返回） */
export interface SyncPlan {
  syncId: string;
  title: string;
  action: SyncAction;
  localId?: string;
  remoteId?: string;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
}

/** 单本同步执行结果 */
export interface SyncResult {
  syncId: string;
  title: string;
  success: boolean;
  action: 'push' | 'pull';
  error?: string;
}

/** 同步执行请求 */
export interface SyncExecuteRequest {
  remoteUrl: string;
  remoteToken?: string;
  remoteUsername?: string;
  remotePassword?: string;
  actions: Array<{
    syncId: string;
    action: 'push' | 'pull';
    localId?: string;
    remoteId?: string;
  }>;
}
