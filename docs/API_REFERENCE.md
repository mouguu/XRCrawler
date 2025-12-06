# API Reference

REST API documentation for XRCrawler.

## Base URL

- Development: `http://localhost:5001`
- Production: Configure via `PORT` environment variable

## Authentication

If `API_KEY` is set, all `/api/*` endpoints require authentication via header `X-API-Key` or query parameter `api_key`.

## Endpoints

### Scraping (Queue)

**POST /api/scrape-v2** — Queue a scraping job (BullMQ + Redis)

Request:

```json
{
  "type": "profile" | "thread" | "search" | "reddit",
  "input": "username or URL",
  "limit": 100,
  "mode": "graphql" | "puppeteer",
  "dateRange": { "start": "2024-01-01", "end": "2024-12-31" },
  "likes": false,
  "enableRotation": true,
  "enableProxy": false,
  "strategy": "auto" | "super_full" | "super_recent" | "new"  // Reddit only
}
```

Response:

```json
{
  "success": true,
  "jobId": "profile-1700000000-abc123",
  "statusUrl": "/api/job/<jobId>",
  "progressUrl": "/api/job/<jobId>/stream",
  "message": "Task queued successfully"
}
```

### Status & Progress (Queue)

**GET /api/job/:jobId** — Get job status/result  
Returns `{ id, state, progress, result }`

**GET /api/job/:jobId/stream** — SSE for progress/log events (EventSource)

**GET /api/jobs?state=completed|failed|active|waiting&type=twitter|reddit** — List jobs (paged)

- Legacy status endpoints were removed; use job status/streams instead.
- **GET /api/result** — Last download URL (non-queued fallback)

### Metrics & Health

**GET /api/metrics** - Get detailed metrics (speed, success rate, memory, etc.)

**GET /api/metrics/summary** - Get metrics summary

### Health & Operations

**GET /api/health** - Overall system health check

Response:

```json
{
  "status": "healthy",
  "timestamp": "2024-12-03T20:00:00Z",
  "checks": {
    "database": { "status": "healthy", "responseTime": 5 },
    "redis": { "status": "healthy", "responseTime": 2 },
    "proxy": { "status": "healthy", "responseTime": 850 }
  }
}
```

**GET /api/health/database** - PostgreSQL health check

**GET /api/health/redis** - Redis health check

**GET /api/health/proxy** - Proxy health check

**GET /api/stats** - System statistics and dashboard

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
  "recentErrors": [...],
  "runningJobs": [...]
}
```

### Session Management

**GET /api/sessions** - List available cookie sessions

Response:
```json
{
  "success": true,
  "sessions": [
    {
      "id": "uuid",
      "filename": "account1.json",
      "displayName": "Account 1",
      "username": "user1",
      "platform": "twitter",
      "isValid": true,
      "lastUsed": "2024-12-03T20:00:00Z",
      "errorCount": 0,
      "cookieCount": 15,
      "dbId": "uuid"
    }
  ]
}
```

**POST /api/cookies** - Upload cookie file (multipart/form-data, field: `file`)

Response: `{ "success": true, "filename": "account1.json" }`

**DELETE /api/sessions/:id** - Delete session (supports both UUID and filename)

**PATCH /api/sessions/:id/rename** - Rename session display name

### Configuration & Downloads

**GET /api/config** - Get public configuration

**GET /api/download?path=...** - Download result file (path validated for security)

## Error Responses

All endpoints return `{ "success": false, "error": "Error message", "code": "ERROR_CODE" }` on error.

Common error codes: `AUTH_REQUIRED`, `INVALID_API_KEY`, `TASK_RUNNING`, `INVALID_SESSION`, `RATE_LIMITED`, `INVALID_PATH`
