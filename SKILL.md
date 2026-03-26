# Skill: @kamranbiglari/pino-logger — Structured Logging

## Overview

This repository uses `@kamranbiglari/pino-logger` for all logging. It is an opinionated Pino wrapper that provides structured JSON logging, automatic field redaction, level-prefixed messages for log parser alerting, AsyncLocalStorage context propagation, request timing, metric logging, and log sampling.

**Do NOT use `console.log`, `console.error`, `console.warn`, or `console.debug` anywhere in the codebase.** Use the logger instead.

---

## Setup

### Install

```bash
npm install @kamranbiglari/pino-logger
npm install -D pino-pretty  # dev only — pretty output locally
```

The package is published to both **npm** and **GitHub Packages**.
If you prefer to install from GitHub Packages, add `.npmrc` to your repo root:

```
@kamranbiglari:registry=https://npm.pkg.github.com
```

### ESLint (recommended)

```json
{
  "rules": {
    "no-console": "error"
  }
}
```

---

## Creating the Logger

Create a single logger instance per service, typically in `src/logger.ts`:

```typescript
import { createLogger } from '@kamranbiglari/pino-logger';

export const logger = createLogger({
  service: 'my-service',          // kebab-case service name
  version: process.env.npm_package_version,
  env: process.env.NODE_ENV,
  sample: { trace: 100, debug: 10 }, // optional: emit every Nth log
});
```

Then import `logger` from this file everywhere else. Do NOT create multiple logger instances.

---

## Environment Variables

| Variable      | Values                                              | Default      | Description                         |
|---------------|-----------------------------------------------------|--------------|-------------------------------------|
| `LOG_LEVEL`   | `trace` `debug` `info` `warn` `error` `fatal` `alert` | `info`       | Minimum log level                   |
| `LOG_VERBOSE`  | `true` `false`                                      | `false`      | Forces trace level (overrides LOG_LEVEL) |
| `NODE_ENV`    | `development` `production`                          | `production` | Enables pino-pretty in dev          |

---

## Log Levels

| Level   | When to use                                                         | Kills process? |
|---------|---------------------------------------------------------------------|----------------|
| `trace` | Internal state, hot-path detail. Guard with `isLevelEnabled`.       | No             |
| `debug` | Development detail: queries, payloads, decisions.                   | No             |
| `info`  | Normal operations: startup, user actions, milestones.               | No             |
| `warn`  | Degraded but recoverable: retries, slow upstreams, deprecations.    | No             |
| `error` | Failures requiring attention. Always pass `err` field.              | No             |
| `fatal` | Unrecoverable failure. Flushes logs then calls `process.exit(1)`.   | **Yes**        |
| `alert` | Highest severity — security breaches, data corruption, SLA violations. | No          |

---

## API Reference

### Basic logging

Every message is automatically prefixed with the level: `[INFO] msg`, `[ERROR] msg`, etc.

```typescript
// String only
logger.info('server started');

// Object + message — put context in fields, not in the message string
logger.info({ user_id: 'u_123', action: 'login' }, 'user logged in');
logger.warn({ retries: 3, latency_ms: 2000 }, 'upstream slow');
```

### Error logging

Always pass the raw Error object as the `err` field. Pino serialises `message`, `stack`, `code`, and `type` automatically.

```typescript
try {
  await fetchRates();
} catch (err) {
  logger.error({ err, endpoint: '/v1/rates' }, 'rate fetch failed');
}
```

### Fatal — unrecoverable errors

Logs, flushes, then exits the process with code 1. Nothing below runs.

```typescript
try {
  await db.connect();
} catch (err) {
  logger.fatal({ err }, 'database connection failed');
}
```

### Alert — highest severity, does NOT kill process

Use for conditions requiring immediate operator attention while the service keeps running.

```typescript
logger.alert({ breach_type: 'unauthorized_access', ip }, 'security breach detected');
```

### Child loggers

Bind request-scoped fields once. Every log from the child includes them.

```typescript
const reqLogger = logger.child({ req_id: req.id, user_id: req.userId });
reqLogger.info({ path: req.path }, 'request received');
reqLogger.error({ err }, 'handler failed'); // includes req_id and user_id
```

### AsyncLocalStorage context (withContext)

Automatically propagate context through the async call stack without passing the logger around.

