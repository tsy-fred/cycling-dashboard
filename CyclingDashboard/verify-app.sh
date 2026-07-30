#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$PROJECT_DIR"
swift test
"$PROJECT_DIR/build-app.sh" debug

echo ""
echo "✅ 自动测试与调试构建全部通过"
