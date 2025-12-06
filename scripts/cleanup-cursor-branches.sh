#!/bin/bash
# 清理 Cursor 自动创建的临时分支

echo "🔍 查找 Cursor 创建的临时分支..."

# 查找所有 cursor/* 分支
CURSOR_BRANCHES=$(git branch | grep -E "cursor/|\.cursor/" | sed 's/^[ *]*//')

if [ -z "$CURSOR_BRANCHES" ]; then
  echo "✅ 没有找到 Cursor 创建的临时分支"
  exit 0
fi

echo "找到以下分支："
echo "$CURSOR_BRANCHES"
echo ""

# 确认删除
read -p "是否删除这些分支？(y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "$CURSOR_BRANCHES" | while read -r branch; do
    echo "删除分支: $branch"
    git branch -D "$branch" 2>/dev/null || git worktree remove --force "$branch" 2>/dev/null
  done
  echo "✅ 清理完成"
else
  echo "❌ 已取消"
fi
