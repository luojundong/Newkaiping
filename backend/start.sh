#!/bin/bash
# 启动脚本：清理旧进程 → 启动后端（端口 5168）
cd /home/useroot/apps/kp || exit 1
export PATH="$HOME/node/bin:$PATH"
pkill -f 'node dist/main' 2>/dev/null
sleep 1
nohup env PORT=5168 node dist/main >> kp.log 2>&1 &
sleep 5
echo "--- 本地验证 ---"
curl -s -o /dev/null -w "root=%{http_code} " http://localhost:5168/
curl -s -o /dev/null -w "api=%{http_code}\n" http://localhost:5168/api/v1/auth/me
