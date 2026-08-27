import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

type UseVisibilityTriggerOptions = {
  rootMargin?: string;
};

export function useVisibilityTrigger(
  options: UseVisibilityTriggerOptions = {},
): {
  target: Ref<HTMLElement | null>;
  visible: Ref<boolean>;
} {
  const target = ref<HTMLElement | null>(null);
  const visible = ref(false);
  let observer: IntersectionObserver | null = null;

  const disconnect = () => {
    observer?.disconnect();
    observer = null;
  };

  const observeTarget = (element: HTMLElement | null) => {
    if (!observer || !element) return;
    observer.observe(element);
  };

  onMounted(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      visible.value = true;
      return;
    }

    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visible.value = true;
          disconnect();
          return;
        }
      }
    }, {
      rootMargin: options.rootMargin ?? '240px 0px',
    });

    observeTarget(target.value);
  });

  watch(target, (element, previous) => {
    if (visible.value) return;
    if (previous && observer) {
      observer.unobserve(previous);
    }
    observeTarget(element);
  });

  onUnmounted(() => {
    disconnect();
  });

  return {
    target,
    visible,
  };
}
