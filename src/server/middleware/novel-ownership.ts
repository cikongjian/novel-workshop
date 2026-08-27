/**
 * 小说访问权判定的唯一真实来源。
 *
 * 该判定散落在 20 多个路由与服务文件中过，语义一旦分化就会出现越权：
 * 任何"谁能访问这本小说"的问题都必须走这里，不要再内联复制。
 */

/** 认证关闭时的虚拟用户标识，与 DEV_USER 保持一致 */
export const DEV_OWNER_ID = 'dev';

/** 判定所需的最小请求上下文，避免调用方被迫依赖 express 类型 */
export type NovelAccessActor = {
  id?: string;
  role?: string;
} | undefined;

/** 判定所需的最小小说字段 */
export type NovelOwnership = {
  ownerId?: string;
};

/**
 * 归一化调用方身份：认证关闭时 req.auth 为空，回落到虚拟用户
 */
export function resolveActorId(actor: NovelAccessActor): string {
  return actor?.id ?? DEV_OWNER_ID;
}

/**
 * 归一化小说归属：早期数据没有 ownerId，视为虚拟用户所有
 */
export function resolveOwnerId(novel: NovelOwnership): string {
  return novel.ownerId ?? DEV_OWNER_ID;
}

/**
 * 是否有权访问该小说：管理员或所有者。
 * 其余一律拒绝（fail-closed）。
 */
export function canAccessNovel(actor: NovelAccessActor, novel: NovelOwnership): boolean {
  if (actor?.role === 'admin') return true;
  return resolveOwnerId(novel) === resolveActorId(actor);
}
