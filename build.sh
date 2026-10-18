#!/usr/bin/env bash
# Builds the site into the given folder. The Pages workflow on main runs this for the v2 preview (/v2/).
set -euo pipefail
out="${1:?usage: build.sh <output-dir>}"
mkdir -p "$out"
cp index.html cloud.js manifest.webmanifest sw.js icon.svg "$out"/
for f in icons/*.b64; do base64 -d "$f" > "$out/$(basename "$f" .b64)"; done
