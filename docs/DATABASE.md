# Database Architecture

XRCrawler uses **PostgreSQL** with **Prisma ORM** for robust data persistence and resume capabilities.

## Quick Start

### 1. Start PostgreSQL

Using Docker Compose (recommended):

```bash
docker-compose up -d postgres
```

Or use your own PostgreSQL instance and set:

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/xrcrawler"
```

### 2. Push Schema

```bash
npx prisma db push
```

### 3. Generate Types

```bash
npx prisma generate
```

---

## Database Schema

### Job

Tracks high-level BullMQ jobs.

**Fields:**

- `id` - UUID primary key
- `bullJobId` - Links to BullMQ job ID
- `type` - Job type (`twitter`, `reddit`)
- `config` - Job configuration (JSONB)
- `status` - `pending`, `active`, `completed`, `failed`
- `priority` - Job priority
- `startedAt`, `completedAt`, `createdAt`

**Relations:**

- `tasks` - Subtasks (e.g., date chunks)
- `tweets` - Scraped tweets
- `checkpoints` - Resume points
- `errors` - Error logs

### Task

Tracks subtasks (e.g., individual date chunks in timeline scraping).

**Fields:**

- `id` - UUID
- `jobId` - Foreign key to Job
- `type` - Task type
- `config` - Task configuration (JSONB)
- `status` - `pending`, `active`, `completed`, `failed`
- `result`, `error` - JSONB fields

**Use Case:**

- Track which date chunks have been processed
- Enable smart resume (skip already processed chunks)

### Tweet

Stores scraped tweet data.

**Fields:**

- `id` - Tweet ID (primary key)
- `jobId` - Foreign key to Job (optional)
- `text`, `username`, `userId`
- `createdAt` - Tweet creation timestamp
- `scrapedAt` - When scraped
- `metrics` - Likes, retweets, replies (JSONB)
- `media` - Media URLs (JSONB)
- `raw` - Full raw data (JSONB)

**Indexes:**

- `(jobId, createdAt)` - Fast filtering
- `(username, createdAt)` - User timeline queries

### Checkpoint

Stores resume points (cursors, last tweet IDs).

**Fields:**

- `id` - UUID
- `jobId` - Foreign key to Job
- `key` - Checkpoint type (`timeline_cursor`, `last_tweet_id`)
- `value` - Checkpoint value (TEXT)
- `metadata` - Additional data (JSONB)
- `updatedAt`

**Unique Constraint:** `(jobId, key)`

**Use Case:**

- Resume scraping from last position
- Avoid re-scraping old data

### ErrorLog

Structured error logging for debugging.

**Fields:**

- `id` - UUID
- `jobId` - Foreign key to Job
- `severity` - `error`, `warning`, `fatal`
- `category` - Error type (`NETWORK_ERROR`, `AUTH_FAILURE`, `RATE_LIMIT`)
- `message`, `stack`
- `context` - Additional error context (JSONB)
- `createdAt`

**Use Case:**

- Debug scraping failures
- Analyze error patterns
- Improve error handling

### CookieSession

Tracks session health and usage.

**Fields:**

- `id` - UUID
- `filename` - Cookie file name
- `username` - Account username
- `platform` - `twitter`, `reddit`
- `isValid` - Session validity
- `lastUsedAt`, `errorCount`

**Use Case:**

- Monitor session health
- Automatic session rotation

---

## Repositories

All database interactions use repository classes for clean separation:

### JobRepository

```typescript
JobRepository.createJob(data);
JobRepository.updateStatus(id, status);
JobRepository.findByBullJobId(bullJobId);
JobRepository.createTask(data);
JobRepository.updateTaskStatus(id, status, result, error);
JobRepository.logError(data);
```

### TweetRepository

```typescript
TweetRepository.saveTweet({ tweet, jobId });
TweetRepository.saveTweets({ tweets, jobId });
TweetRepository.getExistingIds(ids);
```

### CheckpointRepository

```typescript
CheckpointRepository.saveCheckpoint(jobId, key, value, metadata);
CheckpointRepository.getCheckpoint(jobId, key);
```

---

## SQL Analysis Tools

### Quick Stats

```bash
./scripts/db-stats.sh
```

### Interactive Queries

```bash
# Install pgcli (recommended)
pip install pgcli

