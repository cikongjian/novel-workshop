/**
 * 桌面端全局搜索状态（模块级单例）
 *
 * 顶栏（DesktopApp）的搜索框与作品列表（DesktopHome）共享同一个 query，
 * 通过模块级 ref 实现跨组件单向数据流，无需 Pinia。
 * 未来可扩展为携带 category/sort 等过滤维度的对象。
 */
import { ref } from 'vue';

const query = ref('');

export function useDesktopSearch() {
  return { query };
}
