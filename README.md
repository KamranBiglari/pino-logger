# @kamranbiglari/pino-logger

Opinionated Pino wrapper for structured JSON logging across Node.js/TypeScript services.

## Install

```bash
npm install @kamranbiglari/pino-logger
npm install -D pino-pretty  # dev only
```

Add to `.npmrc` in your repo:
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
logger.fatal({ err }, 'cannot continue'); // logs then exits with code 1
```

## Environment Variables

| Variable | Values | Default | Description |
|---|---|---|---|
| `LOG_LEVEL` | `trace` `debug` `info` `warn` `error` `fatal` | `info` | Minimum log level |
| `LOG_VERBOSE` | `true` `false` | `false` | Force trace level |
| `NODE_ENV` | `development` `production` | `production` | Enables pino-pretty in dev |

## Child loggers

```typescript
const reqLogger = logger.child({ req_id: 'abc-123', user_id: 'u_456' });
reqLogger.info({ path: '/v1/rates' }, 'request received'); // includes req_id and user_id
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

## Publishing

```bash
npm version patch   # or minor / major
git push origin main --tags
```

GitHub Actions will run typecheck → build → publish automatically on `v*` tag push.
