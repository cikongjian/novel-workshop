const ALLOWED_SERVICE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

export function validateServiceUrl(raw: string | undefined, fallback: string): string | null {
  const urlStr = raw || fallback;
  try {
    const parsed = new URL(urlStr);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!ALLOWED_SERVICE_HOST.test(parsed.hostname)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}
