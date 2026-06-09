#!/bin/bash
# 骑行看板 — 双击启动
cd "$(dirname "$0")"
echo "🚴 正在启动骑行看板..."
pip3 install -q -r requirements.txt 2>/dev/null
echo "📡 服务器已启动: http://localhost:8080"
open http://localhost:8080
python3 server.py 8080
