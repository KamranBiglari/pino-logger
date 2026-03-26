export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'alert'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Fields merged into every log line emitted by this service.
 * All fields follow snake_case naming convention.
 */
export interface BaseLogFields {
  /** Service identifier in kebab-case. e.g. 'windy-gateway', 'fx-api' */
  service: string;
  /** App version — recommended: process.env.npm_package_version */
  version?: string;
  /** Runtime environment — recommended: process.env.NODE_ENV */
  env?: string;
}

/**
 * Options for createLogger — extends BaseLogFields with sampling config.
 */
export interface CreateLoggerOptions extends BaseLogFields {
  /**
   * Sample rates per level. e.g. { trace: 100 } emits every 100th trace log.
   * Skipped logs are counted — the emitted log includes `sampled_count` and
   * `sampled_total` fields so no data is lost.
   * Levels not listed here (and warn/error/fatal/alert) always emit every log.
   */
  sample?: Partial<Record<LogLevel, number>>;
}

/**
 * Fields to include when logging an HTTP request context.
 * Bind these via logger.child() at request start.
 */
export interface RequestContext {
  req_id: string;
  method?: string;
  path?: string;
  user_id?: string;
}

/**
 * Fields to include when logging an error.
 * Always pass the raw Error object as `err` — Pino serialises it automatically.
 */
export interface ErrorContext {
  err: Error | unknown;
  req_id?: string;
  [key: string]: unknown;
}

/**
 * Fields for structured metric logging.
 */
export interface MetricFields {
  /** Metric identifier in snake_case. e.g. 'http_request_duration_ms' */
  metric_name: string;
  /** Numeric value of the metric */
  metric_value: number;
  /** Unit of measurement. e.g. 'ms', 'bytes', 'count' */
  metric_unit?: string;
  [key: string]: unknown;
}

/**
 * Timer returned by startTimer().
 */
export interface Timer {
  /** Returns elapsed time in milliseconds */
  elapsed(): number;
  /** Logs at info level with duration_ms field */
  done(msg: string): void;
  done(obj: Record<string, unknown>, msg: string): void;
}
