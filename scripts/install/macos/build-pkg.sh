#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

APP_VERSION="${CHROME_COLLECT_VERSION:-${GITHUB_REF_NAME:-$(node -p "require('./package.json').version")}}"
APP_VERSION="${APP_VERSION#v}"

bun run build:web

STAGE_DIR="$ROOT_DIR/dist/macos-stage"
APP_DIR="$STAGE_DIR/Applications/Chrome Collect"
HOST_DIR="$STAGE_DIR/Library/Google/Chrome/NativeMessagingHosts"

rm -rf "$STAGE_DIR"
mkdir -p "$APP_DIR/resources/web" "$HOST_DIR"

GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 go build -ldflags="-s -w -X main.Version=$APP_VERSION" -o "$APP_DIR/chrome-collect-desktop" ./packages/tray/cmd/desktop-app
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w -X main.Version=$APP_VERSION" -o "$APP_DIR/chrome-collect-native-host" ./packages/tray/cmd/native-host

cp -R packages/web/dist/. "$APP_DIR/resources/web/"
cp scripts/install/macos/com.chrome_collect.native_host.json "$HOST_DIR/com.chrome_collect.native_host.json"

pkgbuild \
  --root "$STAGE_DIR" \
  --identifier "com.chrome-collect.desktop" \
  --version "$APP_VERSION" \
  --install-location "/" \
  "$ROOT_DIR/dist/chrome-collect-macos.pkg"
