import { describe, expect, it } from 'vitest';
import {
  formatSecurityValidationError,
  validateProductionSecurityConfig,
} from './security-config.js';

/** 构造一份除被测项外全部合规的生产环境变量 */
function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://example.com',
    USER_API_ENCRYPTION_SECRET: 'e'.repeat(32),
    SERVER_HOST: 'example.com',
    TRUST_PROXY: '1',
    ...overrides,
  };
}

/** 构造一份除被测项外全部合规的认证配置 */
function config(authOverrides: Record<string, unknown> = {}) {
  return {
    auth: {
      enabled: true,
      jwtSecret: 'a'.repeat(32),
      redisPassword: 'a-strong-redis-password',
      adminPassword: 'a-strong-admin-password',
      ...authOverrides,
    },
  } as Parameters<typeof validateProductionSecurityConfig>[0];
}

function issuesOf(authOverrides = {}, envOverrides = {}) {
  return validateProductionSecurityConfig(config(authOverrides), env(envOverrides)).issues;
}

describe('validateProductionSecurityConfig 环境门槛', () => {
  it('全部合规时放行', () => {
    expect(validateProductionSecurityConfig(config(), env())).toEqual({ ok: true, issues: [] });
  });

  it('非生产环境一律跳过校验', () => {
    for (const nodeEnv of ['development', 'test', undefined]) {
      const result = validateProductionSecurityConfig(
        config({ adminPassword: 'CHANGE_THIS_PASSWORD', jwtSecret: '' }),
        env({ NODE_ENV: nodeEnv, CORS_ORIGINS: undefined }),
      );
      expect(result).toEqual({ ok: true, issues: [] });
    }
  });

  it('CORS 白名单缺失时拦截，且与认证开关无关', () => {
    expect(issuesOf({}, { CORS_ORIGINS: undefined })).toContain('生产环境必须配置 CORS_ORIGINS');
    expect(issuesOf({}, { CORS_ORIGINS: '   ' })).toContain('生产环境必须配置 CORS_ORIGINS');
    const disabled = validateProductionSecurityConfig(
      config({ enabled: false }),
      env({ CORS_ORIGINS: undefined }),
    );
    expect(disabled.issues).toContain('生产环境必须配置 CORS_ORIGINS');
  });

  it('认证关闭时不再校验认证相关项', () => {
    const result = validateProductionSecurityConfig(
      config({ enabled: false, jwtSecret: '', adminPassword: '' }),
      env({ SERVER_HOST: undefined, TRUST_PROXY: undefined }),
    );
    expect(result).toEqual({ ok: true, issues: [] });
  });
});

describe('validateProductionSecurityConfig 凭据强度', () => {
  it('JWT 密钥不足 32 字符时拦截', () => {
    expect(issuesOf({ jwtSecret: 'a'.repeat(31) })).toContain('生产环境中的 JWT 密钥长度至少需要 32 个字符');
    expect(issuesOf({ jwtSecret: '' })).toContain('生产环境中的 JWT 密钥长度至少需要 32 个字符');
  });

  it('恰好 32 字符的 JWT 密钥放行', () => {
    expect(issuesOf({ jwtSecret: 'a'.repeat(32) })).toEqual([]);
  });

  it('Redis 占位口令被拦截', () => {
    expect(issuesOf({ redisPassword: 'CHANGE_THIS_PASSWORD' })).toContain('Redis 密码不能继续使用默认值');
  });

  it('管理员口令留空时拦截（生产必须显式配置）', () => {
    expect(issuesOf({ adminPassword: '' })).toContain('生产环境启用认证时必须配置 AUTH_ADMIN_PASSWORD');
  });

  it('管理员口令为占位值时拦截', () => {
    expect(issuesOf({ adminPassword: 'CHANGE_THIS_PASSWORD' })).toContain('AUTH_ADMIN_PASSWORD 不能继续使用默认值');
  });

  it('管理员口令过短时拦截', () => {
    expect(issuesOf({ adminPassword: 'short' })).toContain('AUTH_ADMIN_PASSWORD 长度至少需要 12 个字符');
  });

  it('恰好 12 字符的管理员口令放行', () => {
    expect(issuesOf({ adminPassword: 'a'.repeat(12) })).toEqual([]);
  });

  it('用户 API 加密密钥不足 32 字符时拦截', () => {
    const message = 'USER_API_ENCRYPTION_SECRET 长度至少需要 32 个字符';
    expect(issuesOf({}, { USER_API_ENCRYPTION_SECRET: undefined })).toContain(message);
    expect(issuesOf({}, { USER_API_ENCRYPTION_SECRET: 'e'.repeat(31) })).toContain(message);
    // 仅空白不算有效长度
    expect(issuesOf({}, { USER_API_ENCRYPTION_SECRET: ' '.repeat(40) })).toContain(message);
  });
});

