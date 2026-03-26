import pino, { LoggerOptions, LogFn } from 'pino';
import { CreateLoggerOptions, LOG_LEVELS, LogLevel, MetricFields, Timer } from './types.js';
import { resolveLogLevel } from './resolve-level.js';
import { getContext } from './context.js';

// ─── Types ────────────────────────────────────────────────────────────────────

// Pino logger with custom 'alert' level added
type PinoInstance = pino.Logger<'alert'>;

// A function that can log — covers all Pino level methods including custom ones
type PinoLogFn = LogFn;

// ─── Pre-allocated constants ──────────────────────────────────────────────────

// Pre-allocate level label objects to avoid creating a new object on every log call.
// This eliminates per-call GC pressure from the formatters.level function.
const LEVEL_OBJECTS: Record<string, { level: string }> = Object.fromEntries(
  LOG_LEVELS.map((l) => [l, { level: l }]),
);

// Pre-allocate level prefix strings: "[INFO] ", "[ERROR] ", etc.
const LEVEL_PREFIXES: Record<string, string> = Object.fromEntries(
  LOG_LEVELS.map((l) => [l, `[${l.toUpperCase()}] `]),
);

// Pino's built-in numeric levels max at fatal=60. Alert is above fatal.
const ALERT_LEVEL_NUM = 70;
const ALERT_LEVEL_NAME = 'alert';

// ─── Sample state ─────────────────────────────────────────────────────────────

interface SampleState {
  since_last_emit: number;
  total: number;
}

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
 * - Level prefix in messages: "[INFO] msg" for log parser alerting
 * - Full Error serialisation (message, stack, code) via `err` field
 * - alert() — highest severity level (above fatal), does NOT kill process
 * - fatal() kills the process with exit code 1
 * - child() returns PinoLogger (not raw Pino instance)
 * - AsyncLocalStorage context propagation (withContext)
 * - Request duration tracking (startTimer)
 * - Structured metric logging (metric)
 * - Log sampling with counting (no data loss)
 * - Graceful async shutdown
 * - pino-pretty in development (NODE_ENV=development)
 * - Sensitive field redaction
 */
export class PinoLogger {
  private readonly _pino: PinoInstance;
  private readonly _sample: Partial<Record<LogLevel, number>> | undefined;
  // Shared across parent + child loggers so sampling counters are global
  private readonly _sampleState: Map<string, SampleState>;

  constructor(
    pinoInstance: PinoInstance,
    sample?: Partial<Record<LogLevel, number>>,
    sampleState?: Map<string, SampleState>,
  ) {
    this._pino = pinoInstance;
    this._sample = sample;
    this._sampleState = sampleState ?? new Map();
  }

  // ── core log dispatch ────────────────────────────────────────────────────

  /**
   * Internal log dispatch. Handles sampling, async context merge,
   * and level prefix injection. Optimised for the common fast path
   * (no context, no sampling) to avoid object allocation.
   */
  private _log(level: LogLevel, objOrMsg: Record<string, unknown> | string, msg?: string): void {
    // ── Sampling gate ──
    const rate = this._sample?.[level];
    let sampleFields: { sampled_count: number; sampled_total: number } | null = null;
    if (rate && rate > 1) {
      let state = this._sampleState.get(level);
      if (!state) {
        state = { since_last_emit: 0, total: 0 };
        this._sampleState.set(level, state);
      }
      state.total++;
      state.since_last_emit++;
      if (state.since_last_emit < rate) return; // skip but counted
      sampleFields = { sampled_count: state.since_last_emit, sampled_total: state.total };
      state.since_last_emit = 0;
    }

    // ── Async context ──
    const ctx = getContext();
    const hasExtra = ctx !== undefined || sampleFields !== null;

    // ── Resolve the Pino log function for this level ──
    const logFn: PinoLogFn = (this._pino[level] as PinoLogFn).bind(this._pino);

    // ── Emit with level prefix in message ──
    const prefix = LEVEL_PREFIXES[level] ?? `[${level.toUpperCase()}] `;

    if (typeof objOrMsg === 'string') {
      const message = prefix + objOrMsg;
      if (hasExtra) {
        const merged = sampleFields
          ? ctx ? { ...ctx, ...sampleFields } : sampleFields
          : ctx!;
        logFn(merged, message);
      } else {
        logFn(message);
      }
    } else {
      const message = prefix + msg!;
      if (hasExtra) {
        const merged = { ...ctx, ...sampleFields, ...objOrMsg };
        logFn(merged, message);
      } else {
        logFn(objOrMsg, message);
      }
    }
  }

  // ── trace ────────────────────────────────────────────────────────────────

  trace(obj: Record<string, unknown>, msg: string): void;
  trace(msg: string): void;
  trace(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log('trace', objOrMsg, msg);
  }

  // ── debug ────────────────────────────────────────────────────────────────

