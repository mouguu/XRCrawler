-- ═══════════════════════════════════════════════════════════
-- XRCrawler - PostgreSQL 分析查询工具包
-- ═══════════════════════════════════════════════════════════
-- 使用方法:
--   1. pgcli postgresql://postgres:postgres@localhost:5432/xrcrawler
--   2. \i scripts/db-queries.sql
--   或者直接复制需要的查询执行
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────
-- 📊 统计概览
-- ─────────────────────────────────────────────────────────

-- 今日抓取统计
SELECT 
  COUNT(*) as total_tweets,
  COUNT(DISTINCT username) as unique_users,
  MIN("createdAt") as earliest_tweet,
  MAX("createdAt") as latest_tweet
FROM "Tweet"
WHERE "scrapedAt" > NOW() - INTERVAL '1 day';

-- 各用户抓取量排行 (Top 10)
SELECT 
  username,
  COUNT(*) as tweet_count,
  MIN("createdAt") as earliest,
  MAX("createdAt") as latest
FROM "Tweet"
GROUP BY username
ORDER BY tweet_count DESC
LIMIT 10;

-- Job 状态统计
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt"))) as avg_duration_seconds
FROM "Job"
WHERE "completedAt" IS NOT NULL
GROUP BY status
ORDER BY count DESC;

-- ─────────────────────────────────────────────────────────
-- 🔍 调试查询
-- ─────────────────────────────────────────────────────────

-- 查看最近的错误 (Top 10)
SELECT 
  created_at,
  severity,
  category,
  message,
  context
FROM "ErrorLog"
ORDER BY "createdAt" DESC
LIMIT 10;

-- 错误类型分布
SELECT 
  category,
  severity,
  COUNT(*) as occurrences
FROM "ErrorLog"
WHERE "createdAt" > NOW() - INTERVAL '1 day'
GROUP BY category, severity
ORDER BY occurrences DESC;

-- 正在运行的 Job
SELECT 
  id,
  type,
  "bullJobId",
  "startedAt",
  EXTRACT(EPOCH FROM (NOW() - "startedAt")) as running_seconds
FROM "Job"
WHERE status = 'active'
ORDER BY "startedAt" DESC;

-- ─────────────────────────────────────────────────────────
-- 🎯 断点检查
-- ─────────────────────────────────────────────────────────

-- 查看某个 Job 的 Checkpoint
SELECT 
  j.id as job_id,
  j.type,
  c.key,
  c.value,
  c.metadata,
  c."updatedAt"
FROM "Job" j
LEFT JOIN "Checkpoint" c ON j.id = c."jobId"
WHERE j."bullJobId" = 'YOUR_JOB_ID_HERE'
ORDER BY c."updatedAt" DESC;

-- 所有未完成的 Job 及其进度
SELECT 
  j.id,
  j.type,
  j.status,
  (SELECT COUNT(*) FROM "Tweet" t WHERE t."jobId" = j.id) as tweets_collected,
  (SELECT value FROM "Checkpoint" c WHERE c."jobId" = j.id AND c.key = 'timeline_cursor' LIMIT 1) as last_cursor
FROM "Job" j
WHERE j.status IN ('pending', 'active')
ORDER BY j."createdAt" DESC;

-- ─────────────────────────────────────────────────────────
-- 📈 性能分析
-- ─────────────────────────────────────────────────────────

-- 每小时抓取量（过去24小时）
SELECT 
  DATE_TRUNC('hour', "scrapedAt") as hour,
  COUNT(*) as tweets_per_hour
FROM "Tweet"
WHERE "scrapedAt" > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- 最慢的 Job (Top 10)
SELECT 
  id,
  type,
  "bullJobId",
  EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) as duration_seconds
FROM "Job"
WHERE "completedAt" IS NOT NULL
ORDER BY duration_seconds DESC
LIMIT 10;

-- Task 成功率
SELECT 
  type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
  ROUND(100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM "Task"
GROUP BY type;

-- ─────────────────────────────────────────────────────────
-- 🧹 清理与维护
-- ─────────────────────────────────────────────────────────

-- 删除 30 天前的错误日志
DELETE FROM "ErrorLog"
WHERE "createdAt" < NOW() - INTERVAL '30 days';

-- 删除已完成的老旧 Job（保留 7 天内的）
DELETE FROM "Job"
WHERE status = 'completed' 
  AND "completedAt" < NOW() - INTERVAL '7 days';

-- 查看数据库大小
SELECT 
  pg_size_pretty(pg_database_size('xrcrawler')) as db_size,
  (SELECT COUNT(*) FROM "Tweet") as total_tweets,
  (SELECT COUNT(*) FROM "Job") as total_jobs;

-- 查看各表大小
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ─────────────────────────────────────────────────────────
-- 🔥 高级查询
-- ─────────────────────────────────────────────────────────

-- 分析推文内容（Top 10 热词）
SELECT 
  word,
  COUNT(*) as frequency
FROM (
  SELECT regexp_split_to_table(lower(text), E'\\s+') as word
  FROM "Tweet"
  WHERE text IS NOT NULL
) words
WHERE length(word) > 3
  AND word NOT IN ('https', 'http', 'www')
GROUP BY word
ORDER BY frequency DESC
LIMIT 10;

-- 用户活跃度（按小时统计推文发布时间）
SELECT 
  EXTRACT(HOUR FROM "createdAt") as hour_of_day,
  COUNT(*) as tweet_count
FROM "Tweet"
WHERE "createdAt" IS NOT NULL
GROUP BY hour_of_day
ORDER BY hour_of_day;

-- 媒体类型统计（有图、有视频的推文）
SELECT 
  CASE 
    WHEN media IS NULL OR jsonb_array_length(media) = 0 THEN 'no_media'
    WHEN media::text LIKE '%photo%' THEN 'has_photo'
    WHEN media::text LIKE '%video%' THEN 'has_video'
    ELSE 'other'
  END as media_type,
  COUNT(*) as count
FROM "Tweet"
GROUP BY media_type
ORDER BY count DESC;
