import { ref } from 'vue';

const isOpen = ref(false);

export function useProfileDrawer() {
  return {
    isOpen,
    open: () => { isOpen.value = true; },
    close: () => { isOpen.value = false; },
  };
}
