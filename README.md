# Workout Pacer

*Think once. Move without thinking.*

Visual, audio-guided counter & timer for burpees, rep/count-based exercises and boxing drills.

- Blocks: reps/counts (guided tempo or tap), timed, boxing combo call-outs, rest
- Rounds, rest between rounds (auto-start, or wait for a tap before each round or each block), first-round-only warm-ups, last-round-only finishers
- Days per routine: today's routines on top (highlighted until done, skip for today only), the rest as compact rows; dragging any routine shows the whole list so it can go anywhere
- Per-block display: cue + number / cue only / number only
- Beeps, voice coach (any browser language, per routine if you like; built-in phrases in en/nl/es/de/fr), vibration, keep-screen-on
- Installable PWA, works offline; JSON import/export
- Sign in with Google or GitHub to sync routines, history and a running workout across devices

**Live:** https://agepoor.github.io/repflow/ — open in Chrome on Android → ⋮ → *Install app*.

### Account, sync and a persistent timer (since v2)

- **Sign in with Google or GitHub** (Firebase Authentication) instead of a gist token. Routines and history sync through Firebase Realtime Database (`users/<uid>/doc`, merged on every device); audio settings stay per device.
- **Persistent timer:** a workout is stored as start times on the wall clock, so it keeps going through reloads, a locked screen or a closed app, and picks up at the right moment.
- **Account:** add or remove a sign-in method (Google / GitHub), sign out (optionally clearing the device) or delete the account with all synced data. A device that last synced with another account asks before mixing data.
- **Live on all devices:** the running workout (`users/<uid>/run`) shows on every signed-in device. Sound plays on the device you last controlled it from; the others follow silently (*Play here* moves the sound).
- `cloud.js` loads Firebase only after signing in (or opening Settings). Paste the web-app config into `FIREBASE_CONFIG`; those values are public identifiers, access is limited by `database.rules.json`.

Firebase setup: create a project → Realtime Database (locked mode) → paste `database.rules.json` into Rules → Authentication: enable Google, and GitHub with a GitHub OAuth app (callback `https://<project-id>.firebaseapp.com/__/auth/handler`) → Authentication → Settings → Authorized domains: add `agepoor.github.io` → Project settings → add a Web app and copy its config (it must include `databaseURL`).

Icons are stored base64 in `icons/` and decoded by `build.sh`, which the Pages workflow runs on every push to `main`. The former `/v2/` preview forwards to the live app.
