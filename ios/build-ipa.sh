#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./manifest.json').version")"
echo "==> Đóng gói FUNNYGAME iOS (.ipa) v${VERSION}"

# 1. Tạo bộ nguồn Safari Web Extension
node scripts/build-safari-source.js

WORK_DIR="$(mktemp -d)"
EXT_SRC="${WORK_DIR}/safari-src"
PROJ_DIR="${WORK_DIR}/xcode-proj"
DERIVED_DIR="${WORK_DIR}/DerivedData"
PAYLOAD_DIR="${WORK_DIR}/Payload"

mkdir -p "$EXT_SRC" "$PROJ_DIR"
unzip -q "dist/funnygame-safari-source-v${VERSION}.zip" -d "$EXT_SRC"

# 2. Sinh project Xcode iOS (Host App + Safari Web Extension .appex)
xcrun safari-web-extension-converter "$EXT_SRC" \
    --project-location "$PROJ_DIR" \
    --app-name "FUNNYGAME" \
    --bundle-identifier "com.luanem2709.FUNNYGAME" \
    --swift \
    --ios-only \
    --no-open \
    --no-prompt \
    --force

XCODEPROJ="$(find "$PROJ_DIR" -maxdepth 3 -name "*.xcodeproj" | head -n 1)"
if [ -z "$XCODEPROJ" ]; then
    echo "Không tìm thấy file .xcodeproj sau khi chạy safari-web-extension-converter"
    exit 1
fi
echo "==> Project Xcode: $XCODEPROJ"

# 3. Thay ViewController.swift bằng bản App iOS cao cấp (Đa Tab + PiP + Lock Screen + Hold 2x + Khoá Key FUNNYGAME)
VC_FILES="$(find "$PROJ_DIR" -name "ViewController.swift")"
for vc in $VC_FILES; do
    echo "==> Cập nhật $vc"
    cp "$ROOT_DIR/ios/ViewController.swift" "$vc"
done

# 4. Tạo bộ AppIcon 1024x1024 chuẩn iOS từ ios/AppIcon-1024.png (hoặc images/icon128.png)
ICON_SRC="$ROOT_DIR/ios/AppIcon-1024.png"
if [ ! -f "$ICON_SRC" ]; then
    ICON_SRC="$ROOT_DIR/images/icon128.png"
fi
if [ -f "$ICON_SRC" ]; then
    APPICON_DIRS="$(find "$PROJ_DIR" -type d -name "AppIcon.appiconset" || true)"
    for icondir in $APPICON_DIRS; do
        echo "==> Tạo AppIcon 1024x1024 trong $icondir từ $ICON_SRC"
        cp "$ICON_SRC" "$icondir/AppIcon-1024.png"
        sips -z 1024 1024 "$icondir/AppIcon-1024.png" --out "$icondir/AppIcon-1024.png" >/dev/null 2>&1 || true
        cat > "$icondir/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "AppIcon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF
    done
fi

# 5. Bật chế độ Phát nhạc nền (UIBackgroundModes = audio) & giao diện tối trong Info.plist của Host App
PLIST_FILES="$(find "$PROJ_DIR" -name "Info.plist" | grep -v "Extension" || true)"
for plist in $PLIST_FILES; do
    echo "==> Cấu hình Info.plist cho $plist"
    /usr/libexec/PlistBuddy -c "Delete :UIBackgroundModes" "$plist" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :UIBackgroundModes array" "$plist"
    /usr/libexec/PlistBuddy -c "Add :UIBackgroundModes:0 string audio" "$plist"
    /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName FUNNYGAME" "$plist" 2>/dev/null || \
        /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string FUNNYGAME" "$plist" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Set :UIViewControllerBasedStatusBarAppearance true" "$plist" 2>/dev/null || \
        /usr/libexec/PlistBuddy -c "Add :UIViewControllerBasedStatusBarAppearance bool true" "$plist" 2>/dev/null || true
done

# 6. Biên dịch bản Release cho iOS (arm64) không cần chứng chỉ trả phí
xcodebuild \
    -project "$XCODEPROJ" \
    -scheme "FUNNYGAME" \
    -configuration Release \
    -sdk iphoneos \
    -derivedDataPath "$DERIVED_DIR" \
    ARCHS="arm64" \
    ONLY_ACTIVE_ARCH=NO \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO \
    AD_HOC_CODE_SIGNING_ALLOWED=YES \
    build

APP_PATH="$(find "$DERIVED_DIR/Build/Products/Release-iphoneos" -maxdepth 1 -name "*.app" | head -n 1)"
if [ -z "$APP_PATH" ]; then
    echo "Không tìm thấy FUNNYGAME.app sau khi build"
    exit 1
fi
echo "==> Đã biên dịch: $APP_PATH"

# 7. Nhúng toàn bộ tài nguyên extension + cầu nối chrome-bridge.js vào FUNNYGAME.app/fg-ext
mkdir -p "$APP_PATH/fg-ext"
cp -R "$EXT_SRC/"* "$APP_PATH/fg-ext/"
cp "$ROOT_DIR/ios/chrome-bridge.js" "$APP_PATH/fg-ext/chrome-bridge.js"

# Cập nhật icon ứng dụng từ icon128.png
if [ -f "$ROOT_DIR/images/icon128.png" ]; then
    cp "$ROOT_DIR/images/icon128.png" "$APP_PATH/Icon.png" 2>/dev/null || true
fi

# 8. Ký Ad-hoc (-) để tương thích ngay với Sideloadly / AltStore / SideStore / TrollStore / ESign
if [ -d "$APP_PATH/PlugIns" ]; then
    for appex in "$APP_PATH/PlugIns/"*.appex; do
        [ -e "$appex" ] || continue
        codesign --force --sign - --timestamp=none "$appex" || true
    done
fi
codesign --force --sign - --timestamp=none "$APP_PATH" || true

# 9. Đóng gói chuẩn Payload/FUNNYGAME.app -> .ipa
mkdir -p "$PAYLOAD_DIR"
cp -R "$APP_PATH" "$PAYLOAD_DIR/FUNNYGAME.app"

mkdir -p "$ROOT_DIR/dist" "$ROOT_DIR/release"
IPA_DIST="$ROOT_DIR/dist/funnygame-ios-v${VERSION}.ipa"
IPA_RELEASE="$ROOT_DIR/release/funnygame-ios.ipa"

(
    cd "$WORK_DIR"
    zip -qr "$IPA_DIST" Payload
)
cp "$IPA_DIST" "$IPA_RELEASE"

rm -rf "$WORK_DIR"
echo "==> HOÀN TẤT: $IPA_DIST ($(wc -c < "$IPA_DIST") bytes)"
echo "==> Bản phát hành cố định: $IPA_RELEASE"
