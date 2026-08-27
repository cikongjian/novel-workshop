/**
 * 桌面端「新建作品」弹窗的共享可见状态（模块级单例）
 *
 * 侧栏 CTA（DesktopApp）与首页快捷按钮（DesktopHome）都能打开同一个弹窗实例，
 * 弹窗本体挂在 DesktopApp。与 useDesktopSearch 同样的跨组件单例模式。
 */
import { ref } from 'vue';

const createDialogVisible = ref(false);
const dnaDialogVisible = ref(false);
const cangjieDialogVisible = ref(false);

export function useDesktopCreate() {
  return {
    createDialogVisible,
    openCreate: () => {
      dnaDialogVisible.value = false;
      cangjieDialogVisible.value = false;
      createDialogVisible.value = true;
    },
    dnaDialogVisible,
    openDna: () => {
      createDialogVisible.value = false;
      cangjieDialogVisible.value = false;
      dnaDialogVisible.value = true;
    },
    cangjieDialogVisible,
    openCangjie: () => {
      createDialogVisible.value = false;
      dnaDialogVisible.value = false;
      cangjieDialogVisible.value = true;
    },
  };
}


