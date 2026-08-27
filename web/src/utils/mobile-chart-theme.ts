export type MobileChartTheme = {
  textMuted: string;
  accent: string;
  accentStrong: string;
  danger: string;
  accentWashSubtle: string;
  accentWashSoft: string;
  accentArea: string;
  accentAreaStrong: string;
  accentStrongArea: string;
  dangerArea: string;
};

function resolveColorToken(scope: Element, name: string, fallback: string): string {
  const probe = document.createElement('span');
  probe.style.cssText = [
    'position:absolute',
    'width:0',
    'height:0',
    'overflow:hidden',
    'opacity:0',
    'pointer-events:none',
    `color:var(${name}, ${fallback})`,
  ].join(';');

  scope.appendChild(probe);
  const color = getComputedStyle(probe).color || fallback;
  probe.remove();
  return color;
}

function toRgba(color: string, alpha: number): string {
  const normalized = color.trim();
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];

  if (hex) {
    const value = hex.length === 3
      ? hex.split('').map((part) => part + part).join('')
      : hex;
    const numeric = Number.parseInt(value, 16);
    const red = (numeric >> 16) & 255;
    const green = (numeric >> 8) & 255;
    const blue = numeric & 255;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const rgb = normalized.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  }

  return normalized;
}

export function getMobileChartTheme(element: Element | null | undefined): MobileChartTheme {
  const scope = element?.closest('.mobile-fun-page, .mobile-focus-page, .mobile-focus-light-vars') ?? document.documentElement;
  const textMuted = resolveColorToken(scope, '--nw-text-muted', 'var(--nw-text-secondary)');
  const accent = resolveColorToken(scope, '--mobile-focus-accent', 'var(--star-brand-sky)');
  const accentStrong = resolveColorToken(scope, '--mobile-focus-accent-strong', 'var(--star-brand-teal)');
  const danger = resolveColorToken(scope, '--mobile-focus-status-danger', 'var(--mobile-focus-accent-strong)');

  return {
    textMuted,
    accent,
    accentStrong,
    danger,
    accentWashSubtle: toRgba(accent, 0.02),
    accentWashSoft: toRgba(accent, 0.04),
    accentArea: toRgba(accent, 0.15),
    accentAreaStrong: toRgba(accent, 0.3),
    accentStrongArea: toRgba(accentStrong, 0.15),
    dangerArea: toRgba(danger, 0.12),
  };
}
