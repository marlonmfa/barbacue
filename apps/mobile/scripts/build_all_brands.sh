#!/usr/bin/env bash
set -euo pipefail

platform="${1:-android}"
script_dir="$(cd "$(dirname "$0")" && pwd)"

for brand in barbacue chelas barbadog; do
  echo "==> $brand ($platform)"
  "$script_dir/build_brand.sh" "$brand" "$platform"
done

