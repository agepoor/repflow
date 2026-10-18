# Workout Pacer

*Think once. Move without thinking.*

Visual, audio-guided counter & timer for burpees, rep/count-based exercises and boxing drills.

- Blocks: reps/counts (guided tempo or tap), timed, boxing combo call-outs, rest
- Rounds, rest between rounds, last-round-only finishers
- Per-block display: cue + number / cue only / number only
- Beeps, voice coach (any browser language), vibration, keep-screen-on
- Installable PWA, works offline; JSON import/export
- Sign in with Google or GitHub to sync routines, history and a running workout across devices

**Live:** https://agepoor.github.io/repflow/ — open in Chrome on Android → ⋮ → *Install app*.

**Preview:** https://agepoor.github.io/repflow/v2/ — branch `v2`, redeploys on every push and is labelled "v2"; merged into `main` when ready. Same origin, so it shares the device data (storage keys `rf2_*`) and the account with the live app.

### Account, sync and a persistent timer (since v2)

- **Sign in with Google or GitHub** (Firebase Authentication) instead of a gist token. Routines and history sync through Firebase Realtime Database (`users/<uid>/doc`, merged on every device); audio settings stay per device.
- **Persistent timer:** a workout is stored as start times on the wall clock, so it keeps going through reloads, a locked screen or a closed app, and picks up at the right moment.
- **Live on all devices:** the running workout (`users/<uid>/run`) shows on every signed-in device. Sound plays on the device you last controlled it from; the others follow silently (*Play here* moves the sound).
- `cloud.js` loads Firebase only after signing in (or opening Settings). Paste the web-app config into `FIREBASE_CONFIG`; those values are public identifiers, access is limited by `database.rules.json`.

Firebase setup: create a project → Realtime Database (locked mode) → paste `database.rules.json` into Rules → Authentication: enable Google, and GitHub with a GitHub OAuth app (callback `https://<project-id>.firebaseapp.com/__/auth/handler`) → Authentication → Settings → Authorized domains: add `agepoor.github.io` → Project settings → add a Web app and copy its config (it must include `databaseURL`).

Icons are stored base64 in `icons/` and decoded by `build.sh`, which the Pages workflow runs for `/` (main) and `/v2/` (branch `v2`).
