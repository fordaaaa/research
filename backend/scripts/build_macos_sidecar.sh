#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
backend_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
output_dir=${1:-"$backend_dir/dist"}

cd "$backend_dir"
uv run pyinstaller --noconfirm --clean --distpath "$output_dir" --workpath build research-backend.spec
