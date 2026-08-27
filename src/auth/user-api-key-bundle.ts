import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const LOCAL_ONLY_MASK = '仅本地保存';
const LOCAL_ONLY_COUNT_PATTERN = /^仅本地保存（(\d+) 个）$/;
const SERVER_MULTI_KEY_PATTERN = / 等 (\d+) 个$/;

type UserApiKeyBundlePayload = {
  version: 1;
  apiKeys: string[];
};

function getEncryptionSecret(): string {
  const secret = process.env.USER_API_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('USER_API_ENCRYPTION_SECRET 未配置，不可回退到 JWT 密钥。请配置独立的加密密钥');
  }
  return secret;
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function encryptText(plainText: string): string {
  const secret = getEncryptionSecret();
  if (!secret || secret.length < 32) {
    throw new Error('USER_API_ENCRYPTION_SECRET 未配置，无法保存平台缓存密钥');
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptText(payload: string | null): string {
  if (!payload) return '';
  const secret = getEncryptionSecret();
  if (!secret || secret.length < 32) {
    throw new Error('USER_API_ENCRYPTION_SECRET 未配置，无法解密平台缓存密钥');
  }
  const [ivText, tagText, encryptedText] = payload.split('.');
  if (!ivText || !tagText || !encryptedText) {
    throw new Error('用户 API 密钥格式无效');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(secret),
    Buffer.from(ivText, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

export function normalizeUserApiKeyList(apiKeys?: string[], fallbackApiKey?: string): string[] {
  const source = Array.isArray(apiKeys) && apiKeys.length > 0
    ? apiKeys
    : (fallbackApiKey ? [fallbackApiKey] : []);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function encryptUserApiKeyBundle(apiKeys: string[]): string {
  const payload: UserApiKeyBundlePayload = {
    version: 1,
    apiKeys: normalizeUserApiKeyList(apiKeys),
  };
  return encryptText(JSON.stringify(payload));
}

export function decryptUserApiKeyBundle(payload: string | null): string[] {
  const plainText = decryptText(payload).trim();
  if (!plainText) return [];
  try {
    const parsed = JSON.parse(plainText) as Partial<UserApiKeyBundlePayload>;
    if (parsed.version === 1 && Array.isArray(parsed.apiKeys)) {
      return normalizeUserApiKeyList(parsed.apiKeys);
    }
  } catch {
    // 兼容旧的单 key 存储格式。
  }
  return normalizeUserApiKeyList(undefined, plainText);
}

export function buildServerMaskedApiKeySummary(apiKeys: string[]): string {
  const normalized = normalizeUserApiKeyList(apiKeys);
  if (normalized.length === 0) return '';
  if (normalized.length === 1) {
    return maskApiKey(normalized[0]);
  }
  return `${maskApiKey(normalized[0])} 等 ${normalized.length} 个`;
}

export function buildLocalMaskedApiKeySummary(count?: number): string {
  if (!count || count <= 1) {
    return LOCAL_ONLY_MASK;
  }
  return `${LOCAL_ONLY_MASK}（${count} 个）`;
}

export function inferLocalApiKeyCount(maskedApiKey: string): number {
  const normalized = maskedApiKey.trim();
  if (!normalized) return 0;
  if (normalized === LOCAL_ONLY_MASK) return 1;
  const match = normalized.match(LOCAL_ONLY_COUNT_PATTERN);
  return match ? Number(match[1]) : 1;
}

export function inferServerApiKeyCount(maskedApiKey: string): number {
  const normalized = maskedApiKey.trim();
  if (!normalized) return 0;
  const match = normalized.match(SERVER_MULTI_KEY_PATTERN);
  return match ? Number(match[1]) : 1;
}
