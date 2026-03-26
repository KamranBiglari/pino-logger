import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<Record<string, unknown>>();

/**
 * Runs a function with context fields that are automatically merged
 * into every log call within that async scope.
 *
 * Contexts nest — inner calls inherit and can override outer fields.
 *
 * @example
 * // In middleware:
 * app.use((req, res, next) => {
 *   withContext({ req_id: req.id, user_id: req.userId }, next);
 * });
 *
 * // Anywhere in the call stack — no need to pass logger around:
 * logger.info('processing'); // automatically includes req_id, user_id
 */
export function withContext<T>(context: Record<string, unknown>, fn: () => T): T {
  const existing = storage.getStore();
  const merged = existing ? { ...existing, ...context } : context;
  return storage.run(merged, fn);
}

/**
 * Returns the current async context, or undefined if none is active.
 * Used internally by PinoLogger to auto-merge context into log calls.
 */
export function getContext(): Record<string, unknown> | undefined {
  return storage.getStore();
}
