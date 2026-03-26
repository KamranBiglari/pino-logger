import { describe, it, expect } from 'vitest';
import { createTestLogger } from './helpers.js';

describe('log sampling', () => {
  it('emits every Nth log with sampled_count and sampled_total', () => {
    const { logger, getLines } = createTestLogger({ sample: { debug: 5 } });

    for (let i = 0; i < 10; i++) {
      logger.debug({ i }, 'tick');
    }

    const lines = getLines();
    // With rate=5: emits at call 5 and 10
    expect(lines).toHaveLength(2);

    expect(lines[0].sampled_count).toBe(5);
    expect(lines[0].sampled_total).toBe(5);

    expect(lines[1].sampled_count).toBe(5);
    expect(lines[1].sampled_total).toBe(10);
  });

  it('does not sample levels without a configured rate', () => {
    const { logger, getLines } = createTestLogger({ sample: { trace: 10 } });

    logger.info('always emitted 1');
    logger.info('always emitted 2');
    logger.info('always emitted 3');

    expect(getLines()).toHaveLength(3);
  });

  it('counts every call even when skipping', () => {
    const { logger, getLines } = createTestLogger({ sample: { trace: 3 } });

    for (let i = 0; i < 7; i++) {
      logger.trace(`call ${i}`);
    }

    const lines = getLines();
    // Emits at call 3 and 6
    expect(lines).toHaveLength(2);
    expect(lines[0].sampled_total).toBe(3);
    expect(lines[1].sampled_total).toBe(6);
  });

  it('flushSampleCounts emits remaining counts', () => {
    const { logger, getLines } = createTestLogger({ sample: { debug: 10 } });

    for (let i = 0; i < 7; i++) {
      logger.debug('tick');
    }

    expect(getLines()).toHaveLength(0); // not yet at rate=10

    logger.flushSampleCounts();

    const lines = getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].sampled_count).toBe(7);
    expect(lines[0].sampled_total).toBe(7);
    expect(lines[0].msg).toBe('[DEBUG] sampled log flush');
  });

  it('flushSampleCounts is idempotent when no remaining counts', () => {
    const { logger, getLines } = createTestLogger({ sample: { debug: 5 } });

    for (let i = 0; i < 5; i++) {
      logger.debug('tick');
    }

    expect(getLines()).toHaveLength(1); // emitted at 5

    logger.flushSampleCounts();
    expect(getLines()).toHaveLength(1); // no additional flush needed
  });

  it('child loggers share sample counters with parent', () => {
    const { logger, getLines } = createTestLogger({ sample: { debug: 4 } });
    const child = logger.child({ req_id: 'r1' });

    logger.debug('parent 1');     // counter: 1
    child.debug('child 1');       // counter: 2
    logger.debug('parent 2');     // counter: 3
    child.debug('child 2');       // counter: 4 → emits

    const lines = getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].sampled_count).toBe(4);
    expect(lines[0].sampled_total).toBe(4);
    expect(lines[0].req_id).toBe('r1'); // from child's bindings
  });

  it('samples multiple levels independently', () => {
    const { logger, getLines } = createTestLogger({ sample: { trace: 3, debug: 2 } });

    logger.trace('t1'); // trace counter: 1
    logger.debug('d1'); // debug counter: 1
    logger.trace('t2'); // trace counter: 2
    logger.debug('d2'); // debug counter: 2 → emits
    logger.trace('t3'); // trace counter: 3 → emits

    const lines = getLines();
    expect(lines).toHaveLength(2);

    const debugLine = lines.find((l) => l.level === 'debug');
    const traceLine = lines.find((l) => l.level === 'trace');

    expect(debugLine!.sampled_count).toBe(2);
    expect(debugLine!.sampled_total).toBe(2);
    expect(traceLine!.sampled_count).toBe(3);
    expect(traceLine!.sampled_total).toBe(3);
  });
});
