#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
configuration=${CONFIGURATION:-Release}
developer_dir=${DEVELOPER_DIR:-/Applications/Xcode-26.3.0.app/Contents/Developer}

cd "$repo_dir"
sh backend/scripts/build_macos_sidecar.sh

DEVELOPER_DIR="$developer_dir" xcodebuild \
  -project macos/Research.xcodeproj \
  -scheme Research \
  -configuration "$configuration" \
  -derivedDataPath macos/build \
  ARCHS=arm64 \
  CODE_SIGNING_ALLOWED=NO \
  clean build

app_path="$repo_dir/macos/build/Build/Products/$configuration/Notaeo.app"
resources_path="$app_path/Contents/Resources"

rm -rf "$resources_path/web" "$resources_path/backend"
ditto backend/dist/research-backend "$resources_path/backend"
codesign --force --sign - "$app_path"
codesign --verify --deep --strict "$app_path"
file "$resources_path/backend/research-backend"
lipo "$resources_path/backend/research-backend" -verify_arch arm64
printf 'Built %s\n' "$app_path"
