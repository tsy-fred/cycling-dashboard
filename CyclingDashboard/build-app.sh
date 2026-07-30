#!/bin/zsh
set -e

APP_NAME="CyclingDashboard"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="${1:-release}"   # 用法: ./build-app.sh [debug|release]
BUILD_DIR="$PROJECT_DIR/.build/$CONFIG"
APP_DIR="$BUILD_DIR/$APP_NAME.app"

cd "$PROJECT_DIR"

if [[ "$CONFIG" == "debug" ]]; then
    swift build          # 增量编译, 几秒
else
    swift build -c release
fi

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

cp "$BUILD_DIR/$APP_NAME" "$APP_DIR/Contents/MacOS/"

ICON_PNG="$PROJECT_DIR/.build/AppIcon.png"
ICONSET="$PROJECT_DIR/.build/AppIcon.iconset"
ICON_FILE="$BUILD_DIR/AppIcon.icns"
rm -rf "$ICONSET"
python3 "$PROJECT_DIR/generate-app-icon.py" "$ICON_PNG" "$ICONSET"
iconutil -c icns "$ICONSET" -o "$ICON_FILE"
cp "$ICON_FILE" "$APP_DIR/Contents/Resources/"

cat > "$APP_DIR/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>CyclingDashboard</string>
    <key>CFBundleIdentifier</key>
    <string>com.tang.CyclingDashboard</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon.icns</string>
    <key>CFBundleName</key>
    <string>CyclingDashboard</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.sports</string>
</dict>
</plist>
EOF

codesign --force --deep --sign - "$APP_DIR"

echo "Built ($CONFIG): $APP_DIR"
echo "打开: open $APP_DIR"
