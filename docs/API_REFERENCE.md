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
  "mode": "graphql" | "puppeteer" | "mixed",
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

Legacy status endpoints remain for compatibility:
- **GET /api/status** — Basic scraper activity flag
- **GET /api/result** — Last download URL (non-queued fallback)

### Metrics & Health

**GET /api/metrics** - Get detailed metrics (speed, success rate, memory, etc.)

**GET /api/metrics/summary** - Get metrics summary

**GET /api/health** - Health check (status, uptime, memory, active tasks)

### Session Management

**GET /api/sessions** - List available cookie sessions

Response: `{ "success": true, "sessions": [{ "filename": "account1.json", "valid": true, "username": "user1" }] }`

**POST /api/cookies** - Upload cookie file (multipart/form-data, field: `file`)

Response: `{ "success": true, "filename": "account1.json" }`

### Configuration & Downloads

**GET /api/config** - Get public configuration

**GET /api/download?path=...** - Download result file (path validated for security)

## Error Responses

All endpoints return `{ "success": false, "error": "Error message", "code": "ERROR_CODE" }` on error.

Common error codes: `AUTH_REQUIRED`, `INVALID_API_KEY`, `TASK_RUNNING`, `INVALID_SESSION`, `RATE_LIMITED`, `INVALID_PATH`
