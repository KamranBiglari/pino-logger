import { describe, it, expect } from 'vitest';
import { createTestLogger } from './helpers.js';

describe('metric', () => {
  it('emits a structured metric log at info level', () => {
    const { logger, getLastLine } = createTestLogger();

    logger.metric({
      metric_name: 'http_request_duration',
      metric_value: 42,
      metric_unit: 'ms',
    });

    const line = getLastLine();
    expect(line.level).toBe('info');
    expect(line.metric_type).toBe('metric');
    expect(line.metric_name).toBe('http_request_duration');
    expect(line.metric_value).toBe(42);
    expect(line.metric_unit).toBe('ms');
    expect(line.msg).toBe('[INFO] metric: http_request_duration');
  });

  it('includes extra custom fields', () => {
    const { logger, getLastLine } = createTestLogger();

    logger.metric({
      metric_name: 'queue_depth',
      metric_value: 150,
      metric_unit: 'count',
      queue: 'orders',
      region: 'us-east-1',
    });

    const line = getLastLine();
    expect(line.queue).toBe('orders');
    expect(line.region).toBe('us-east-1');
  });

  it('works without optional metric_unit', () => {
    const { logger, getLastLine } = createTestLogger();

    logger.metric({ metric_name: 'cache_hit', metric_value: 1 });

    const line = getLastLine();
    expect(line.metric_name).toBe('cache_hit');
    expect(line.metric_value).toBe(1);
    expect(line.metric_unit).toBeUndefined();
  });
});
