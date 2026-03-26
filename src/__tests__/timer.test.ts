import { describe, it, expect } from 'vitest';
import { createTestLogger } from './helpers.js';

describe('startTimer', () => {
  it('elapsed() returns ms since start', async () => {
    const { logger } = createTestLogger();

    const timer = logger.startTimer();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const elapsed = timer.elapsed();

    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(200);
  });

  it('done(msg) logs at info level with duration_ms', async () => {
    const { logger, getLastLine } = createTestLogger();

    const timer = logger.startTimer();
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.done('request processed');

    const line = getLastLine();
    expect(line.level).toBe('info');
    expect(line.msg).toBe('[INFO] request processed');
    expect(line.duration_ms).toBeDefined();
    expect(typeof line.duration_ms).toBe('number');
    expect(line.duration_ms as number).toBeGreaterThanOrEqual(10);
  });

  it('done(obj, msg) merges fields with duration_ms', async () => {
    const { logger, getLastLine } = createTestLogger();

    const timer = logger.startTimer();
    await new Promise((resolve) => setTimeout(resolve, 10));
    timer.done({ req_id: 'r1', status: 200 }, 'response sent');

    const line = getLastLine();
    expect(line.msg).toBe('[INFO] response sent');
    expect(line.req_id).toBe('r1');
    expect(line.status).toBe(200);
    expect(line.duration_ms).toBeDefined();
  });
});
