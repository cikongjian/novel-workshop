const supportsColorMix = (() => {
  try {
    return CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
  } catch {
    return false;
  }
})();

type RGBA = [number, number, number, number];

function parseHexColor(value: string): RGBA | null {
  const hexMatch = value.match(/^#([0-9a-f]{3,8})$/i);
  if (!hexMatch) return null;
  let hex = hexMatch[1];
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      1,
    ];
  }
  if (hex.length === 8) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      parseInt(hex.slice(6, 8), 16) / 255,
    ];
  }
  return null;
}

function parseRgbColor(value: string): RGBA | null {
  const m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) {
    return [
      parseInt(m[1]),
      parseInt(m[2]),
      parseInt(m[3]),
      m[4] !== undefined ? parseFloat(m[4]) : 1,
    ];
  }
  return null;
}

const NAMED_COLORS: Record<string, string> = {
  transparent: 'rgba(0,0,0,0)',
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  brown: '#a52a2a',
  currentcolor: 'currentColor',
};

function parseColor(value: string, resolveVar: (name: string) => string | null): RGBA | null {
  const v = value.trim();
  if (!v) return null;

  if (v.startsWith('var(')) {
    const m = v.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
    if (m) {
      const resolved = resolveVar(m[1]);
      if (resolved) return parseColor(resolved, resolveVar);
      if (m[2]) return parseColor(m[2], resolveVar);
      return null;
    }
  }

  if (v.startsWith('color-mix(')) {
    const mixed = evalColorMix(v, resolveVar);
    if (mixed) return parseColor(mixed, resolveVar);
    return null;
  }

  const hex = parseHexColor(v);
  if (hex) return hex;

  const rgb = parseRgbColor(v);
  if (rgb) return rgb;

  const named = NAMED_COLORS[v.toLowerCase()];
  if (named && named !== 'currentColor') return parseColor(named, resolveVar);

  return null;
}

function mixColors(c1: RGBA, c2: RGBA, pct: number): RGBA {
  const p = pct / 100;
  return [
    Math.round(c1[0] * p + c2[0] * (1 - p)),
    Math.round(c1[1] * p + c2[1] * (1 - p)),
    Math.round(c1[2] * p + c2[2] * (1 - p)),
    c1[3] * p + c2[3] * (1 - p),
  ];
}

