import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, getBufferedLogEntries } from './logger.js';

describe('logger redaction', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('creates a logger with a tag', () => {
    createLogger('test').info('hello');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('[test]');
    expect(output).toContain('hello');
  });

  it('creates child loggers with combined tags', () => {
    createLogger('parent').child('child').info('nested');
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('[parent:child]');
  });

  it('fully redacts credentials in messages, nested metadata, and arrays', () => {
    const logger = createLogger('redaction-test');
    logger.warn('request failed token=super-secret Bearer abc.def.ghi', {
      apiKey: 'sk-sensitive-value',
      nested: { password: 'hunter2' },
      entries: [{ authorization: 'Bearer nested-secret' }],
    });

    const entry = getBufferedLogEntries().at(-1);
    expect(entry?.msg).not.toContain('super-secret');
    expect(entry?.msg).not.toContain('abc.def.ghi');
    expect(JSON.stringify(entry)).not.toContain('sk-sensitive-value');
    expect(JSON.stringify(entry)).not.toContain('hunter2');
    expect(JSON.stringify(entry)).not.toContain('nested-secret');
  });

  it('preserves non-sensitive metadata', () => {
    createLogger('metadata-test').info('test', { name: 'visible', count: 42 });
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('visible');
    expect(output).toContain('42');
  });

  it('handles circular metadata without throwing', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => createLogger('circular-test').warn('circular', circular)).not.toThrow();
  });
});
