#!/bin/bash
# Links dev/harness into the per-user CEP extensions folder on macOS and reports PlayerDebugMode.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
dst="$HOME/Library/Application Support/Adobe/CEP/extensions/ru.cloud.brandkit.dev"
mkdir -p "$(dirname "$dst")"
ln -sfn "$repo/dev/harness" "$dst"
echo "linked: $dst -> $repo/dev/harness"
for v in 11 12; do
  mode="$(defaults read com.adobe.CSXS.$v PlayerDebugMode 2>/dev/null || true)"
  if [ "$mode" = "1" ]; then echo "CSXS.$v PlayerDebugMode=1"
  else echo "CSXS.$v PlayerDebugMode is not set. Run: defaults write com.adobe.CSXS.$v PlayerDebugMode 1"; fi
done
