# XRCrawler Configuration System

## Overview

XRCrawler uses a **layered configuration system** with clear separation between constants and configurable values.

## Configuration Sources

### 1. `config/constants.ts` - Immutable Constants

**Purpose**: Contains values that NEVER change at runtime.

**What belongs here**:

- ✅ API endpoints (`X_API_OPS`, GraphQL query IDs)
- ✅ Platform identifiers (`PLATFORM_NAME`)
- ✅ Browser arguments (`BROWSER_ARGS`)
- ✅ Feature flags for GraphQL API
- ✅ Resource type lists (`BLOCKED_RESOURCE_TYPES`)

**What does NOT belong here**:

- ❌ Timeouts (these are configurable)
- ❌ Delays (user might want to change these)
- ❌ Limits (depends on use case)

---

### 2. `utils/config-manager.ts` - ConfigManager (Recommended)

**Purpose**: Single source of truth for all configurable values.

**Loading Priority** (highest to lowest):

1. **Environment Variables** (`process.env.PORT`)
2. **Config File** (`config.json` or user-specified)
3. **Default Values** (hardcoded in ConfigManager)

**Usage**:

```typescript
import { getConfigManager } from "./utils/config-manager";

const config = getConfigManager();
const port = config.getServerConfig().port;
const twitterLimit = config.getTwitterConfig().defaultLimit;
```

**Available Config Sections**:

- `server`: Port, host, API key
- `output`: Base directory, legacy compatibility
- `redis`: Connection settings
- `queue`: Concurrency, rate limits
- `twitter`: Default mode, limits, timeouts
- `reddit`: API URL, timeout, strategy
- `browser`: Headless, user agent, viewport
- `rateLimit`: Max retries, delays
- `logging`: Level, file logging

---

### 3. Environment Variables

**Supported Variables**:

| Variable                | Config Section       | Example                 |
| ----------------------- | -------------------- | ----------------------- |
| `PORT`                  | server.port          | `5001`                  |
| `HOST`                  | server.host          | `0.0.0.0`               |
| `API_KEY`               | server.apiKey        | `secret123`             |
| `OUTPUT_DIR`            | output.baseDir       | `/data/output`          |
| `REDIS_HOST`            | redis.host           | `localhost`             |
| `REDIS_PORT`            | redis.port           | `6379`                  |
| `TWITTER_DEFAULT_MODE`  | twitter.defaultMode  | `graphql`               |
| `TWITTER_DEFAULT_LIMIT` | twitter.defaultLimit | `100`                   |
| `REDDIT_API_URL`        | reddit.apiUrl        | `http://localhost:5002` |
| `BROWSER_HEADLESS`      | browser.headless     | `true`                  |
| `LOG_LEVEL`             | logging.level        | `debug`                 |

**Override Example**:

```bash
PORT=8080 TWITTER_DEFAULT_LIMIT=200 pnpm run dev:server
```

---

### 4. `crawler-config.json` (Legacy)

**Note**: This file is for the **legacy batch/scheduler mode**. For new queue-based workflows, use `ConfigManager` instead.

**Contents**:

- Twitter batch usernames
- Schedule settings
- Output format preferences

---

## Migration Guide

If you're using values from `constants.ts` that are now deprecated:

### Before:

```typescript
import { DEFAULT_TWEET_LIMIT, NAVIGATION_TIMEOUT } from "./config/constants";

scraper.run({ limit: DEFAULT_TWEET_LIMIT, timeout: NAVIGATION_TIMEOUT });
```

### After:

```typescript
import { getConfigManager } from "./utils/config-manager";

const config = getConfigManager();
const twitterConfig = config.getTwitterConfig();

scraper.run({
  limit: twitterConfig.defaultLimit,
  timeout: twitterConfig.browserTimeout,
});
```

---

## Best Practices

1. **Always use ConfigManager** for runtime-configurable values
2. **Use constants.ts** only for API endpoints and truly immutable values
3. **Use environment variables** for deployment-specific overrides
4. **Avoid hardcoding** timeouts, limits, or URLs in business logic

---

## Adding New Configuration

### 1. Add to ConfigManager Interface (`utils/config-manager.ts`)

```typescript
export interface AppConfig {
  // ... existing config ...
  myNewFeature: {
    enabled: boolean;
    timeout: number;
  };
}
```

### 2. Add Default Value

```typescript
const DEFAULT_CONFIG: AppConfig = {
  // ... existing defaults ...
  myNewFeature: {
    enabled: true,
    timeout: 5000,
  },
};
```

### 3. Add Environment Variable Support

```typescript
private loadFromEnv(): void {
  // ... existing env loading ...
  if (process.env.MY_FEATURE_ENABLED) {
    this.config.myNewFeature.enabled = process.env.MY_FEATURE_ENABLED === 'true';
  }
}
```

### 4. Add Getter Method

```typescript
getMyFeatureConfig(): AppConfig['myNewFeature'] {
  return { ...this.config.myNewFeature };
}
```

---

## Troubleshooting

**Q**: Where do I change the default tweet limit?

**A**: Set `TWITTER_DEFAULT_LIMIT` environment variable or modify `config.json`.

**Q**: Can I use different configs for development vs production?

**A**: Yes! Use environment variables or different config files:

```bash
NODE_ENV=production node dist/cmd/start-server.js --config production-config.json
```

**Q**: Why are some timeout values in `constants.ts`?

**A**: They're marked `@deprecated` for backward compatibility. Use ConfigManager instead.
