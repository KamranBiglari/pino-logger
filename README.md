# @kamranbiglari/pino-logger

Opinionated Pino wrapper for structured JSON logging across Node.js/TypeScript services.

## Install

```bash
npm install @kamranbiglari/pino-logger
npm install -D pino-pretty  # dev only
```

The package is published to both **npm** and **GitHub Packages**.
To install from GitHub Packages instead, add `.npmrc` to your repo root:

```
@kamranbiglari:registry=https://npm.pkg.github.com
```

## Usage

```typescript
import { createLogger } from '@kamranbiglari/pino-logger';

const logger = createLogger({ service: 'my-service' });

logger.info({ userId }, 'user logged in');
logger.warn({ retries }, 'upstream slow');
logger.error({ err }, 'request failed');
logger.alert({ breach_type: 'unauthorized' }, 'security breach detected');
logger.fatal({ err }, 'cannot continue'); // logs then exits with code 1
```

All messages are prefixed with the log level: `[INFO] user logged in`, `[ERROR] request failed`, etc.
This enables log parser engines to alert on specific levels via message pattern matching.

## Log Levels

| Level | Numeric | Description |
|---|---|---|
| `trace` | 10 | Internal state, hot-path detail |
| `debug` | 20 | Development-time detail |
| `info` | 30 | Normal operations (default) |
| `warn` | 40 | Degraded but recoverable |
| `error` | 50 | Failures requiring attention |
| `fatal` | 60 | Unrecoverable — kills process |
| `alert` | 70 | Highest severity — immediate operator attention, does NOT kill process |

## Environment Variables

| Variable | Values | Default | Description |
|---|---|---|---|
| `LOG_LEVEL` | `trace` `debug` `info` `warn` `error` `fatal` `alert` | `info` | Minimum log level |
| `LOG_VERBOSE` | `true` `false` | `false` | Force trace level |
| `NODE_ENV` | `development` `production` | `production` | Enables pino-pretty in dev |

## Child loggers

```typescript
const reqLogger = logger.child({ req_id: 'abc-123', user_id: 'u_456' });
reqLogger.info({ path: '/v1/rates' }, 'request received'); // includes req_id and user_id
```

## AsyncLocalStorage Context

Automatically propagate context fields through the async call stack without passing the logger around:

```typescript
import { createLogger, withContext } from '@kamranbiglari/pino-logger';

const logger = createLogger({ service: 'my-api' });

// In middleware:
app.use((req, res, next) => {
  withContext({ req_id: req.id, user_id: req.userId }, next);
});

// Anywhere downstream — no need to pass logger:
logger.info('processing order'); // automatically includes req_id, user_id
```

## Request Duration Tracking

```typescript
const timer = logger.startTimer();
await processRequest();
timer.done({ req_id }, 'request processed');
// => { "duration_ms": 42.17, "req_id": "abc", "msg": "[INFO] request processed" }

// Or just get elapsed time:
const elapsed = timer.elapsed(); // ms
```

## Structured Metrics

```typescript
logger.metric({
  metric_name: 'http_request_duration',
  metric_value: 42,
  metric_unit: 'ms',
  method: 'GET',
  path: '/v1/rates',
});
// => { "metric_type": "metric", "metric_name": "http_request_duration", "metric_value": 42, ... }
```

## Log Sampling

For high-throughput trace/debug logs, sample every Nth log while counting every call:

```typescript
const logger = createLogger({
  service: 'my-api',
  sample: { trace: 100, debug: 10 },
});

// Every 100th trace log is emitted. Each emitted log includes:
// - sampled_count: number of logs since last emission (100)
// - sampled_total: running total of all calls at this level
// No logs are lost — you always know the exact count.
```

On shutdown, remaining counters are flushed as summary log lines.

## Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  logger.info('shutting down');
  await logger.shutdown(); // flushes sample counters + async transport buffers
  process.exit(0);
});
```

## Field Naming Conventions

| Field | Convention | Example |
|---|---|---|
| Service name | kebab-case | `windy-gateway`, `fx-api` |
| Field names | snake_case | `req_id`, `latency_ms`, `status_code` |
| Error object | always `err` | `{ err: new Error(...) }` |
| IDs | suffix `_id` | `req_id`, `user_id`, `order_id` |
| Durations | suffix `_ms` | `latency_ms`, `ttl_ms` |
| Message | short stable string | `'rate fetch failed'` |

## Versioning & Publishing

Versions are managed automatically by [semantic-release](https://github.com/semantic-release/semantic-release).
Push to `main` and the version is determined from commit messages:

| Commit prefix | Version bump | Example |
|---|---|---|
| `fix:` `perf:` `refactor:` | Patch (`1.0.0` → `1.0.1`) | `fix: handle null error` |
| `feat:` | Minor (`1.0.0` → `1.1.0`) | `feat: add metric() method` |
| `feat!:` or `BREAKING CHANGE:` | Major (`1.0.0` → `2.0.0`) | `feat!: rename createLogger` |

On each release, semantic-release:
1. Analyzes commits since last release
2. Bumps `package.json` version
3. Generates `CHANGELOG.md`
4. Creates a GitHub release with tag
5. Publishes to **npm** and **GitHub Packages**

No manual `npm version` or tag pushing needed.

### Required secrets

| Secret | Where | How to get |
|---|---|---|
| `GITHUB_TOKEN` | Auto-provided | Nothing to set up |
| `NPM_TOKEN` | Repo Settings → Secrets | npmjs.com → Access Tokens → Classic Token (Automation) |