function rgbaToString(c: RGBA): string {
  if (Math.abs(c[3] - 1) < 0.0001) {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3].toFixed(4)})`;
}

function findMatchingParen(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      parts.push(s.slice(last, i).trim());
      last = i + 1;
    }
  }
  parts.push(s.slice(last).trim());
  return parts;
}

function evalColorMix(expr: string, resolveVar: (name: string) => string | null): string | null {
  const match = expr.match(/^color-mix\s*\(/i);
  if (!match) return null;

  const openParen = match[0].length - 1;
  const closeParen = findMatchingParen(expr, openParen);
  if (closeParen === -1) return null;

  const inner = expr.slice(openParen + 1, closeParen);
  const parts = splitTopLevelCommas(inner);
  if (parts.length < 3) return null;

  const color1Raw = parts[1].trim();
  const color2Raw = parts[2].trim();

  let pct = 50;
  const pctMatch = color1Raw.match(/^(.+?)\s+([\d.]+)%$/);
  let c1str = color1Raw;
  if (pctMatch) {
    c1str = pctMatch[1].trim();
    pct = parseFloat(pctMatch[2]);
  }

  const c2PctMatch = color2Raw.match(/^(.+?)\s+([\d.]+)%$/);
  let c2str = color2Raw;
  if (c2PctMatch) {
    c2str = c2PctMatch[1].trim();
    if (!pctMatch) pct = 100 - parseFloat(c2PctMatch[2]);
  }

  const c1 = parseColor(c1str, resolveVar);
  const c2 = parseColor(c2str, resolveVar);
  if (!c1 || !c2) return null;

  return rgbaToString(mixColors(c1, c2, pct));
}

function extractCssVarsFromText(cssText: string): Map<string, string> {
  const varMap = new Map<string, string>();
  let depth = 0;
  let i = 0;

  while (i < cssText.length) {
    const ch = cssText[i];

    if (ch === '{') {
      depth++;
      i++;
      continue;
    }
    if (ch === '}') {
      depth--;
      i++;
      continue;
    }

    if (depth > 0 && ch === '-' && cssText[i + 1] === '-') {
      const colonIdx = cssText.indexOf(':', i);
      if (colonIdx !== -1) {
        const propName = cssText.slice(i, colonIdx).trim();
        if (propName.startsWith('--')) {
          let valStart = colonIdx + 1;
          while (valStart < cssText.length && /\s/.test(cssText[valStart])) valStart++;

          let valEnd = valStart;
          let parenDepth = 0;
          while (valEnd < cssText.length) {
            const c = cssText[valEnd];
            if (c === '(') parenDepth++;
            else if (c === ')') parenDepth--;
            else if (c === ';' && parenDepth === 0) break;
            else if (c === '}' && parenDepth === 0) break;
            valEnd++;
          }

          const propValue = cssText.slice(valStart, valEnd).trim();
          varMap.set(propName, propValue);
          i = valEnd;
          continue;
        }
      }
    }

    i++;
  }

  return varMap;
}

async function fetchAllCssText(): Promise<string[]> {
  const results: string[] = [];
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];

  for (const link of links) {
    const href = link.href;
    if (!href) continue;
    try {
      const resp = await fetch(href);
      if (resp.ok) {
        const text = await resp.text();
        results.push(text);
      }
    } catch {
      // skip
    }
  }

  const styles = Array.from(document.querySelectorAll('style'));
  for (const style of styles) {
    if (style.id === COLOR_MIX_COMPAT_STYLE_ID) continue;
    if (style.textContent) {
      results.push(style.textContent);
    }
  }

  return results;
}

function resolveAllVars(varMap: Map<string, string>): Map<string, string> {
  const resolved = new Map<string, string>();
  const resolving = new Set<string>();

  const resolve = (name: string): string | null => {
    if (resolved.has(name)) return resolved.get(name)!;
    if (resolving.has(name)) return null;

    const raw = varMap.get(name);
    if (raw === undefined) return null;

    resolving.add(name);

    let result = raw;
    let changed = true;
    let iterations = 0;

    while (changed && iterations < 20) {
      changed = false;
      iterations++;

      const varRegex = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g;
      let m: RegExpExecArray | null;
      let newResult = result;
      let offset = 0;

      while ((m = varRegex.exec(result)) !== null) {
        const varName = m[1];
        const fallback = m[2];
        const val = resolve(varName) || fallback;
        if (val) {
          newResult = newResult.slice(0, m.index + offset) + val + newResult.slice(m.index + m[0].length + offset);
          offset += val.length - m[0].length;
          changed = true;
        }
      }

      result = newResult;
    }

    resolving.delete(name);
    resolved.set(name, result);
    return result;
  };

  for (const [name] of varMap) {
    resolve(name);
  }

  return resolved;
}

function computeColorMixVars(resolvedVars: Map<string, string>): Map<string, string> {
  const finalValues = new Map<string, string>();

  const resolveFinal = (name: string): string | null => {
    if (finalValues.has(name)) return finalValues.get(name)!;
    const v = resolvedVars.get(name);
    return v || null;
  };

  let changed = true;
  let iterations = 0;

  while (changed && iterations < 20) {
    changed = false;
    iterations++;

    for (const [name, value] of resolvedVars) {
      const current = finalValues.get(name) || value;
      if (!current.includes('color-mix(')) continue;

      let result = current;
      let localChanged = false;

      const idx = result.indexOf('color-mix(');
      if (idx === -1) continue;

      const closeIdx = findMatchingParen(result, idx + 'color-mix('.length - 1);
      if (closeIdx === -1) continue;

      const expr = result.slice(idx, closeIdx + 1);
      const mixed = evalColorMix(expr, resolveFinal);

      if (mixed) {
        result = result.slice(0, idx) + mixed + result.slice(closeIdx + 1);
        localChanged = true;
      }

      if (localChanged) {
        finalValues.set(name, result);
        changed = true;
      }
    }
  }

  return finalValues;
}

function applyVarOverrides(overrides: Map<string, string>): void {
  const root = document.documentElement;
  for (const [name, value] of overrides) {
    root.style.setProperty(name, value);
  }
}

function replaceColorMixInCss(cssText: string, resolveVar: (name: string) => string | null): string {
  let result = cssText;
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 80) {
    changed = false;
    iterations++;

    const idx = result.indexOf('color-mix(');
    if (idx === -1) break;

    const closeIdx = findMatchingParen(result, idx + 'color-mix('.length - 1);
    if (closeIdx === -1) break;

    const expr = result.slice(idx, closeIdx + 1);
    const mixed = evalColorMix(expr, resolveVar);

    if (!mixed) {
      result = result.slice(0, idx) + 'var(--color-mix-polyfill-unresolved)' + result.slice(closeIdx + 1);
      changed = true;
      continue;
    }

    result = result.slice(0, idx) + mixed + result.slice(closeIdx + 1);
    changed = true;
  }

  return result.replace(/var\(--color-mix-polyfill-unresolved\)/g, 'transparent');
}

function injectCompatCss(cssTexts: string[], resolvedVars: Map<string, string>, computedVars: Map<string, string>): void {
  const resolveVar = (name: string) => computedVars.get(name) || resolvedVars.get(name) || null;
  const css = cssTexts
    .map((text) => replaceColorMixInCss(text, resolveVar))
    .filter((text) => text.includes('rgb(') || text.includes('rgba('))
    .join('\n');

  if (!css.trim()) return;

  const existing = document.getElementById(COLOR_MIX_COMPAT_STYLE_ID);
  if (existing) {
    existing.textContent = css;
    return;
  }

  const style = document.createElement('style');
  style.id = COLOR_MIX_COMPAT_STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

const COLOR_MIX_COMPAT_STYLE_ID = 'color-mix-compat-style';

let applied = false;
let observerStarted = false;
let applyTimer: number | undefined;

function isCompatStyleMutation(mutation: MutationRecord): boolean {
  const target = mutation.target;
  if (target instanceof HTMLElement && target.id === COLOR_MIX_COMPAT_STYLE_ID) return true;
  if (target.parentElement?.id === COLOR_MIX_COMPAT_STYLE_ID) return true;

  const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
  return nodes.length > 0 && nodes.every((node) => {
    return node instanceof HTMLElement && node.id === COLOR_MIX_COMPAT_STYLE_ID;
  });
}

export async function applyColorMixPolyfill(): Promise<void> {
  if (supportsColorMix) return;
  if (applied) return;
  applied = true;

  const applyNow = async () => {
    try {
      const cssTexts = await fetchAllCssText();
      const allVars = new Map<string, string>();

      for (const text of cssTexts) {
        const vars = extractCssVarsFromText(text);
        for (const [k, v] of vars) {
          allVars.set(k, v);
        }
      }

      if (allVars.size === 0) return;

      const resolved = resolveAllVars(allVars);
      const computed = computeColorMixVars(resolved);
      applyVarOverrides(computed);
      injectCompatCss(cssTexts, resolved, computed);
    } catch {
      // silent fail
    }
  };

  const scheduleApply = (delay = 80) => {
    if (applyTimer !== undefined) {
      window.clearTimeout(applyTimer);
    }
    applyTimer = window.setTimeout(() => {
      applyTimer = undefined;
      void applyNow();
    }, delay);
  };

  const observeStyleChanges = () => {
    if (observerStarted) return;
    observerStarted = true;

    const observer = new MutationObserver((mutations) => {
      const hasRelevantStyleChange = mutations.some((mutation) => {
        if (isCompatStyleMutation(mutation)) return false;

        const target = mutation.target;
        if (target instanceof HTMLLinkElement && target.rel === 'stylesheet') return true;
        if (target instanceof HTMLStyleElement) return true;

        const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
        return nodes.some((node) => {
          if (!(node instanceof HTMLElement)) return false;
          if (node.id === COLOR_MIX_COMPAT_STYLE_ID) return false;
          if (node instanceof HTMLStyleElement) return true;
          if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') return true;
          return Boolean(node.querySelector?.('style, link[rel="stylesheet"]'));
        });
      });

      if (hasRelevantStyleChange) {
        scheduleApply();
      }
    });

    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href', 'rel', 'media', 'disabled'],
    });
  };

  if (document.readyState === 'complete') {
    observeStyleChanges();
    scheduleApply(50);
  } else {
    window.addEventListener('load', () => {
      observeStyleChanges();
      scheduleApply(50);
    });
  }
}

export const isColorMixSupported = supportsColorMix;
