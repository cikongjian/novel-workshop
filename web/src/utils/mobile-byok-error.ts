import type { Router } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { extractApiErrorMessage } from './api-error';

export function resolveMobileByokErrorMessage(error: unknown, fallback: string): string {
  const message = extractApiErrorMessage(error, fallback);
  return `${message}\n\n如果还没有配置模型 API，请先填写自己的 Key 后再继续生成。`;
}

export async function showMobileByokErrorGuide(error: unknown, fallback: string, router: Router): Promise<void> {
  const message = resolveMobileByokErrorMessage(error, fallback);
  try {
    await ElMessageBox.confirm(message, '检查模型 API', {
      confirmButtonText: '去配置模型 API',
      cancelButtonText: '稍后再说',
      type: 'warning',
      dangerouslyUseHTMLString: false,
    });
    await router.push('/m/api-settings');
  } catch {
    return;
  }
}
