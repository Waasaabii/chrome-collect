#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

APP_VERSION="${CHROME_COLLECT_VERSION:-${GITHUB_REF_NAME:-$(node -p "require('./package.json').version")}}"
APP_VERSION="${APP_VERSION#v}"
TARGET_ARCH="${CHROME_COLLECT_MACOS_ARCH:-$(uname -m)}"

case "$TARGET_ARCH" in
  arm64|aarch64)
    GO_ARCH="arm64"
    PKG_SUFFIX="arm64"
    ;;
  x86_64|amd64)
    GO_ARCH="amd64"
    PKG_SUFFIX="x64"
    ;;
  *)
    echo "Unsupported macOS architecture: $TARGET_ARCH" >&2
    exit 1
    ;;
esac

PKG_NAME="${CHROME_COLLECT_MACOS_PKG_NAME:-chrome-collect-macos-${PKG_SUFFIX}.pkg}"

bun run build:web

STAGE_DIR="$ROOT_DIR/dist/macos-stage-${PKG_SUFFIX}"
APP_DIR="$STAGE_DIR/Applications/Chrome Collect"
HOST_DIR="$STAGE_DIR/Library/Google/Chrome/NativeMessagingHosts"

rm -rf "$STAGE_DIR"
mkdir -p "$APP_DIR/resources/web" "$HOST_DIR"

pushd "$ROOT_DIR/packages/tray" >/dev/null
GOOS=darwin GOARCH="$GO_ARCH" CGO_ENABLED=1 go build -ldflags="-s -w -X main.Version=$APP_VERSION" -o "$APP_DIR/chrome-collect-desktop" ./cmd/desktop-app
GOOS=darwin GOARCH="$GO_ARCH" go build -ldflags="-s -w -X main.Version=$APP_VERSION" -o "$APP_DIR/chrome-collect-native-host" ./cmd/native-host
popd >/dev/null

cp -R packages/web/dist/. "$APP_DIR/resources/web/"
cp scripts/install/macos/com.chrome_collect.native_host.json "$HOST_DIR/com.chrome_collect.native_host.json"

pkgbuild \
  --root "$STAGE_DIR" \
  --identifier "com.chrome-collect.desktop" \
  --version "$APP_VERSION" \
  --install-location "/" \
  "$ROOT_DIR/dist/$PKG_NAME"
