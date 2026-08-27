import { preferences } from '@kit.ArkData';

const PREFS_NAME = 'nw-reader-shell';
const KEY_ENTRY_URL_OVERRIDE = 'entry_url_override';

export class HarmonyShellConfig {
  private context: Context;

  constructor(context: Context) {
    this.context = context;
  }

  async resolveEntryUrl(defaultUrl: string): Promise<string> {
    try {
      const prefs = await preferences.getPreferences(this.context, PREFS_NAME);
      const override = await prefs.get(KEY_ENTRY_URL_OVERRIDE, '') as string;
      return this.normalizeHttpUrl(override) || this.normalizeHttpUrl(defaultUrl) || defaultUrl;
    } catch {
      return this.normalizeHttpUrl(defaultUrl) || defaultUrl;
    }
  }

  async persistEntryUrlOverride(entryUrl: string): Promise<string | null> {
    const normalized = this.normalizeHttpUrl(entryUrl);
    if (!normalized) {
      return null;
    }
    try {
      const prefs = await preferences.getPreferences(this.context, PREFS_NAME);
      await prefs.put(KEY_ENTRY_URL_OVERRIDE, normalized);
      await prefs.flush();
    } catch {
      // ignore persistence failures, the override is still valid for this session
    }
    return normalized;
  }

  normalizeHttpUrl(rawUrl: string): string | null {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) {
      return null;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return null;
    }
    return trimmed;
  }

  resolveHotUpdateConfigUrl(explicitConfigUrl: string, entryUrl: string): string {
    const explicit = this.normalizeHttpUrl(explicitConfigUrl);
    if (explicit) {
      return explicit;
    }
    const normalized = this.normalizeHttpUrl(entryUrl);
    if (!normalized) {
      return '';
    }
    const lastSlash = normalized.indexOf('/', 8);
    const origin = lastSlash > 0 ? normalized.substring(0, lastSlash) : normalized;
    return origin + '/app-shell/update.json';
  }
}
