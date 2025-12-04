#!/bin/bash
# ═══════════════════════════════════════════════════════════
# XRCrawler - 快速数据库统计脚本
# ═══════════════════════════════════════════════════════════
# 使用方法: ./scripts/db-stats.sh

CONTAINER="xrcrawler-postgres-1"
DB="xrcrawler"
USER="postgres"

echo "🔍 XRCrawler 数据库统计"
echo "════════════════════════════════════════════════════════"
echo ""

# 总览
echo "📊 总览"
echo "────────────────────────────────────────────────────────"
docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -c "
SELECT 
  (SELECT COUNT(*) FROM \"Job\") as total_jobs,
  (SELECT COUNT(*) FROM \"Tweet\") as total_tweets,
  (SELECT COUNT(*) FROM \"ErrorLog\") as total_errors,
  (SELECT COUNT(*) FROM \"Job\" WHERE status = 'active') as active_jobs;
" --no-align --tuples-only --field-separator=' | '
echo ""

# 今日统计
echo "📅 今日抓取"
echo "────────────────────────────────────────────────────────"
docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -c "
SELECT 
  COUNT(*) as tweets_today,
  COUNT(DISTINCT username) as unique_users
FROM \"Tweet\"
WHERE \"scrapedAt\" > NOW() - INTERVAL '1 day';
" --no-align --tuples-only --field-separator=' | '
echo ""

# 错误统计
echo "⚠️  最近错误 (Top 5)"
echo "────────────────────────────────────────────────────────"
docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -c "
SELECT 
  category,
  COUNT(*) as count
FROM \"ErrorLog\"
WHERE \"createdAt\" > NOW() - INTERVAL '24 hours'
GROUP BY category
ORDER BY count DESC
LIMIT 5;
"
echo ""

# 运行中的任务
echo "🚀 运行中的任务"
echo "────────────────────────────────────────────────────────"
docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -c "
SELECT 
  type,
  \"bullJobId\",
  ROUND(EXTRACT(EPOCH FROM (NOW() - \"startedAt\"))) as running_seconds
FROM \"Job\"
WHERE status = 'active'
ORDER BY \"startedAt\" DESC;
"
echo ""

echo "✅ 完成！"
echo "════════════════════════════════════════════════════════"

