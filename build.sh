#!/usr/bin/env bash
# Builds the site into the given folder (the Pages workflow runs: bash build.sh _site)
set -euo pipefail
out="${1:?usage: build.sh <output-dir>}"
mkdir -p "$out/v2"
cp index.html cloud.js manifest.webmanifest sw.js icon.svg "$out"/
for f in icons/*.b64; do base64 -d "$f" > "$out/$(basename "$f" .b64)"; done
# The v2 preview (/v2/) was merged into the live app: old links forward, and its offline worker removes itself
cat > "$out/v2/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>PunchPace</title><meta http-equiv="refresh" content="0;url=../"><script>location.replace('../')</script><a href="../">PunchPace</a>
HTML
cat > "$out/v2/sw.js" <<'JS'
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const n of await caches.keys())if(n.startsWith('pacer-v2-'))await caches.delete(n);
  await self.clients.claim();await self.registration.unregister();for(const c of await self.clients.matchAll({type:'window'}))c.navigate('../');})()));
JS
