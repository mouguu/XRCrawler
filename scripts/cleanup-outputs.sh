#!/bin/bash
# XRCrawler Output Cleanup Script
# 自动清理旧的Reddit抓取结果，保留最新的运行记录

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REDDIT_DIR="$PROJECT_ROOT/output/reddit"

echo "🧹 XRCrawler Output Cleanup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 统计当前文件数量
if [ -d "$REDDIT_DIR" ]; then
    SCRAPED_COUNT=$(find "$REDDIT_DIR" -maxdepth 1 -type d -name "scraped_*" 2>/dev/null | wc -l | tr -d ' ')
    RUN_COUNT=$(find "$REDDIT_DIR" -maxdepth 1 -type d -name "run-*" 2>/dev/null | wc -l | tr -d ' ')
    
    echo "📊 当前状态："
    echo "   - scraped_* 目录: $SCRAPED_COUNT"
    echo "   - run-* 目录: $RUN_COUNT"
    echo ""
    
    # 删除所有 scraped_* 目录（已废弃的旧格式）
    if [ "$SCRAPED_COUNT" -gt 0 ]; then
        echo "🗑️  删除废弃的 scraped_* 目录..."
        find "$REDDIT_DIR" -maxdepth 1 -type d -name "scraped_*" -exec rm -rf {} +
        echo "   ✓ 已删除 $SCRAPED_COUNT 个旧目录"
    fi
    
    # 保留最新的2个 run-* 目录，删除其余
    if [ "$RUN_COUNT" -gt 2 ]; then
        echo "🗑️  清理旧的 run-* 目录（保留最新2个）..."
        # 按修改时间排序，删除最旧的
        DIRS_TO_DELETE=$((RUN_COUNT - 2))
        find "$REDDIT_DIR" -maxdepth 1 -type d -name "run-*" -printf '%T@ %p\n' | \
            sort -n | \
            head -n "$DIRS_TO_DELETE" | \
            cut -d' ' -f2- | \
            xargs -I {} rm -rf {}
        echo "   ✓ 已删除 $DIRS_TO_DELETE 个旧运行目录"
    fi
    
    echo ""
    echo "✅ 清理完成！"
    
    # 显示剩余文件
    REMAINING_COUNT=$(find "$REDDIT_DIR" -maxdepth 1 -type d -name "run-*" 2>/dev/null | wc -l | tr -d ' ')
    echo "📁 剩余运行记录: $REMAINING_COUNT"
else
    echo "⚠️  Reddit输出目录不存在: $REDDIT_DIR"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
