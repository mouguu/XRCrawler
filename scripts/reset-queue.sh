#!/bin/bash
# Queue Reset Script - 队列重置脚本
# 清理所有任务并重启 worker（紧急情况使用）
#
# Usage:
#   ./scripts/reset-queue.sh          # 交互式确认
#   ./scripts/reset-queue.sh --force # 跳过确认，直接执行

set -e

FORCE=false
if [ "$1" = "--force" ]; then
  FORCE=true
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  队列重置脚本 (Queue Reset Script)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "此操作将："
echo "  1. 清空 Redis 中的所有任务队列"
echo "  2. 重启 worker 进程（中断所有正在运行的任务）"
echo ""
echo "⚠️  警告：这将删除所有待处理和正在运行的任务！"
echo ""

if [ "$FORCE" = false ]; then
  echo "按 Ctrl+C 取消，或等待 5 秒后自动继续..."
  sleep 5
  echo ""
fi

# 检查 Docker 是否运行
if ! docker compose ps redis >/dev/null 2>&1; then
  echo "❌ 错误：无法连接到 Docker Compose"
  echo "   请确保 Docker 正在运行，并且项目已启动"
  exit 1
fi

# 1. 清理 Redis 队列
echo "🔄 步骤 1/2: 清理 Redis 队列..."
if docker compose exec -T redis redis-cli FLUSHDB >/dev/null 2>&1; then
  echo "   ✓ Redis 队列已清空"
else
  echo "   ⚠️  警告：无法清空 Redis（可能 Redis 未运行）"
  echo "   继续执行下一步..."
fi

# 2. 重启 worker
echo ""
echo "🔄 步骤 2/2: 重启 worker..."
if docker compose restart worker >/dev/null 2>&1; then
  echo "   ✓ Worker 已重启"
else
  echo "   ⚠️  警告：无法重启 worker（可能 worker 未运行）"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 重置完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "所有任务已清理，worker 已重启。"
echo "请刷新浏览器页面查看更新。"
echo ""


