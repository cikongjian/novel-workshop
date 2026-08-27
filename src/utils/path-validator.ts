import path from 'node:path';

/**
 * 验证路径是否安全（防止路径遍历）
 * @param basePath 基础目录（绝对路径）
 * @param userPath 用户提供的路径
 * @returns 安全的绝对路径
 * @throws Error 如果路径尝试逃逸基础目录
 */
export function validateSafePath(basePath: string, userPath: string): string {
  const normalized = path.normalize(userPath);
  const resolved = path.resolve(basePath, normalized);

  // 确保解析后的路径仍在基础目录内（用 path.sep 后缀防止前缀碰撞）
  if (!resolved.startsWith(basePath + path.sep) && resolved !== basePath) {
    throw new Error('Invalid path: attempted directory traversal');
  }

  return resolved;
}
