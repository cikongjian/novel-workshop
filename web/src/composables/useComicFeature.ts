import { ref } from 'vue';
import { http } from '../api/http';

/**
 * 章节漫画功能开关（前端）。
 *
 * 数据来源：`GET /api/settings/public/comic-config`（公开端点，无需登录），
 * 由 admin 在「系统设置 → 邮件配置」分区的「启用章节漫画」开关控制。
 *
 * 防烂尾保证：
 * - module-level ref = 全站单例，所有组件共享同一个开关状态；
 * - 加载失败/端点不可达时一律按「关闭」处理（comicEnabled=false），
 *   任何依赖漫画入口的组件 v-if 会全部不渲染，等价于功能不存在；
 * - `loadComicFeature()` 幂等，重复调用只发一次请求。
 */

/** 漫画功能是否对当前站点启用 */
const comicEnabled = ref(false);
/** 每章默认格数（后端下发，供前端预算/展示） */
const defaultPanelsPerChapter = ref(3);
/** 是否已完成首次加载 */
const initialized = ref(false);

let initPromise: Promise<void> | null = null;

/** 拉取漫画开关配置；幂等，App 启动时调用一次即可 */
export async function loadComicFeature(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const { data } = await http.get<{
        enabled?: boolean;
        defaultPanelsPerChapter?: number;
      }>('/settings/public/comic-config');
      comicEnabled.value = Boolean(data.enabled);
      defaultPanelsPerChapter.value = data.defaultPanelsPerChapter ?? 3;
    } catch {
      // 端点不可达时按「关闭」处理，保证关闭即无痕
      comicEnabled.value = false;
      defaultPanelsPerChapter.value = 3;
    } finally {
      initialized.value = true;
    }
  })();
  return initPromise;
}

/**
 * 强制重新拉取开关（绕过幂等缓存）。
 * loadComicFeature 首次后不再重拉，admin 改了开关后，组件进入时调用此方法拿最新状态。
 */
export async function refreshComicFeature(): Promise<void> {
  initPromise = null;
  return loadComicFeature();
}

export function useComicFeature() {
  return { comicEnabled, defaultPanelsPerChapter, initialized, loadComicFeature, refreshComicFeature };
}
