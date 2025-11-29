# API Reference

REST API documentation for XRCrawler.

## Base URL

- Development: `http://localhost:5001`
- Production: Configure via `PORT` environment variable

## Authentication

If `API_KEY` is set, all `/api/*` endpoints require authentication via header `X-API-Key` or query parameter `api_key`.

## Endpoints

### Scraping

**POST /api/scrape** - Start scraping task

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
  "strategy": "auto" | "super_full" | "super_recent" | "new"  // Reddit only
}
```

Response: `{ "success": true, "downloadUrl": "/api/download?path=...", "stats": { "count": 100 } }`

**POST /api/monitor** - Start monitoring

Request: `{ "users": ["user1"], "keywords": "AI,space", "lookbackHours": 24, "enableRotation": true }`

Response: `{ "success": true, "downloadUrl": "/api/download?path=..." }`

**POST /api/stop** - Stop current task

Response: `{ "success": true, "message": "Stop signal sent..." }`

### Status & Progress

**GET /api/progress** - Server-Sent Events stream for real-time progress updates

**GET /api/status** - Get current scraping status

Response: `{ "isActive": true, "shouldStop": false }`

**GET /api/result** - Get result after scraping completes

Response: `{ "isActive": false, "downloadUrl": "/api/download?path=..." }`

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
