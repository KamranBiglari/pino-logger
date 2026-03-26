import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveLogLevel } from '../resolve-level.js';

describe('resolveLogLevel', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_VERBOSE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to info when no env vars set', () => {
    expect(resolveLogLevel()).toBe('info');
  });

  it('returns trace when LOG_VERBOSE=true', () => {
    process.env.LOG_VERBOSE = 'true';
    expect(resolveLogLevel()).toBe('trace');
  });

  it('LOG_VERBOSE=true takes priority over LOG_LEVEL', () => {
    process.env.LOG_VERBOSE = 'true';
    process.env.LOG_LEVEL = 'error';
    expect(resolveLogLevel()).toBe('trace');
  });

  it('returns the specified LOG_LEVEL', () => {
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      process.env.LOG_LEVEL = level;
      expect(resolveLogLevel()).toBe(level);
    }
  });

  it('handles uppercase LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'DEBUG';
    expect(resolveLogLevel()).toBe('debug');
  });

  it('handles LOG_LEVEL with whitespace', () => {
    process.env.LOG_LEVEL = '  warn  ';
    expect(resolveLogLevel()).toBe('warn');
  });

  it('falls back to info for invalid LOG_LEVEL and warns to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.env.LOG_LEVEL = 'invalid';
    expect(resolveLogLevel()).toBe('info');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid LOG_LEVEL="invalid"'),
    );
    stderrSpy.mockRestore();
  });

  it('falls back to info for empty LOG_LEVEL', () => {
    process.env.LOG_LEVEL = '';
    expect(resolveLogLevel()).toBe('info');
  });
});
