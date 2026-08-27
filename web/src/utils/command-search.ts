export function normalizeCommandQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

export function matchCommandQuery(query: string, fields: Array<string | null | undefined>): boolean {
  if (!query) return true;
  return fields.some(field => Boolean(field && field.toLowerCase().includes(query)));
}
