import { LOG_LEVELS, LogLevel } from './types.js';

/**
 * Resolves the active log level from environment variables.
 *
 * Priority:
 *   1. LOG_VERBOSE=true  → forces 'trace' (verbose mode)
 *   2. LOG_LEVEL         → uses the specified level
 *   3. default           → 'info'
 *
 * Invalid LOG_LEVEL values warn to stderr and fall back to 'info'.
 * This prevents silent log blackouts from typos in config.
 */
export function resolveLogLevel(): LogLevel {
  if (process.env.LOG_VERBOSE === 'true') {
    return 'trace';
  }

  const raw = process.env.LOG_LEVEL?.toLowerCase().trim();

  if (!raw) return 'info';

  if ((LOG_LEVELS as readonly string[]).includes(raw)) {
    return raw as LogLevel;
  }

  process.stderr.write(
    `[pino-logger] Invalid LOG_LEVEL="${raw}". ` +
    `Valid values: ${LOG_LEVELS.join(', ')}. Falling back to "info".\n`
  );

  return 'info';
}
