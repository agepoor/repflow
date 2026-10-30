# PunchPace (formerly Workout Pacer)

*Think once. Move without thinking.*

Visual, audio-guided counter & timer for burpees, rep/count-based exercises and boxing drills.

- Blocks: reps/counts (guided tempo or tap), timed, sequence (steps in a fixed order, e.g. kata, flows or breathing; each step gets the block's time, its own time `@6` or waits for a tap `@tap`), boxing combo call-outs, rest
- Rounds, rest between rounds (auto-start, or wait for a tap before each round or each block), first-round-only warm-ups, last-round-only finishers
- Days per routine: today's routines on top (highlighted until done, skip for today only), the rest as compact rows (+ adds one to today, this time only); a quiet note when nothing is planned; reorder in the Order view (all routines in their real order)
- Week view: this week's schedule per day with done, added, skipped and not-done routines (also workouts done on other days), planned and done time per day, and a key; Schedule shows the usual week from the days set in each routine only; tap a routine to change its days
- Per-block display: cue + number / cue only / number only
- Beeps, voice coach (any browser language, per routine if you like; built-in phrases in en/nl/es/de/fr), vibration, keep-screen-on
- When the voice can't keep up (short count length, long combos), the editor says so and the run screen shows it. Guided counts that are too fast to say fall back to rep numbers, then beeps. Each device learns how long its voice takes per phrase
- Boxing calls per block: *Voice* (default; calls wait for the voice when it's too slow), *Voice, tones when too fast* (said faster, up to 1.5×, otherwise tones + call on screen) or *Tones only* (exact timing; keeps playing with the screen off on Android). Move tones: one per move, the same in every routine (jab and cross steady, hooks fall, uppercuts rise, lead hand low, rear hand high; slip, duck and roll a soft whoosh; other moves the next free tone, up to 8 sounds, then a tick). They play with Beeps off too. The editor colors each move by its tone; ▶ plays a combo
- Minimize a running workout (⌄ or Back): it shrinks into its own card on the home screen, which shows it live (step, time, round, progress, pause); tap to expand. Keep using the app meanwhile; one workout at a time
- Installable PWA, works offline; JSON import/export
- Sign in with Google or GitHub to sync routines, history and a running workout across devices

**Live:** https://agepoor.github.io/repflow/ — open in Chrome on Android → ⋮ → *Install app*.

**Brand:** PunchPace logo; display type [Saira](https://github.com/Omnibus-Type/Saira) (SIL Open Font License 1.1, see `fonts/OFL.txt`).

### Account, sync and a persistent timer (since v2)

- **Sign in with Google or GitHub** (Firebase Authentication) instead of a gist token. Routines and history sync through Firebase Realtime Database (`users/<uid>/doc`, merged on every device); audio settings stay per device.
- **Persistent timer:** a workout is stored as start times on the wall clock, so it keeps going through reloads, a locked screen or a closed app, and picks up at the right moment. In the background (another app, screen off) the beeps (and *Tones only* combo calls) are queued on the audio clock and keep playing on Android and computers; the voice coach only speaks while the app is open, and names the current step when you come back.
- **Account:** add or remove a sign-in method (Google / GitHub), sign out (optionally clearing the device) or delete the account with all synced data. A device that last synced with another account asks before mixing data.
- **Live on all devices:** the running workout (`users/<uid>/run`) shows on every signed-in device. Sound plays on the device you last controlled it from; the others follow silently (*Play here* moves the sound).
- `cloud.js` loads Firebase only after signing in (or opening Settings). Paste the web-app config into `FIREBASE_CONFIG`; those values are public identifiers, access is limited by `database.rules.json`.

Firebase setup: create a project → Realtime Database (locked mode) → paste `database.rules.json` into Rules → Authentication: enable Google, and GitHub with a GitHub OAuth app (callback `https://<project-id>.firebaseapp.com/__/auth/handler`) → Authentication → Settings → Authorized domains: add `agepoor.github.io` → Project settings → add a Web app and copy its config (it must include `databaseURL`).

Icons are stored base64 in `icons/` and decoded by `build.sh`, which the Pages workflow runs on every push to `main`. The former `/v2/` preview forwards to the live app.
