import type { AuthConfig } from './types.js';

export type SecurityConfigValidationResult = {
  ok: boolean;
  issues: string[];
};

type SecurityConfigInput = {
  auth: Pick<
    AuthConfig,
    'enabled' | 'jwtSecret' | 'redisPassword' | 'adminPassword'
  >;
};

const PLACEHOLDER_PASSWORD = 'CHANGE_THIS_PASSWORD';
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const MIN_SECRET_LENGTH = 32;

function isValidServerHost(value: string): boolean {
  if (!value || /[\s/@?#]/u.test(value)) return false;
  try {
    const parsed = new URL(`https://${value}`);
    return parsed.host.toLowerCase() === value.toLowerCase() && parsed.pathname === '/';
  } catch {
    return false;
  }
}

export function validateProductionSecurityConfig(
  config: SecurityConfigInput,
  env: NodeJS.ProcessEnv = process.env,
): SecurityConfigValidationResult {
  const issues: string[] = [];
  if (env.NODE_ENV !== 'production') return { ok: true, issues };

  const corsOrigins = env.CORS_ORIGINS?.trim() ?? '';
  if (!corsOrigins) {
    issues.push('生产环境必须配置 CORS_ORIGINS');
  }

  if (!config.auth.enabled) return { ok: issues.length === 0, issues };

  if (config.auth.jwtSecret.length < MIN_SECRET_LENGTH) {
    issues.push(`生产环境中的 JWT 密钥长度至少需要 ${MIN_SECRET_LENGTH} 个字符`);
  }

  if (config.auth.redisPassword === PLACEHOLDER_PASSWORD) {
    issues.push('Redis 密码不能继续使用默认值');
  }

  const adminPassword = config.auth.adminPassword;
  if (!adminPassword) {
    issues.push('生产环境启用认证时必须配置 AUTH_ADMIN_PASSWORD');
  } else if (adminPassword === PLACEHOLDER_PASSWORD) {
    issues.push('AUTH_ADMIN_PASSWORD 不能继续使用默认值');
  } else if (adminPassword.length < MIN_ADMIN_PASSWORD_LENGTH) {
    issues.push(`AUTH_ADMIN_PASSWORD 长度至少需要 ${MIN_ADMIN_PASSWORD_LENGTH} 个字符`);
  }

  if ((env.USER_API_ENCRYPTION_SECRET?.trim().length ?? 0) < MIN_SECRET_LENGTH) {
    issues.push(`USER_API_ENCRYPTION_SECRET 长度至少需要 ${MIN_SECRET_LENGTH} 个字符`);
  }

  const serverHost = env.SERVER_HOST?.trim() ?? '';
  if (!serverHost) {
    issues.push('生产环境启用认证时必须配置 SERVER_HOST');
  } else if (!isValidServerHost(serverHost)) {
    issues.push('SERVER_HOST 必须是合法的主机名，不能包含协议、路径或用户信息');
  }

  if (!(env.TRUST_PROXY?.trim())) {
    issues.push('生产环境启用认证时必须显式配置 TRUST_PROXY（无反向代理时设为 0）');
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function formatSecurityValidationError(result: SecurityConfigValidationResult): string {
  return ['生产安全配置校验失败', ...result.issues.map(issue => `- ${issue}`)].join('\n');
}
