function isLocalOllamaBaseUrl(baseUrl?: string): boolean {
  if (!baseUrl) return false;
  const normalized = baseUrl.toLowerCase();
  return normalized.includes('127.0.0.1:11434') || normalized.includes('localhost:11434');
}

export function resolveCompatibleApiKey(params: {
  provider: string;
  apiKey: string;
  baseUrl?: string;
}): string {
  if (params.apiKey.trim()) return params.apiKey.trim();
  if (params.provider === 'ollama' || isLocalOllamaBaseUrl(params.baseUrl)) {
    return 'ollama';
  }
  return '';
}
