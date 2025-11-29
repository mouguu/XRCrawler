#!/bin/bash
# 启动 Reddit API 服务器

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REDDIT_DIR="$SCRIPT_DIR/../platforms/reddit"
VENV_DIR="$REDDIT_DIR/.venv"

cd "$REDDIT_DIR" || exit 1

# 检查 Python 环境
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed"
    exit 1
fi

# 检查并创建虚拟环境
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating Python virtual environment..."
    if ! python3 -m venv "$VENV_DIR"; then
        echo "❌ Failed to create virtual environment"
        exit 1
    fi
fi

# 激活虚拟环境
source "$VENV_DIR/bin/activate"

# 检查依赖并安装
if ! python3 -c "import flask" 2>/dev/null; then
    echo "📦 Installing Python dependencies..."
    if ! pip install -q -r requirements.txt; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

# 启动服务器
echo "🚀 Starting Reddit API Server on http://127.0.0.1:5002"
python3 reddit_api_server.py

