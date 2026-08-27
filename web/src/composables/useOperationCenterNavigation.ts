import { nextTick, ref, watch, type ComputedRef, type Ref } from 'vue';

export type OperationCenterPanelExpose = {
  focusSearch: () => void;
  scrollToItem: (id: string | null) => void;
};

type OperationCenterEnabledItem = {
  id: string;
};

export function useOperationCenterNavigation(options: {
  visible: Ref<boolean>;
  query: Ref<string>;
  enabledItems: ComputedRef<OperationCenterEnabledItem[]>;
  panelRef: Ref<OperationCenterPanelExpose | null>;
  onSelect: (id: string) => void;
}) {
  const operationCenterActiveId = ref<string | null>(null);

  function scrollOperationCenterActiveIntoView() {
    if (!options.panelRef.value || !operationCenterActiveId.value) return;
    options.panelRef.value.scrollToItem(operationCenterActiveId.value);
  }

  function resetOperationCenterActive() {
    operationCenterActiveId.value = options.enabledItems.value[0]?.id ?? null;
    nextTick(() => {
      scrollOperationCenterActiveIntoView();
    });
  }

  function moveOperationCenterActive(delta: number) {
    const items = options.enabledItems.value;
    if (items.length === 0) {
      operationCenterActiveId.value = null;
      return;
    }
    const currentIndex = items.findIndex(item => item.id === operationCenterActiveId.value);
    const nextIndex = currentIndex < 0
      ? (delta > 0 ? 0 : items.length - 1)
      : (currentIndex + delta + items.length) % items.length;
    operationCenterActiveId.value = items[nextIndex].id;
    nextTick(() => {
      scrollOperationCenterActiveIntoView();
    });
  }

  function openOperationCenter() {
    options.visible.value = true;
  }

  function closeOperationCenter() {
    options.visible.value = false;
  }

  function handleOperationCenterKeydown(event: KeyboardEvent) {
    if (!options.visible.value || event.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveOperationCenterActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveOperationCenterActive(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      operationCenterActiveId.value = options.enabledItems.value[0]?.id ?? null;
      nextTick(() => {
        scrollOperationCenterActiveIntoView();
      });
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      const items = options.enabledItems.value;
      operationCenterActiveId.value = items[items.length - 1]?.id ?? null;
      nextTick(() => {
        scrollOperationCenterActiveIntoView();
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const id = operationCenterActiveId.value ?? options.enabledItems.value[0]?.id;
      if (id) options.onSelect(id);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOperationCenter();
    }
  }

  watch(options.visible, (visible) => {
    if (visible) {
      nextTick(() => {
        options.panelRef.value?.focusSearch();
        resetOperationCenterActive();
      });
    } else {
      options.query.value = '';
      operationCenterActiveId.value = null;
    }
  });

  watch(options.query, () => {
    if (!options.visible.value) return;
    resetOperationCenterActive();
  });

  return {
    operationCenterActiveId,
    openOperationCenter,
    closeOperationCenter,
    handleOperationCenterKeydown,
  };
}
