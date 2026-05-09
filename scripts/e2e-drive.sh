#!/bin/bash
# Run the sidepanel drive script. Playwright launches its bundled Chromium
# (older + still supports --load-extension), no interference with the user's
# system Chrome or default profile.

set -e

EXT="$(cd "$(dirname "$0")/.." && pwd)/.output/chrome-mv3"

if [ ! -d "$EXT" ]; then
  echo "✗ Built extension missing at $EXT — run 'pnpm build' first."
  exit 1
fi

pkill -f "favewise-e2e-profile" 2>/dev/null || true
sleep 1

mkdir -p test-results

echo "▶ Driving sidepanel with Playwright Chromium…"
node tests/e2e/drive.mjs
STATUS=$?

if [ $STATUS -eq 0 ]; then
  echo "✓ Done. Log: test-results/e2e.log  Screenshots: test-results/*.png"
else
  echo "✗ Drive script exited non-zero ($STATUS). See test-results/e2e.log"
fi

exit $STATUS
