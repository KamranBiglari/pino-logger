import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import { createLogger } from '../logger.js';
import { PinoLogger } from '../logger.js';
import { CreateLoggerOptions } from '../types.js';

/** Helper: create a logger that writes to an in-memory buffer */
function createBufferedLogger(options: CreateLoggerOptions) {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, cb) {
      lines.push(chunk.toString().trim());
      cb();
    },
  });

  // createLogger writes to stdout, so we need to use it and pipe.
  // Instead, use the factory and verify base fields via the instance.
  const logger = createLogger(options);
  return { logger, lines };
}

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

describe('createLogger exclude', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_VERBOSE;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('includes all base fields by default', () => {
    const logger = createLogger({ service: 'test-svc', version: '2.0.0', env: 'staging' });
    // Pino stores base fields in the bindings — check via a log write
    const bindings = logger.instance.bindings();
    expect(bindings.service).toBe('test-svc');
    expect(bindings.env).toBe('staging');
    expect(bindings.version).toBe('2.0.0');
  });

  it('excludes env when specified', () => {
    const logger = createLogger({ service: 'test-svc', exclude: ['env'] });
    const bindings = logger.instance.bindings();
    expect(bindings.service).toBe('test-svc');
    expect(bindings).not.toHaveProperty('env');
    expect(bindings).toHaveProperty('version');
  });

  it('excludes version when specified', () => {
    const logger = createLogger({ service: 'test-svc', exclude: ['version'] });
    const bindings = logger.instance.bindings();
    expect(bindings.service).toBe('test-svc');
    expect(bindings).not.toHaveProperty('version');
    expect(bindings).toHaveProperty('env');
  });

  it('excludes multiple fields', () => {
    const logger = createLogger({ service: 'test-svc', exclude: ['env', 'version'] });
    const bindings = logger.instance.bindings();
    expect(bindings.service).toBe('test-svc');
    expect(bindings).not.toHaveProperty('env');
    expect(bindings).not.toHaveProperty('version');
  });

  it('can exclude service too', () => {
    const logger = createLogger({ service: 'test-svc', exclude: ['service'] });
    const bindings = logger.instance.bindings();
    expect(bindings).not.toHaveProperty('service');
  });

  it('empty exclude array keeps all fields', () => {
    const logger = createLogger({ service: 'test-svc', exclude: [] });
    const bindings = logger.instance.bindings();
    expect(bindings.service).toBe('test-svc');
    expect(bindings).toHaveProperty('env');
    expect(bindings).toHaveProperty('version');
  });
});