  debug(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
  debug(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log('debug', objOrMsg, msg);
  }

  // ── info ─────────────────────────────────────────────────────────────────

  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  info(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log('info', objOrMsg, msg);
  }

  // ── warn ─────────────────────────────────────────────────────────────────

  warn(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  warn(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log('warn', objOrMsg, msg);
  }

  // ── error ────────────────────────────────────────────────────────────────

  error(obj: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  error(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log('error', objOrMsg, msg);
  }

  // ── fatal ────────────────────────────────────────────────────────────────

  /**
   * Logs at FATAL level then kills the process with exit code 1.
   * Flushes sample counters and log buffer before exiting.
   */
  fatal(obj: Record<string, unknown>, msg: string): never;
  fatal(msg: string): never;
  fatal(objOrMsg: Record<string, unknown> | string, msg?: string): never {
    this._log('fatal', objOrMsg, msg);
    this.flushSampleCounts();
    try { this._pino.flush?.(); } catch { /* exiting anyway */ }
    process.exit(1);
  }

  // ── alert ────────────────────────────────────────────────────────────────

  /**
   * Logs at ALERT level — highest severity, above fatal.
   * Use for conditions requiring immediate operator attention:
   * - Security breaches detected
   * - Data corruption detected
   * - Critical SLA violations
   *
   * Unlike fatal(), alert() does NOT kill the process.
   * The service continues running so it can handle other requests.
   *
   * @example
   * logger.alert({ breach_type: 'unauthorized_access', ip }, 'security breach detected');
   */
  alert(obj: Record<string, unknown>, msg: string): void;
  alert(msg: string): void;
  alert(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    this._log('alert', objOrMsg, msg);
  }

  // ── child ────────────────────────────────────────────────────────────────

  /**
   * Creates a child logger with additional bound fields.
   * Shares sample counters with the parent for consistent global sampling.
   */
  child(bindings: Record<string, unknown>): PinoLogger {
    return new PinoLogger(this._pino.child(bindings), this._sample, this._sampleState);
  }

  // ── startTimer ───────────────────────────────────────────────────────────

  /**
   * Starts a high-resolution timer. Returns a Timer object with:
   * - elapsed(): returns ms elapsed so far
   * - done(msg) / done(obj, msg): logs at info level with duration_ms
   *
   * @example
   * const timer = logger.startTimer();
   * await processRequest();
   * timer.done({ req_id }, 'request processed'); // includes duration_ms
   */
  startTimer(): Timer {
    const start = process.hrtime.bigint();
    const self = this;
    return {
      elapsed(): number {
        return Number(process.hrtime.bigint() - start) / 1_000_000;
      },
      done(objOrMsg: Record<string, unknown> | string, msg?: string): void {
        const duration_ms = Math.round(Number(process.hrtime.bigint() - start) * 100 / 1_000_000) / 100;
        if (typeof objOrMsg === 'string') {
          self._log('info', { duration_ms }, objOrMsg);
        } else {
          self._log('info', { ...objOrMsg, duration_ms }, msg!);
        }
      },
    } as Timer;
  }

  // ── metric ───────────────────────────────────────────────────────────────

  /**
   * Emits a structured metric log at info level.
   * All metric logs include `metric_type: "metric"` for easy filtering
   * in your log parser / aggregator.
   *
   * @example
   * logger.metric({ metric_name: 'http_request_duration', metric_value: 42, metric_unit: 'ms' });
   * logger.metric({ metric_name: 'queue_depth', metric_value: 150, metric_unit: 'count', queue: 'orders' });
   */
  metric(fields: MetricFields): void {
    const { metric_name, ...rest } = fields;
    this._log('info', { metric_type: 'metric', metric_name, ...rest }, `metric: ${metric_name}`);
  }

  // ── sampling ─────────────────────────────────────────────────────────────

  /**
   * Flushes any remaining sample counters as summary log lines.
   * Called automatically by fatal() and shutdown().
   * Call manually if you need to ensure all counts are emitted.
   */
  flushSampleCounts(): void {
    if (!this._sample) return;
    for (const [level, state] of this._sampleState.entries()) {
      if (state.since_last_emit > 0) {
        const prefix = LEVEL_PREFIXES[level] ?? `[${level.toUpperCase()}] `;
        const logFn: PinoLogFn = (this._pino[level as keyof PinoInstance] as PinoLogFn).bind(this._pino);
        logFn(
          { sampled_count: state.since_last_emit, sampled_total: state.total },
          prefix + 'sampled log flush',
        );
        state.since_last_emit = 0;
      }
    }
  }

  // ── shutdown ─────────────────────────────────────────────────────────────

  /**
   * Gracefully shuts down the logger:
   * 1. Flushes any remaining sample counters
   * 2. Flushes the Pino write buffer (important for async transports)
   *
   * Call this on SIGTERM / SIGINT before process exit.
   *
   * @example
   * process.on('SIGTERM', async () => {
   *   logger.info('shutting down');
   *   await logger.shutdown();
   *   process.exit(0);
   * });
   */
  async shutdown(): Promise<void> {
    this.flushSampleCounts();
    return new Promise<void>((resolve, reject) => {
      if (typeof this._pino.flush === 'function') {
        this._pino.flush((err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // ── isLevelEnabled ───────────────────────────────────────────────────────

  isLevelEnabled(level: LogLevel): boolean {
    return this._pino.isLevelEnabled(level);
  }

  // ── instance ─────────────────────────────────────────────────────────────

  /**
   * Exposes the raw Pino Logger instance.
   * Use for integrations that require it directly (e.g. pino-http).
   */
  get instance(): PinoInstance {
    return this._pino;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a configured PinoLogger instance.
 *
 * Reads from environment:
 *   LOG_LEVEL   — trace|debug|info|warn|error|fatal|alert  (default: info)
 *   LOG_VERBOSE — true|false  forces trace level            (default: false)
 *   NODE_ENV    — development enables pino-pretty           (default: production)
 *
 * @example
 * const logger = createLogger({
 *   service: 'windy-gateway',
 *   version: process.env.npm_package_version,
 *   env: process.env.NODE_ENV,
 *   sample: { trace: 100, debug: 10 }, // emit every 100th trace, every 10th debug
 * });
 */
export function createLogger(fields: CreateLoggerOptions): PinoLogger {
  const pinoInstance = pino({
    level: resolveLogLevel(),

    // Register custom "alert" level above fatal (70 > 60)
    customLevels: { [ALERT_LEVEL_NAME]: ALERT_LEVEL_NUM },

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

  return new PinoLogger(pinoInstance, fields.sample);
}
