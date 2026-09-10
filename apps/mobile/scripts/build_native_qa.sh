#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
brand="${1:-}"
case "$brand" in barbacue|chelas|barbadog) ;; *) echo "Usage: $0 {barbacue|chelas|barbadog}" >&2; exit 2;; esac
# Flutter 3.41 can reuse device native assets in a simulator build.
# Retain the old generated caches for diagnosis while forcing hooks to rerun.
backup=".dart_tool/native_qa_cache_backup/$(date +%Y%m%d%H%M%S)-$brand"
mkdir -p "$backup"
for cache in .dart_tool/flutter_build .dart_tool/hooks_runner build/native_assets; do
  if [[ -d "$cache" ]]; then mv "$cache" "$backup/$(basename "$cache")"; fi
done
bash scripts/build_brand.sh "$brand" ios-simulator
app="build/ios-$brand-simulator/Build/Products/Debug-iphonesimulator/Runner.app"
python3 scripts/verify_simulator_frameworks.py "$app"
