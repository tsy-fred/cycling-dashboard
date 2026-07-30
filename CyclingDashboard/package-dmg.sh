#!/bin/zsh
set -euo pipefail

APP_NAME="CyclingDashboard"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$PROJECT_DIR/.build/release"
APP_PATH="$BUILD_DIR/$APP_NAME.app"
DMG_PATH="$PROJECT_DIR/.build/$APP_NAME-macOS.dmg"
STAGING_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

"$PROJECT_DIR/build-app.sh" release

DMG_STAGING="$STAGING_DIR/$APP_NAME"
mkdir -p "$DMG_STAGING"
cp -R "$APP_PATH" "$DMG_STAGING/"
ln -s /Applications "$DMG_STAGING/Applications"

APP_SIZE_KB="$(du -sk "$APP_PATH" | cut -f1)"
DMG_SIZE_M=$(( (APP_SIZE_KB + APP_SIZE_KB / 3) * 2 / 2048 + 50 ))

hdiutil create \
    -ov \
    -srcfolder "$DMG_STAGING" \
    -volname "$APP_NAME" \
    -fs HFS+ \
    -format UDZO \
    -size "${DMG_SIZE_M}m" \
    "$DMG_PATH" \
    -quiet

echo ""
echo "✅ DMG 打包完成"
echo "   $DMG_PATH"
