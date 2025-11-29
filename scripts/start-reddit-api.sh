#!/bin/bash
# 启动 Reddit API 服务器

cd "$(dirname "$0")/../platforms/reddit"

# 检查 Python 环境
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed"
    exit 1
fi

# 检查依赖
if ! python3 -c "import flask" 2>/dev/null; then
    echo "📦 Installing dependencies..."
    pip3 install -r requirements.txt
fi

# 启动服务器
echo "🚀 Starting Reddit API Server..."
python3 reddit_api_server.py

