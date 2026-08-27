/**
 * 日志系统测试（含脱敏验证）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from './logger.js';

describe('createLogger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a logger with tag', () => {
    const log = createLogger('test');
    log.info('hello');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('[test]');
    expect(output).toContain('hello');
  });

  it('should create child logger with combined tag', () => {
    const log = createLogger('parent').child('child');
    log.info('nested');
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('[parent:child]');
  });

  it('should sanitize apiKey in meta', () => {
    const log = createLogger('sec');
    log.info('test', { apiKey: 'sk-1234567890abcdef' });
    const output = consoleSpy.mock.calls[0][0] as string;
    // 应该被掩码，不应包含完整 key
    expect(output).not.toContain('sk-1234567890abcdef');
    expect(output).toContain('sk-1****cdef');
  });

  it('should sanitize nested secret fields', () => {
    const log = createLogger('sec');
    log.info('test', { config: { api_key: 'mykey123456789', name: 'visible' } });
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('mykey123456789');
    expect(output).toContain('visible');
  });

  it('should sanitize token and password fields', () => {
    const log = createLogger('sec');
    log.info('test', { token: 'tok_abcdefghij', password: 'pass12345678' });
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('tok_abcdefghij');
    expect(output).not.toContain('pass12345678');
  });

  it('should not sanitize non-sensitive fields', () => {
    const log = createLogger('sec');
    log.info('test', { name: 'visible', count: 42 });
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('visible');
    expect(output).toContain('42');
  });
});
