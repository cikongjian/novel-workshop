import type { Directive } from 'vue';

export const vRipple: Directive = {
  mounted(el) {
    el.style.position = 'relative';
    el.style.overflow = 'hidden';

    const handleRipple = (event: MouseEvent) => {
      const ripple = document.createElement('span');
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.5;

      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${event.clientX - rect.left - size / 2}px;
        top: ${event.clientY - rect.top - size / 2}px;
        background: radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, transparent 70%);
        border-radius: 50%;
        transform: scale(0);
        pointer-events: none;
      `;

      el.appendChild(ripple);

      const animation = ripple.animate([
        { transform: 'scale(0)', opacity: 0.6 },
        { transform: 'scale(1)', opacity: 0 }
      ], { duration: 600, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });

      animation.onfinish = () => ripple.remove();
    };

    el.addEventListener('click', handleRipple);
    (el as any)._rippleHandler = handleRipple;
  },

  unmounted(el) {
    const handler = (el as any)._rippleHandler;
    if (handler) {
      el.removeEventListener('click', handler);
    }
  }
};
