import pino, { Logger, LoggerOptions } from 'pino';
import { BaseLogFields, LOG_LEVELS, LogLevel } from './types.js';
import { resolveLogLevel } from './resolve-level.js';

// Pre-allocate level label objects to avoid creating a new object on every log call.
// This eliminates per-call GC pressure from the formatters.level function.
const LEVEL_OBJECTS: Record<string, { level: string }> = Object.fromEntries(
  LOG_LEVELS.map((l) => [l, { level: l }]),
);

// ─── Transport ────────────────────────────────────────────────────────────────

function buildTransport(): LoggerOptions['transport'] {
  if (process.env.NODE_ENV !== 'development') return undefined;

  return {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      messageFormat: '{msg}',
    },
  };
}

// ─── PinoLogger ───────────────────────────────────────────────────────────────

/**
 * Opinionated Pino wrapper with:
 * - LOG_LEVEL / LOG_VERBOSE env var control
 * - Full Error serialisation (message, stack, code) via `err` field
 * - fatal() kills the process with exit code 1
 * - child() returns PinoLogger (not raw Pino instance)
 * - pino-pretty in development (NODE_ENV=development)
 * - Sensitive field redaction
 */
export class PinoLogger {
  private readonly _pino: Logger;

  constructor(pinoInstance: Logger) {
    this._pino = pinoInstance;
  }

  // ── trace ────────────────────────────────────────────────────────────────