```typescript
import { withContext } from '@kamranbiglari/pino-logger';

// In middleware — set once:
app.use((req, res, next) => {
  withContext({ req_id: req.id, user_id: req.userId }, next);
});

// Anywhere downstream — context is auto-merged into every log:
logger.info('processing order');          // includes req_id, user_id
logger.error({ err }, 'payment failed');  // includes req_id, user_id
```

Contexts nest. Inner calls inherit and can override outer fields.

### Request duration tracking (startTimer)

```typescript
const timer = logger.startTimer();
await processRequest();
timer.done({ req_id, status: 200 }, 'response sent');
// => { "duration_ms": 42.17, "req_id": "...", "msg": "[INFO] response sent" }

// Or just get elapsed time without logging:
const ms = timer.elapsed();
```

### Structured metrics

```typescript
logger.metric({
  metric_name: 'http_request_duration',
  metric_value: 42,
  metric_unit: 'ms',
  method: 'GET',
  path: '/v1/rates',
});
// => { "metric_type": "metric", "metric_name": "http_request_duration", ... }
```

Filter metrics in your log aggregator with `metric_type == "metric"`.

### Log sampling

For high-throughput trace/debug logs. Every call is counted, every Nth log is emitted with count fields.

```typescript
const logger = createLogger({
  service: 'my-api',
  sample: { trace: 100, debug: 10 },
});

// Every 100th trace log emits with:
//   sampled_count: 100   (logs since last emission)
//   sampled_total: 500   (running total)
// No data is lost — you always know the exact count.
```

### Level guard

Avoid expensive object construction for disabled levels.

```typescript
if (logger.isLevelEnabled('debug')) {
  logger.debug({ payload: buildExpensivePayload() }, 'full payload');
}
```

### Graceful shutdown

Call on SIGTERM/SIGINT to flush sample counters and async transport buffers.

```typescript
process.on('SIGTERM', async () => {
  logger.info('shutting down');
  await logger.shutdown();
  process.exit(0);
});
```

### Raw Pino instance

For integrations that require the raw Pino logger (e.g. pino-http):

```typescript
import pinoHttp from 'pino-http';
app.use(pinoHttp({ logger: logger.instance }));
```

---

## Field Naming Conventions

| Field        | Convention          | Example                           |
|--------------|---------------------|-----------------------------------|
| Service name | kebab-case          | `windy-gateway`, `fx-api`         |
| Field names  | snake_case          | `req_id`, `latency_ms`            |
| Error object | always `err`        | `{ err: new Error(...) }`         |
| IDs          | suffix `_id`        | `req_id`, `user_id`, `order_id`   |
| Durations    | suffix `_ms`        | `latency_ms`, `ttl_ms`            |
| Counts       | suffix `_count`     | `retry_count`, `item_count`       |
| Message      | short stable string | `'rate fetch failed'`             |

**Put context in fields, not in the message string.**

```typescript
// GOOD — parseable, alertable, filterable
logger.error({ err, endpoint: '/v1/rates', status: 500 }, 'rate fetch failed');

// BAD — context buried in message string
logger.error('failed to fetch rates from /v1/rates with status 500');
```

---

## Migration from console.log

| Before                                | After                                                  |
|---------------------------------------|--------------------------------------------------------|
| `console.log('server started')`       | `logger.info('server started')`                        |
| `console.log('user:', user)`          | `logger.info({ user }, 'user context')`                |
| `console.debug('query:', q)`          | `logger.debug({ query: q }, 'query built')`            |
| `console.error('failed:', err)`       | `logger.error({ err }, 'operation failed')`            |
| `console.warn('slow')`               | `logger.warn({ latency_ms }, 'slow response')`         |
| `process.exit(1)` after error logging | `logger.fatal({ err }, 'critical failure')`            |

---

## Automatic Redaction

These fields are automatically redacted to `[REDACTED]` in log output:

- `password`, `apiKey`, `api_key`, `secret`
- `req.headers.authorization`, `req.headers.cookie`
- `headers.authorization`, `headers.cookie`
- `body.password`, `body.api_key`, `body.token`, `body.secret`

---

## Output Format

Every log line is JSON with these guaranteed fields:

```json
{
  "level": "info",
  "time": "2025-01-15T10:30:00.000Z",
  "service": "my-service",
  "env": "production",
  "version": "1.2.3",
  "msg": "[INFO] user logged in"
}
```

In `NODE_ENV=development`, output is pretty-printed via pino-pretty.
