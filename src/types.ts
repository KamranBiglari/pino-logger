export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
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