# Connect
pgcli postgresql://postgres:postgres@localhost:5432/xrcrawler

# Load pre-defined queries
\i scripts/db-queries.sql
```

### Example Queries

**Today's scraping stats:**

```sql
SELECT
  COUNT(*) as total_tweets,
  COUNT(DISTINCT username) as unique_users
FROM "Tweet"
WHERE "scrapedAt" > NOW() - INTERVAL '1 day';
```

**Error distribution:**

```sql
SELECT
  category,
  COUNT(*) as count
FROM "ErrorLog"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY category
ORDER BY count DESC;
```

**Running jobs:**

```sql
SELECT
  type,
  "bullJobId",
  EXTRACT(EPOCH FROM (NOW() - "startedAt")) as running_seconds
FROM "Job"
WHERE status = 'active';
```

---

## Prisma Studio (Visual Database Manager)

Start Prisma Studio:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/xrcrawler" npx prisma studio
```

Access at: `http://localhost:5555`

**Features:**

- Visual schema explorer
- Browse/edit data
- Relationship graph
- No SQL needed

---

## Best Practices

### 1. Always Use Repositories

❌ Don't:

```typescript
const tweet = await prisma.tweet.create({ data: ... });
```

✅ Do:

```typescript
const tweet = await TweetRepository.saveTweet({ tweet, jobId });
```

### 2. Link Scraped Data to Jobs

```typescript
// When scraping
const result = await engine.scrapeTimeline({
  username,
  jobId, // Pass from BullMQ job data
});

// Tweets are automatically linked
```

### 3. Use Checkpoints for Resume

```typescript
// Save progress
await CheckpointRepository.saveCheckpoint(jobId, "timeline_cursor", cursor);

// Resume later
const checkpoint = await CheckpointRepository.getCheckpoint(jobId, "timeline_cursor");
```

### 4. Log Errors with Context

```typescript
await JobRepository.logError({
  jobId,
  severity: "error",
  category: "NETWORK_ERROR",
  message: "Request failed",
  stack: error.stack,
  context: { url, status: 500 },
});
```

---

## Migration from File-Based System

### Old (File-Based)

```typescript
progressManager.saveProgress(progress);
// Saves to: data/progress/{username}.json
```

### New (Database-Backed)

```typescript
await CheckpointRepository.saveCheckpoint(jobId, "timeline_cursor", cursor);
// Saves to: Checkpoint table
```

**Benefits:**

- ✅ Concurrent-safe (no file locks)
- ✅ Queryable (SQL analysis)
- ✅ Relational (link tweets to jobs)
- ✅ ACID guarantees

---

## Troubleshooting

### Connection Errors

```
Error: Can't reach database server at localhost:5432
```

**Solution:**

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Verify
docker ps | grep postgres
```

### Prisma Client Out of Sync

```
Property 'tweet' does not exist on type 'PrismaClient'
```

**Solution:**

```bash
npx prisma generate
```

### Schema Mismatch

```
Database schema is not in sync with Prisma schema
```

**Solution:**

```bash
npx prisma db push
```

---

## Performance Tips

### Batch Inserts

```typescript
// ❌ Slow: One by one
for (const tweet of tweets) {
  await TweetRepository.saveTweet({ tweet, jobId });
}

// ✅ Fast: Batch
await TweetRepository.saveTweets({ tweets, jobId });
```

### Use Indexes

```sql
-- Already defined in schema
CREATE INDEX idx_tweet_job_created ON "Tweet"("jobId", "createdAt");
CREATE INDEX idx_tweet_username ON "Tweet"("username", "createdAt");
```

### Clean Old Data

```sql
-- Delete error logs older than 30 days
DELETE FROM "ErrorLog"
WHERE "createdAt" < NOW() - INTERVAL '30 days';
```

---

## Resources

- **Prisma Docs**: https://www.prisma.io/docs
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Schema**: `prisma/schema.prisma`
- **Repositories**: `core/db/`
