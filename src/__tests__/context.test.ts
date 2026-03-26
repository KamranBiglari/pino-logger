import { describe, it, expect } from 'vitest';
import { withContext, getContext } from '../context.js';
import { createTestLogger } from './helpers.js';

describe('AsyncLocalStorage context', () => {
  it('returns undefined when no context is active', () => {
    expect(getContext()).toBeUndefined();
  });

  it('provides context within withContext scope', () => {
    withContext({ req_id: 'r1' }, () => {
      expect(getContext()).toEqual({ req_id: 'r1' });
    });
    expect(getContext()).toBeUndefined();
  });

  it('nests contexts — inner overrides outer', () => {
    withContext({ req_id: 'r1', user_id: 'u1' }, () => {
      withContext({ user_id: 'u2', span: 'inner' }, () => {
        expect(getContext()).toEqual({ req_id: 'r1', user_id: 'u2', span: 'inner' });
      });
      expect(getContext()).toEqual({ req_id: 'r1', user_id: 'u1' });
    });
  });

  it('auto-merges context into log calls', () => {
    const { logger, getLastLine } = createTestLogger();

    withContext({ req_id: 'ctx-123', user_id: 'u_789' }, () => {
      logger.info('processing');
    });

    const line = getLastLine();
    expect(line.req_id).toBe('ctx-123');
    expect(line.user_id).toBe('u_789');
    expect(line.msg).toBe('[INFO] processing');
  });

  it('merges context with explicit fields — explicit fields win', () => {
    const { logger, getLastLine } = createTestLogger();

    withContext({ req_id: 'ctx-1', source: 'context' }, () => {
      logger.info({ source: 'explicit', extra: true }, 'test');
    });

    const line = getLastLine();
    expect(line.req_id).toBe('ctx-1');
    expect(line.source).toBe('explicit'); // explicit overrides context
    expect(line.extra).toBe(true);
  });

  it('works with child loggers', () => {
    const { logger, getLastLine } = createTestLogger();

    const child = logger.child({ service_span: 'db' });

    withContext({ req_id: 'r99' }, () => {
      child.info('query executed');
    });

    const line = getLastLine();
    expect(line.req_id).toBe('r99');
    expect(line.service_span).toBe('db');
  });

  it('handles async operations', async () => {
    const { logger, getLines } = createTestLogger();

    await withContext({ req_id: 'async-1' }, async () => {
      logger.info('before await');
      await new Promise((resolve) => setTimeout(resolve, 10));
      logger.info('after await');
    });

    const lines = getLines();
    expect(lines).toHaveLength(2);
    expect(lines[0].req_id).toBe('async-1');
    expect(lines[1].req_id).toBe('async-1');
  });
});
