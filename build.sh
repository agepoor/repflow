#!/usr/bin/env bash
# Builds the site into the given folder: bash build.sh <output-dir> [label]
# The Pages workflow on main builds main at / and branch v2 at /v2/ with label "v2" (home-screen name "Pacer v2").
set -euo pipefail
out="${1:?usage: build.sh <output-dir> [label]}"
label="${2:-}"
mkdir -p "$out"
cp index.html cloud.js manifest.webmanifest sw.js icon.svg "$out"/
for f in icons/*.b64; do base64 -d "$f" > "$out/$(basename "$f" .b64)"; done
if [ -n "$label" ]; then
  sed -i -e "s/\"name\": \"Workout Pacer\"/\"name\": \"Workout Pacer $label\"/" -e "s/\"short_name\": \"Pacer\"/\"short_name\": \"Pacer $label\"/" "$out/manifest.webmanifest"
fi
