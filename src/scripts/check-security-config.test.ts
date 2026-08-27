import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetConfig = vi.fn();

vi.mock('../config/index.js', () => ({
  getConfig: mockGetConfig,
}));

const { executeCheckSecurityConfig } = await import('./check-security-config.js');

type AuthOverrides = Record<string, unknown>;

/** 构造一份除被测项外全部合规的生产配置 */
function buildConfig(authOverrides: AuthOverrides = {}) {
  return {
    auth: {
      enabled: true,
      jwtSecret: 'a'.repeat(32),
      redisPassword: 'a-strong-redis-password',
      adminPassword: 'a-strong-admin-password',
      ...authOverrides,
    },
  };
}

describe('executeCheckSecurityConfig', () => {
  const managedEnvKeys = [
    'NODE_ENV',
    'CORS_ORIGINS',
    'USER_API_ENCRYPTION_SECRET',
    'SERVER_HOST',
    'TRUST_PROXY',
  ] as const;
  const originalEnv = Object.fromEntries(managedEnvKeys.map(key => [key, process.env[key]]));

  beforeEach(() => {
    mockGetConfig.mockReset();
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://example.com';
    process.env.USER_API_ENCRYPTION_SECRET = 'e'.repeat(32);
    process.env.SERVER_HOST = 'example.com';
    process.env.TRUST_PROXY = '1';
  });

  afterEach(() => {
    for (const key of managedEnvKeys) {
      const originalValue = originalEnv[key];
      if (originalValue === undefined) delete process.env[key];
      else process.env[key] = originalValue;
    }
  });

  it('放行全部配置合规的生产环境', () => {
    mockGetConfig.mockReturnValue(buildConfig());
    const result = executeCheckSecurityConfig();
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('拦截仍使用占位值的管理员口令', () => {
    mockGetConfig.mockReturnValue(buildConfig({ adminPassword: 'CHANGE_THIS_PASSWORD' }));
    const result = executeCheckSecurityConfig();
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('AUTH_ADMIN_PASSWORD 不能继续使用默认值');
  });

  it('拦截过短的管理员口令', () => {
    mockGetConfig.mockReturnValue(buildConfig({ adminPassword: 'short' }));
    const result = executeCheckSecurityConfig();
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('AUTH_ADMIN_PASSWORD 长度至少需要 12 个字符');
  });

  it('拦截会导致管理员无法初始化的空口令', () => {
    mockGetConfig.mockReturnValue(buildConfig({ adminPassword: '' }));
    const result = executeCheckSecurityConfig();
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('生产环境启用认证时必须配置 AUTH_ADMIN_PASSWORD');
  });

  it('认证关闭时不校验管理员口令', () => {
    mockGetConfig.mockReturnValue(buildConfig({ enabled: false, adminPassword: 'CHANGE_THIS_PASSWORD' }));
    const result = executeCheckSecurityConfig();
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('非生产环境不做校验', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGINS;
    mockGetConfig.mockReturnValue(buildConfig({ adminPassword: 'CHANGE_THIS_PASSWORD' }));
    const result = executeCheckSecurityConfig();
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('仍然拦截占位 Redis 口令与缺失的 CORS 白名单', () => {
    delete process.env.CORS_ORIGINS;
    mockGetConfig.mockReturnValue(buildConfig({ redisPassword: 'CHANGE_THIS_PASSWORD' }));
    const result = executeCheckSecurityConfig();
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('Redis 密码不能继续使用默认值');
    expect(result.issues).toContain('生产环境必须配置 CORS_ORIGINS');
  });

  it('拦截缺失的用户密钥加密、主机名和代理配置', () => {
    delete process.env.USER_API_ENCRYPTION_SECRET;
    delete process.env.SERVER_HOST;
    delete process.env.TRUST_PROXY;
    mockGetConfig.mockReturnValue(buildConfig());

    const result = executeCheckSecurityConfig();

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      'USER_API_ENCRYPTION_SECRET 长度至少需要 32 个字符',
      '生产环境启用认证时必须配置 SERVER_HOST',
      '生产环境启用认证时必须显式配置 TRUST_PROXY（无反向代理时设为 0）',
    ]));
  });

  it('拒绝带协议或路径的 SERVER_HOST', () => {
    process.env.SERVER_HOST = 'https://example.com/login';
    mockGetConfig.mockReturnValue(buildConfig());

    const result = executeCheckSecurityConfig();

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('SERVER_HOST 必须是合法的主机名，不能包含协议、路径或用户信息');
  });
});
