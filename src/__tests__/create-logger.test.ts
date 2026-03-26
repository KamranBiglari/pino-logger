import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../logger.js';
import { PinoLogger } from '../logger.js';

describe('createLogger', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_VERBOSE;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns a PinoLogger instance', () => {
    const logger = createLogger({ service: 'test-svc' });
    expect(logger).toBeInstanceOf(PinoLogger);
  });

  it('exposes a raw Pino instance via .instance', () => {
    const logger = createLogger({ service: 'test-svc' });
    expect(logger.instance).toBeDefined();
    expect(typeof logger.instance.info).toBe('function');
  });

  it('registers custom alert level', () => {
    const logger = createLogger({ service: 'test-svc' });
    expect(typeof logger.instance.alert).toBe('function');
  });

  it('defaults to info level', () => {
    const logger = createLogger({ service: 'test-svc' });
    expect(logger.instance.level).toBe('info');
  });

  it('uses LOG_LEVEL env var', () => {
    process.env.LOG_LEVEL = 'debug';
    const logger = createLogger({ service: 'test-svc' });
    expect(logger.instance.level).toBe('debug');
  });

  it('uses LOG_VERBOSE=true for trace level', () => {
    process.env.LOG_VERBOSE = 'true';
    const logger = createLogger({ service: 'test-svc' });
    expect(logger.instance.level).toBe('trace');
  });

  it('accepts sample config', () => {
    const logger = createLogger({
      service: 'test-svc',
      sample: { trace: 100 },
    });
    expect(logger).toBeInstanceOf(PinoLogger);
  });
});
