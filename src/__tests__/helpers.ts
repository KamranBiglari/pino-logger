import pino from 'pino';
import { Writable } from 'node:stream';
import { PinoLogger } from '../logger.js';
import { LogLevel } from '../types.js';

/**
 * Creates a PinoLogger that writes to an in-memory buffer.
 * Returns the logger and a function to retrieve parsed log lines.
 */
export function createTestLogger(options?: {
  level?: string;
  sample?: Partial<Record<LogLevel, number>>;
}) {
  const lines: string[] = [];

  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString().trim());
      callback();
    },
  });

  const pinoInstance = pino(
    {
      level: options?.level ?? 'trace',
      customLevels: { alert: 70 },
      timestamp: pino.stdTimeFunctions.isoTime,
      base: { service: 'test-service', env: 'test', version: '1.0.0' },
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'body.password',
          'body.api_key',
          'body.token',
          'body.secret',
          'headers.authorization',
          'headers.cookie',
          'password',
          'apiKey',
          'api_key',
          'secret',
        ],
        censor: '[REDACTED]',
      },
    },
    stream,
  ) as pino.Logger<'alert'>;

  const logger = new PinoLogger(pinoInstance, options?.sample);

  function getLines(): Record<string, unknown>[] {
    return lines.map((l) => JSON.parse(l));
  }

  function getLastLine(): Record<string, unknown> {
    return JSON.parse(lines[lines.length - 1]);
  }

  function clear(): void {
    lines.length = 0;
  }

  return { logger, getLines, getLastLine, clear };
}
