# Workout Pacer

*Think once. Move without thinking.*

Visual, audio-guided counter & timer for burpees, rep/count-based exercises and boxing drills.

- Blocks: reps/counts (guided tempo or tap), timed, boxing combo call-outs, rest
- Rounds, rest between rounds, last-round-only finishers
- Per-block display: cue + number / cue only / number only
- Beeps, voice coach (any browser language), vibration, keep-screen-on
- Installable PWA, works offline; routines stored locally, JSON import/export

**Live:** https://agepoor.github.io/repflow/ — open in Chrome on Android → ⋮ → *Install app*.

**v2 preview (this branch):** https://agepoor.github.io/repflow/v2/ — redeploys on every push to `v2`; the live app is untouched. v2 keeps its own data (storage keys `rf2_*`, gist “Workout Pacer v2 sync”) and copies v1 routines, settings and history once on first open. Merge into `main` when ready.

Icons are stored base64 in `icons/` and decoded by `build.sh`, which the Pages workflow runs for `/v2/`.
