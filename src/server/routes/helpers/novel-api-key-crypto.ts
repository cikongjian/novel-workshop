import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';

const CIPHER_ALGO = 'aes-256-gcm';
const MASK_PLACEHOLDER = '****';
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT = 'novel-workshop-api-key-encryption'; // 固定 salt，因为密钥本身已是高熵值

let secretMissingWarned = false;

function getSecret(): string {
  // 仅使用专用加密密钥，禁止回退到 JWT Secret（防止 JWT 泄露导致 API Key 泄露）
  const secret = process.env.USER_API_ENCRYPTION_SECRET;
  return secret || '';
}

function deriveKey(secret: string): Buffer {
  return pbkdf2Sync(secret, PBKDF2_SALT, PBKDF2_ITERATIONS, 32, 'sha256');
}

/** 旧版密钥派生（SHA256 直接截取），用于解密迁移前的数据 */
function deriveKeyLegacy(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/** 加密小说级 API Key，返回密文字符串。空值返回空字符串。 */
export function encryptNovelApiKey(plainKey: string): string {
  const trimmed = plainKey.trim();
  if (!trimmed) return '';
  const secret = getSecret();
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('USER_API_ENCRYPTION_SECRET 未配置或过短（需≥16字符），生产环境禁止明文存储 API Key');
    }
    if (!secretMissingWarned) {
      console.warn('[novel-api-key-crypto] 加密密钥未配置或过短，API Key 将以明文存储。请设置 USER_API_ENCRYPTION_SECRET 环境变量（≥32 字符）');
      secretMissingWarned = true;
    }
    return trimmed;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER_ALGO, deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

/** 解密小说级 API Key。返回明文。无法解密时返回原始值（兼容未加密旧数据）。 */
export function decryptNovelApiKey(stored: string): string {
  if (!stored) return '';
  if (!stored.startsWith('enc1.')) return stored; // 未加密的旧数据直接返回
  const secret = getSecret();
  if (!secret || secret.length < 16) {
    console.warn('[novel-api-key-crypto] 无法解密：加密密钥未配置或过短');
    return '';
  }
  const parts = stored.slice(5).split('.');
  if (parts.length !== 3) return '';
  const [ivText, tagText, encryptedText] = parts;
  const iv = Buffer.from(ivText, 'base64url');
  const tag = Buffer.from(tagText, 'base64url');
  const encryptedBuf = Buffer.from(encryptedText, 'base64url');

  // 先尝试新版 PBKDF2 密钥派生
  try {
    const decipher = createDecipheriv(CIPHER_ALGO, deriveKey(secret), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encryptedBuf), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    // 新密钥解密失败，尝试旧版 SHA256 密钥派生（兼容迁移前的数据）
  }

  try {
    const decipher = createDecipheriv(CIPHER_ALGO, deriveKeyLegacy(secret), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encryptedBuf), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return ''; // 密钥变更或数据损坏
  }
}

/** 将 API Key 脱敏为 `aadd****d7f2` 格式 */
export function maskApiKeyForDisplay(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return MASK_PLACEHOLDER;
  return `${trimmed.slice(0, 4)}${MASK_PLACEHOLDER}${trimmed.slice(-4)}`;
}

/** 判断前端传来的 key 是否为脱敏值（包含 ****），说明用户没修改 */
export function isApiKeyMasked(key: string): boolean {
  return key.includes(MASK_PLACEHOLDER);
}