  /**
   * Logs at TRACE level. Most verbose — for internal state and hot-path detail.
   * Only emitted when LOG_LEVEL=trace or LOG_VERBOSE=true.
   *
   * @example
   * logger.trace({ tick: i }, 'loop iteration');
   */
  trace(obj: Record<string, unknown>, msg: string): void;
  trace(msg: string): void;
  trace(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this._pino.trace(objOrMsg);
    } else {
      this._pino.trace(objOrMsg, msg!);
    }
  }

  // ── debug ────────────────────────────────────────────────────────────────

  /**
   * Logs at DEBUG level. For development-time detail: queries, payloads, decisions.
   * Only emitted when LOG_LEVEL=debug or lower.
   *
   * @example
   * logger.debug({ query, params }, 'db query built');
   */
  debug(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
  debug(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this._pino.debug(objOrMsg);
    } else {
      this._pino.debug(objOrMsg, msg!);
    }
  }

  // ── info ─────────────────────────────────────────────────────────────────

  /**
   * Logs at INFO level. For normal operations: startup, user actions, milestones.
   * Default level — always emitted in production unless LOG_LEVEL is set higher.
   *
   * @example
   * logger.info({ userId }, 'user logged in');
   */
  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  info(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this._pino.info(objOrMsg);
    } else {
      this._pino.info(objOrMsg, msg!);
    }
  }

  // ── warn ─────────────────────────────────────────────────────────────────

  /**
   * Logs at WARN level. For degraded-but-recoverable states: retries, slow upstreams.
   *
   * @example
   * logger.warn({ retries: 3, latency_ms: 2000 }, 'upstream slow, retrying');
   */
  warn(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  warn(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this._pino.warn(objOrMsg);
    } else {
      this._pino.warn(objOrMsg, msg!);
    }
  }

  // ── error ────────────────────────────────────────────────────────────────

  /**
   * Logs at ERROR level with full Error serialisation.
   * Always pass the raw Error object as the `err` field.
   * Pino serialises err.message, err.stack, and err.code automatically.
   *
   * @example
   * try {
   *   await fetchRates();
   * } catch (err) {
   *   logger.error({ err, endpoint: '/v1/rates' }, 'rate fetch failed');
   * }
   */
  error(obj: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  error(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this._pino.error(objOrMsg);
    } else {
      this._pino.error(objOrMsg, msg!);
    }
  }

  // ── fatal ────────────────────────────────────────────────────────────────

  /**
   * Logs at FATAL level then kills the process with exit code 1.
   *
   * Use for unrecoverable failures where the app cannot safely continue:
   * - Database connection failure at startup
   * - Missing required environment variables
   * - Corrupt critical state
   *
   * The log is flushed to stdout before exiting.
   *
   * @example
   * try {
   *   await db.connect();
   * } catch (err) {
   *   logger.fatal({ err }, 'database connection failed — cannot start');
   *   // process exits here, nothing below runs
   * }
   */
  fatal(obj: Record<string, unknown>, msg: string): never;
  fatal(msg: string): never;
  fatal(objOrMsg: Record<string, unknown> | string, msg?: string): never {
    if (typeof objOrMsg === 'string') {
      this._pino.fatal(objOrMsg);
    } else {
      this._pino.fatal(objOrMsg, msg!);
    }

    // Flush buffer before exit — critical when using async transports
    try {
      this._pino.flush?.();
    } catch {
      // ignore flush errors — we're exiting anyway
    }

    process.exit(1);
  }

  // ── child ────────────────────────────────────────────────────────────────

  /**
   * Creates a child logger with additional bound fields.
   * Every log from the child automatically includes these fields.
   * Returns a PinoLogger, not a raw Pino instance.
   *
   * Use at the start of a request to bind req_id and user_id once.
   *
   * @example
   * const reqLogger = logger.child({ req_id: req.id, user_id: req.userId });
   * reqLogger.info({ path: req.path }, 'request received');
   * reqLogger.error({ err }, 'handler failed'); // includes req_id and user_id
   */
  child(bindings: Record<string, unknown>): PinoLogger {
    return new PinoLogger(this._pino.child(bindings));
  }

  // ── isLevelEnabled ───────────────────────────────────────────────────────

  /**
   * Returns true if the given level would be written to stdout.
   * Use to guard expensive object construction.
   *
   * @example
   * if (logger.isLevelEnabled('debug')) {
   *   logger.debug({ payload: buildExpensivePayload() }, 'full payload');
   * }
   */
  isLevelEnabled(level: LogLevel): boolean {
    return this._pino.isLevelEnabled(level);
  }

  // ── instance ─────────────────────────────────────────────────────────────

  /**
   * Exposes the raw Pino Logger instance.
   * Use for integrations that require it directly (e.g. pino-http).
   *
   * @example
   * app.use(pinoHttp({ logger: logger.instance }));
   */
  get instance(): Logger {
    return this._pino;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a configured PinoLogger instance.
 *
 * Reads from environment:
 *   LOG_LEVEL   — trace|debug|info|warn|error|fatal  (default: info)
 *   LOG_VERBOSE — true|false  forces trace level     (default: false)
 *   NODE_ENV    — development enables pino-pretty    (default: production)
 *
 * All logs are written as JSON to stdout.
 * In NODE_ENV=development, output is pretty-printed via pino-pretty.
 *
 * @example
 * const logger = createLogger({
 *   service: 'windy-gateway',
 *   version: process.env.npm_package_version,
 *   env: process.env.NODE_ENV,
 * });
 */
export function createLogger(fields: BaseLogFields): PinoLogger {
  const pinoInstance = pino({
    level: resolveLogLevel(),

    // Merged into every log line
    base: {
      service: fields.service,
      env: fields.env ?? process.env.NODE_ENV ?? 'production',
      version: fields.version ?? process.env.npm_package_version ?? 'unknown',
    },

    // ISO timestamp on every line
    timestamp: pino.stdTimeFunctions.isoTime,

    // Use string level labels (info/warn/error) not numeric codes (30/40/50)
    // Uses pre-allocated objects to avoid per-call allocation + GC pressure.
    formatters: {
      level(label) {
        return LEVEL_OBJECTS[label] ?? { level: label };
      },
    },

    // Serialise Error objects: message, stack, code, type
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },

    // Redact sensitive fields before they reach stdout
    // NOTE: Avoid wildcard paths (*.field) — they force Pino to walk
    // the entire object tree on every log call, which is expensive.
    // Use explicit paths for predictable O(1) redaction.
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

    transport: buildTransport(),
  });

  return new PinoLogger(pinoInstance);
}
