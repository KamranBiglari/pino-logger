import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestLogger } from './helpers.js';

describe('PinoLogger', () => {
  describe('log levels', () => {
    it('logs at all standard levels with level prefix in message', () => {
      const { logger, getLines } = createTestLogger();

      logger.trace('trace msg');
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      const lines = getLines();
      expect(lines).toHaveLength(5);
      expect(lines[0]).toMatchObject({ level: 'trace', msg: '[TRACE] trace msg' });
      expect(lines[1]).toMatchObject({ level: 'debug', msg: '[DEBUG] debug msg' });
      expect(lines[2]).toMatchObject({ level: 'info', msg: '[INFO] info msg' });
      expect(lines[3]).toMatchObject({ level: 'warn', msg: '[WARN] warn msg' });
      expect(lines[4]).toMatchObject({ level: 'error', msg: '[ERROR] error msg' });
    });

    it('logs with object merge fields', () => {
      const { logger, getLastLine } = createTestLogger();

      logger.info({ user_id: 'u_123', action: 'login' }, 'user logged in');

      const line = getLastLine();
      expect(line.msg).toBe('[INFO] user logged in');
      expect(line.user_id).toBe('u_123');
      expect(line.action).toBe('login');
    });

    it('includes base fields in every log line', () => {
      const { logger, getLastLine } = createTestLogger();

      logger.info('test');

      const line = getLastLine();
      expect(line.service).toBe('test-service');
      expect(line.env).toBe('test');
      expect(line.version).toBe('1.0.0');
    });

    it('includes ISO timestamp', () => {
      const { logger, getLastLine } = createTestLogger();

      logger.info('test');

      const line = getLastLine();
      expect(line.time).toBeDefined();
      expect(typeof line.time).toBe('string');
      // ISO 8601 format
      expect(new Date(line.time as string).toISOString()).toBeTruthy();
    });
  });

  describe('alert level', () => {
    it('logs at alert level with prefix', () => {
      const { logger, getLastLine } = createTestLogger();

      logger.alert({ breach_type: 'unauthorized' }, 'security breach');

      const line = getLastLine();
      expect(line.level).toBe('alert');
      expect(line.msg).toBe('[ALERT] security breach');
      expect(line.breach_type).toBe('unauthorized');
    });

    it('logs alert with string-only message', () => {
      const { logger, getLastLine } = createTestLogger();

      logger.alert('critical SLA violation');

      const line = getLastLine();
      expect(line.level).toBe('alert');
      expect(line.msg).toBe('[ALERT] critical SLA violation');
    });
  });

  describe('fatal', () => {
    it('logs at fatal level then calls process.exit', () => {
      const { logger, getLastLine } = createTestLogger();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      logger.fatal({ err: new Error('boom') }, 'db connection failed');

      const line = getLastLine();
      expect(line.level).toBe('fatal');
      expect(line.msg).toBe('[FATAL] db connection failed');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    it('fatal with string-only message', () => {
      const { logger, getLastLine } = createTestLogger();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      logger.fatal('cannot continue');

      expect(getLastLine().msg).toBe('[FATAL] cannot continue');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });
  });

  describe('error serialization', () => {
    it('serializes Error objects via err field', () => {
      const { logger, getLastLine } = createTestLogger();

      const error = new Error('something broke');
      logger.error({ err: error }, 'request failed');

      const line = getLastLine();
      expect(line.err).toBeDefined();
      const err = line.err as Record<string, unknown>;
      expect(err.message).toBe('something broke');
      expect(err.stack).toBeDefined();
      expect(err.type).toBe('Error');
    });
  });

  describe('child logger', () => {
    it('returns a PinoLogger instance with bound fields', () => {
      const { logger, getLines } = createTestLogger();

      const child = logger.child({ req_id: 'abc-123', user_id: 'u_456' });
      child.info('handling request');
      child.warn({ latency_ms: 500 }, 'slow response');

      const lines = getLines();
      expect(lines[0]).toMatchObject({
        req_id: 'abc-123',
        user_id: 'u_456',
        msg: '[INFO] handling request',
      });
      expect(lines[1]).toMatchObject({
        req_id: 'abc-123',
        user_id: 'u_456',
        latency_ms: 500,
        msg: '[WARN] slow response',
      });
    });

    it('child of child merges all bindings', () => {
      const { logger, getLastLine } = createTestLogger();

      const child1 = logger.child({ req_id: 'r1' });
      const child2 = child1.child({ span: 'db' });
      child2.info('query executed');

      const line = getLastLine();
      expect(line.req_id).toBe('r1');
      expect(line.span).toBe('db');
    });
  });

  describe('isLevelEnabled', () => {
    it('returns true for enabled levels', () => {
      const { logger } = createTestLogger({ level: 'warn' });

      expect(logger.isLevelEnabled('warn')).toBe(true);
      expect(logger.isLevelEnabled('error')).toBe(true);
      expect(logger.isLevelEnabled('fatal')).toBe(true);
    });

    it('returns false for disabled levels', () => {
      const { logger } = createTestLogger({ level: 'warn' });

      expect(logger.isLevelEnabled('trace')).toBe(false);
      expect(logger.isLevelEnabled('debug')).toBe(false);
      expect(logger.isLevelEnabled('info')).toBe(false);
    });
  });

  describe('instance', () => {
    it('exposes the raw Pino logger', () => {
      const { logger } = createTestLogger();

      expect(logger.instance).toBeDefined();
      expect(typeof logger.instance.info).toBe('function');
    });
  });

  describe('redaction', () => {
    it('redacts sensitive fields', () => {
      const { logger, getLastLine } = createTestLogger();

      logger.info({ password: 'secret123' }, 'user update');
      expect(getLastLine().password).toBe('[REDACTED]');
    });

    it('redacts nested authorization header', () => {
      const { logger, getLastLine } = createTestLogger();

      logger.info({ req: { headers: { authorization: 'Bearer tok' } } }, 'request');
      const line = getLastLine();
      const req = line.req as Record<string, Record<string, string>>;
      expect(req.headers.authorization).toBe('[REDACTED]');
    });

    it('redacts api_key in body', () => {
      const { logger, getLastLine } = createTestLogger();

      logger.info({ body: { api_key: 'ak_123', name: 'test' } }, 'payload');
      const line = getLastLine();
      const body = line.body as Record<string, string>;
      expect(body.api_key).toBe('[REDACTED]');
      expect(body.name).toBe('test');
    });
  });
});
