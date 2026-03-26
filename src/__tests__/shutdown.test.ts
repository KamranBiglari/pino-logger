import { describe, it, expect } from 'vitest';
import { createTestLogger } from './helpers.js';

describe('shutdown', () => {
  it('flushes sample counters on shutdown', async () => {
    const { logger, getLines } = createTestLogger({ sample: { trace: 10 } });

    for (let i = 0; i < 3; i++) {
      logger.trace('tick');
    }

    expect(getLines()).toHaveLength(0);

    await logger.shutdown();

    const lines = getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].sampled_count).toBe(3);
    expect(lines[0].sampled_total).toBe(3);
  });

  it('resolves cleanly when no sample config', async () => {
    const { logger } = createTestLogger();

    logger.info('test');

    await expect(logger.shutdown()).resolves.toBeUndefined();
  });

  it('resolves cleanly when no remaining sample counts', async () => {
    const { logger, getLines } = createTestLogger({ sample: { debug: 2 } });

    logger.debug('1');
    logger.debug('2'); // emits at 2

    expect(getLines()).toHaveLength(1);

    await logger.shutdown();

    // No additional flush line because counter was already at 0
    expect(getLines()).toHaveLength(1);
  });
});
