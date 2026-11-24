#!/usr/bin/env bash
# Builds the site into the given folder (the Pages workflow runs: bash build.sh _site)
set -euo pipefail
out="${1:?usage: build.sh <output-dir>}"
mkdir -p "$out/v2"
cp privacy.html tokens.css styles.css cloud.js manifest.webmanifest icon.svg robots.txt sitemap.xml "$out"/
cp -r core ui schema "$out"/
# Name the offline cache after the commit (plus a timestamp for uncommitted changes), so every deploy refreshes it
ver=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then ver="$ver-$(date +%s)"; fi
sed "s/'pacer-live-dev'/'pacer-live-$ver'/" sw.js > "$out/sw.js" # not sed -i: it differs on macOS
grep -q "'pacer-live-$ver'" "$out/sw.js" || { echo "build.sh: cache name placeholder not found in sw.js" >&2; exit 1; }
# Settings → About shows the version (package.json, the one place it's kept) and the commit, so a bug report can say
# which build it's about: "Version 1.0 · a1b2c3d". A .0 patch is left off, since releases are 1.0, 1.1, …
version=$(sed -n 's/^  "version": "\([^"]*\)",$/\1/p' package.json)
[ -n "$version" ] || { echo "build.sh: no version in package.json" >&2; exit 1; }
if [[ $version =~ ^([0-9]+\.[0-9]+)\.0$ ]]; then version=${BASH_REMATCH[1]}; fi
commit=$(git rev-parse --short HEAD 2>/dev/null || echo dev)
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then commit="$commit-dirty"; fi # a local build with uncommitted changes
sed "s|>Version dev<|>Version $version · $commit<|" index.html > "$out/index.html"
grep -q ">Version $version · $commit<" "$out/index.html" || { echo "build.sh: version placeholder not found in index.html" >&2; exit 1; }
for f in icons/*.b64 fonts/*.b64; do base64 -d "$f" > "$out/$(basename "$f" .b64)"; done
# The v2 preview (/v2/) was merged into the live app: old links forward, and its offline worker removes itself
cat > "$out/v2/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>PunchPace</title><meta http-equiv="refresh" content="0;url=../"><script>location.replace('../')</script><a href="../">PunchPace</a>
HTML
cat > "$out/v2/sw.js" <<'JS'
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const n of await caches.keys())if(n.startsWith('pacer-v2-'))await caches.delete(n);
  await self.clients.claim();await self.registration.unregister();for(const c of await self.clients.matchAll({type:'window'}))c.navigate('../');})()));
JS
