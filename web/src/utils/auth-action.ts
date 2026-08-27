import { ElMessage } from 'element-plus';

interface AuthActionOptions {
  authEnabled: boolean;
  isAuthenticated: boolean;
  message?: string;
}

export function ensureAuthenticatedAction({
  authEnabled,
  isAuthenticated,
  message = '请先登录后再进行此操作',
}: AuthActionOptions): boolean {
  if (!authEnabled || isAuthenticated) {
    return true;
  }

  ElMessage.warning(message);
  return false;
}
