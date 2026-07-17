#!/bin/bash
# 骑行看板 — 双击启动
cd "$(dirname "$0")"

# 更彻底地清理 8080 端口上的旧进程
# 防止旧 overtime-tracker / 其他 http.server 残留
fuser -k 8080/tcp 2>/dev/null || true
lsof -ti:8080 2>/dev/null | while read -r pid; do
  kill -9 "$pid" 2>/dev/null
done
sleep 1
# 二次确认端口已释放
if lsof -ti:8080 &>/dev/null; then
  echo "❌ 端口 8080 仍被占用，请手动检查"
  exit 1
fi

echo "🚴 正在启动骑行看板..."

pip3 install -q -r requirements.txt 2>/dev/null

echo "📡 http://localhost:8080"
python3 server.py 8080
