#!/usr/bin/env bash
set -euo pipefail

node scripts/db/import-whisky-catalog.mjs \
  "/Users/darren/Desktop/Whisky image/whisky_catalog_final.xlsx" \
  "/Users/darren/Desktop/vibe cording/liquor v.Codex/Whisky-image" \
  "120"
