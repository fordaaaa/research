#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
configuration=${CONFIGURATION:-Release}
developer_dir=${DEVELOPER_DIR:-/Applications/Xcode-26.3.0.app/Contents/Developer}

cd "$repo_dir"
npm --prefix frontend run build
sh backend/scripts/build_macos_sidecar.sh

DEVELOPER_DIR="$developer_dir" xcodebuild \
  -project macos/Research.xcodeproj \
  -scheme Research \
  -configuration "$configuration" \
  -derivedDataPath macos/build \
  CODE_SIGNING_ALLOWED=NO \
  clean build

app_path="$repo_dir/macos/build/Build/Products/$configuration/Research.app"
resources_path="$app_path/Contents/Resources"

mkdir -p "$resources_path/web"
ditto frontend/dist "$resources_path/web"
ditto backend/dist/research-backend "$resources_path/backend"
codesign --force --sign - "$app_path"
codesign --verify --deep --strict "$app_path"
file "$resources_path/backend/research-backend"
printf 'Built %s\n' "$app_path"
