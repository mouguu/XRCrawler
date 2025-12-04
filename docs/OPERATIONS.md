# Operations & Monitoring

XRCrawler provides lightweight operational features for production-ready monitoring and management.

## Health Checks

Monitor system health via simple API endpoints.

### Overall Health

```bash
curl http://localhost:5001/api/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2024-12-03T20:00:00Z",
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 5,
      "message": "Database responding normally"
    },
    "redis": {
      "status": "healthy",
      "responseTime": 2
    },
    "proxy": {
      "status": "healthy",
      "responseTime": 850
    }
  }
}
```

### Individual Service Checks

**Database:**

```bash
curl http://localhost:5001/api/health/database
```

**Redis:**

```bash
curl http://localhost:5001/api/health/redis
```

**Proxy:**

```bash
curl http://localhost:5001/api/health/proxy
```

### Health Status Levels

- `healthy` - Service responding normally
- `degraded` - Service responding slowly
- `down` - Service unavailable

---

## Dashboard API

Get system statistics via JSON API.

### Stats Overview

```bash
curl http://localhost:5001/api/stats
```

Response:

```json
{
  "summary": {
    "totalTweets": 15230,
    "totalJobs": 45,
    "activeJobs": 2,
    "totalErrors": 12
  },
  "today": {
    "tweetsScraped": 340,
    "uniqueUsers": 8,
    "errors": 2
  },
  "recentErrors": [
    {
      "category": "RATE_LIMIT",
      "message": "Rate limit exceeded",
      "timestamp": "2024-12-03T19:15:00Z",
      "severity": "warning"
    }
  ],
  "runningJobs": [
    {
      "id": "abc123",
      "type": "twitter",
      "username": "elonmusk",
      "runningSince": "2024-12-03T19:00:00Z",
      "tweetsCollected": 150
    }
  ]
}
```

**Caching:** Stats are cached for 10 seconds to avoid database overload.

---

## Dynamic Rate Limiting

XRCrawler automatically adjusts scraping speed based on Twitter's rate limit headers.

### How It Works

1. **Extract Headers**: Read `x-rate-limit-remaining` and `x-rate-limit-reset` from Twitter responses
2. **Store in Redis**: Save rate limit info with TTL until reset time
3. **Auto-throttle**: Adjust delay based on remaining quota

### Throttling Logic

| Remaining Requests | Delay            | Action            |
| ------------------ | ---------------- | ----------------- |
| > 50               | 2 seconds        | Normal speed      |
| 10-50              | 5 seconds        | Moderate throttle |
| < 10               | 10 seconds       | Heavy throttle    |
| 0                  | Wait until reset | Pause until reset |

### Integration Example

```typescript
import { rateLimiter } from "./core/rate-limiter";

// Before making request
await rateLimiter.wait("UserTimeline");

// After receiving response
await rateLimiter.updateFromHeaders("UserTimeline", response.headers);
```

---

## Metrics Collection

Real-time performance metrics for monitoring.

### System Metrics

**GET /api/metrics:**

```json
{
  "scraping": {
    "totalScraped": 1530,
    "successRate": 98.5,
    "avgSpeed": 3.2
  },
  "system": {
    "memoryUsage": 256,
    "cpuUsage": 45.2,
    "uptime": 86400
  }
}
```

**GET /api/metrics/summary:**

```json
{
  "summary": {
    "totalRequests": 1000,
    "successRate": 98.5,
    "avgResponseTime": 250
  },
  "metrics": { ... }
}
```

---

## Logging Standards

XRCrawler uses structured logging with `EnhancedLogger`.

### Log Levels

- `debug` - Verbose debugging info
- `info` - General information
- `warn` - Warnings (non-blocking)
- `error` - Errors (with stack traces)

### Example

```typescript
import { createEnhancedLogger } from "./utils/logger";

const logger = createEnhancedLogger("MyComponent");

logger.info("Starting scrape", { username: "elonmusk", limit: 100 });
logger.warn("Rate limit approaching", { remaining: 15 });
logger.error("Request failed", new Error("Network timeout"));
```

### Environment Configuration

```bash
# Set log level
export LOG_LEVEL=debug  # or info, warn, error

# Start server
pnpm run dev
```

---

## Database Analysis

Use SQL queries to analyze scraping performance and data.

### Quick Stats Script

```bash
./scripts/db-stats.sh
```

Output:

```
🔍 XRCrawler 数据库统计
════════════════════════════════════════════════════════

📊 总览
────────────────────────────────────────────────────────
45 | 15230 | 12 | 2

📅 今日抓取
────────────────────────────────────────────────────────
340 | 8

⚠️  最近错误 (Top 5)
────────────────────────────────────────────────────────
RATE_LIMIT    | 5
NETWORK_ERROR | 3
```

### Interactive Queries

Using `pgcli` (recommended):

```bash
pip install pgcli
pgcli postgresql://postgres:postgres@localhost:5432/xrcrawler

# Load pre-defined queries
\i scripts/db-queries.sql
```

### Common Queries

See `scripts/db-queries.sql` for 20+ pre-defined queries including:

- Today's scraping stats
- Top users by tweet count
- Error distribution
- Job performance metrics
- Running jobs with progress
- Hourly scraping trends

---

## Bull Board (Queue Dashboard)

Visual queue monitoring at: `http://localhost:5001/admin/queues`

**Features:**

- View all jobs (waiting, active, completed, failed)
- Retry failed jobs
- Remove jobs
- View job data and logs
- Real-time updates

---

## Alerting (Optional)

For production deployments, consider adding:

### Prometheus + Grafana

Export metrics in Prometheus format and visualize in Grafana.

### Uptime Monitoring

Use services like UptimeRobot or Pingdom to monitor `/api/health`.

### Log Aggregation

Ship logs to ELK stack or Loki for centralized logging.

---

## Troubleshooting

### High Memory Usage

```bash
# Check metrics
curl http://localhost:5001/api/metrics

# Restart worker
docker-compose restart worker
```

### Slow Scraping

```bash
# Check rate limiting
curl http://localhost:5001/api/stats | jq '.recentErrors'

# Check active jobs
curl http://localhost:5001/api/stats | jq '.runningJobs'
```

### Database Connection Issues

```bash
# Check health
curl http://localhost:5001/api/health/database

# Restart PostgreSQL
docker-compose restart postgres
```

---

## Resources

- **Health Checks**: `core/health/health-checker.ts`
- **Rate Limiter**: `core/rate-limiter.ts`
- **Stats API**: `routes/stats.ts`
- **SQL Toolkit**: `scripts/db-queries.sql`, `scripts/db-stats.sh`