describe('validateProductionSecurityConfig 部署参数', () => {
  it('SERVER_HOST 缺失时拦截', () => {
    expect(issuesOf({}, { SERVER_HOST: undefined })).toContain('生产环境启用认证时必须配置 SERVER_HOST');
    expect(issuesOf({}, { SERVER_HOST: '   ' })).toContain('生产环境启用认证时必须配置 SERVER_HOST');
  });

  it('SERVER_HOST 含协议、路径或用户信息时拦截', () => {
    const message = 'SERVER_HOST 必须是合法的主机名，不能包含协议、路径或用户信息';
    for (const host of [
      'https://example.com',
      'example.com/path',
      'user@example.com',
      'example.com?q=1',
      'example.com#frag',
      'exa mple.com',
    ]) {
      expect(issuesOf({}, { SERVER_HOST: host })).toContain(message);
    }
  });

  it('合法主机名放行，含端口与大小写', () => {
    for (const host of ['example.com', 'sub.example.com', 'example.com:8443', 'EXAMPLE.com']) {
      expect(issuesOf({}, { SERVER_HOST: host })).toEqual([]);
    }
  });

  it('TRUST_PROXY 未显式配置时拦截', () => {
    const message = '生产环境启用认证时必须显式配置 TRUST_PROXY（无反向代理时设为 0）';
    expect(issuesOf({}, { TRUST_PROXY: undefined })).toContain(message);
    expect(issuesOf({}, { TRUST_PROXY: '' })).toContain(message);
    expect(issuesOf({}, { TRUST_PROXY: '  ' })).toContain(message);
  });

  it('TRUST_PROXY 显式设为 0 视为已配置', () => {
    // 无反向代理时的正确写法，不能被当成"未配置"
    expect(issuesOf({}, { TRUST_PROXY: '0' })).toEqual([]);
  });
});

describe('validateProductionSecurityConfig 汇总行为', () => {
  it('多项不合规时全部列出', () => {
    const issues = issuesOf(
      { jwtSecret: '', adminPassword: '' },
      { CORS_ORIGINS: undefined, SERVER_HOST: undefined, TRUST_PROXY: undefined },
    );
    expect(issues.length).toBeGreaterThanOrEqual(5);
  });

  it('ok 与 issues 始终一致', () => {
    const pass = validateProductionSecurityConfig(config(), env());
    expect(pass.ok).toBe(pass.issues.length === 0);
    const fail = validateProductionSecurityConfig(config({ adminPassword: '' }), env());
    expect(fail.ok).toBe(false);
    expect(fail.issues.length).toBeGreaterThan(0);
  });
});

describe('formatSecurityValidationError', () => {
  it('逐条列出问题', () => {
    const text = formatSecurityValidationError({ ok: false, issues: ['问题甲', '问题乙'] });
    expect(text).toContain('生产安全配置校验失败');
    expect(text).toContain('- 问题甲');
    expect(text).toContain('- 问题乙');
  });

  it('无问题时只有标题行', () => {
    expect(formatSecurityValidationError({ ok: true, issues: [] })).toBe('生产安全配置校验失败');
  });
});
