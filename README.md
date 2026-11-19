# PunchPace (formerly Workout Pacer)

_Think once. Move without thinking._

Visual, audio-guided counter & timer for burpees, rep/count-based exercises and boxing drills.

- Blocks: reps/counts (guided tempo or tap), timed, sequence (steps in a fixed order, e.g. kata, flows or breathing; each step gets the block's time, its own time `@6` or waits for a tap `@tap`), boxing combo call-outs, rest
- Rounds, rest between rounds (auto-start, or wait for a tap before each round or each block), first-round-only warm-ups, last-round-only finishers
- Days and part of day per routine: today's routines on top, grouped by Morning / Midday / Evening / Anytime once any routine has a part of day; each part shows its times and the current one is marked _now_; one routine is labelled _Up next_ and the others left for today get a quieter outline (a guide, any order is fine; Settings → Parts of the day sets when Midday and Evening start, or switches the guidance off; synced), and the done screen offers what's left as _Next_ (current part of the day first, then Anytime, then missed earlier parts); skip for today only, the rest as compact rows (+ adds one to today, this time only); a quiet note when nothing is planned; reorder in the Order view (all routines in their real order)
- Week view: this week's schedule per day with done, added, skipped and not-done routines (also workouts done on other days), planned and done time per day, and a key; Schedule shows the usual week from the days set in each routine only; tap a routine to change its days
- Per-block display: cue + number / cue only / number only
- Beeps, voice coach (any browser language; built-in phrases in en/nl/es/de/fr), vibration, keep-screen-on. A routine can have its own sound & voice (beeps, voice, language, speed…) instead of Settings
- When the voice can't keep up (short count length, long combos), the editor says so and the run screen shows it. Guided counts that are too fast to say fall back to rep numbers, then beeps. Each device learns how long its voice takes: per phrase, and for new phrases from that voice's start-up time and speed
- Boxing calls per block: _Voice_ (default; calls wait for the voice when it's too slow), _Voice, tones when too fast_ (said faster, up to 1.5×, otherwise tones + call on screen) or _Tones only_ (exact timing; keeps playing with the screen off on Android). Move tones: one per move, the same in every routine (jab and cross steady, hooks fall, uppercuts rise, lead hand low, rear hand high; slip, duck and roll a soft whoosh; other moves the next free tone, up to 8 sounds, then a tick). They play with Beeps off too. The editor colors each move by its tone; ▶ plays a combo
- Minimize a running workout (⌄ or Back): it shrinks into its own card on the home screen, which shows it live (step, time, round, progress, pause); tap to expand. Keep using the app meanwhile; one workout at a time
- Installable PWA, works offline; JSON import/export
- Sign in with Google or GitHub to sync routines, history and a running workout across devices

**Live:** https://agepoor.github.io/repflow/ — open in Chrome on Android → ⋮ → _Install app_.

**Brand:** PunchPace logo; display type [Saira](https://github.com/Omnibus-Type/Saira) (SIL Open Font License 1.1, see `fonts/OFL.txt`).

### Account, sync and a persistent timer (since v2)

- **Sign in with Google or GitHub** (Firebase Authentication) instead of a gist token. Routines and history sync through Firebase Realtime Database (`users/<uid>/doc`, merged on every device); audio settings stay per device.
- **Persistent timer:** a workout is stored as start times on the wall clock, so it keeps going through reloads, a locked screen or a closed app, and picks up at the right moment. In the background (another app, screen off) the beeps (and _Tones only_ combo calls) are queued on the audio clock and keep playing on Android and computers; the voice coach only speaks while the app is open, and names the current step when you come back.
- **Account:** add or remove a sign-in method (Google / GitHub), sign out (optionally clearing the device) or delete the account with all synced data. A device that last synced with another account asks before mixing data.
- **Live on all devices:** the running workout (`users/<uid>/run`) shows on every signed-in device. Sound plays on the device you last controlled it from; the others follow silently (_Play here_ moves the sound).
- `cloud.js` loads Firebase only after signing in (or opening Settings). Paste the web-app config into `FIREBASE_CONFIG`; those values are public identifiers, access is limited by `database.rules.json`.

Firebase setup: create a project → Realtime Database (locked mode) → paste `database.rules.json` into Rules → Authentication: enable Google, and GitHub with a GitHub OAuth app (callback `https://<project-id>.firebaseapp.com/__/auth/handler`) → Authentication → Settings → Authorized domains: add `agepoor.github.io` → Project settings → add a Web app and copy its config (it must include `databaseURL`).

### Code

Plain ES modules, no bundler: `index.html` holds the page and styles and loads `ui/main.js`.

- `core/`: the app's logic without any DOM or browser UI, so it can be tested on its own: the routine model and migrations (`routine.js`), days, parts of the day and streaks (`schedule.js`), the step list a routine plays and combo tones (`steps.js`), the timer engine and its cues (`engine.js`), voice timing and spoken phrases (`voice.js`), sync merging (`merge.js`), durations and dates (`time.js`). Core modules only import each other.
- `ui/`: everything on screen and on the device: storage, sound & voice, views, editor, run screen, settings, history, sync. UI modules call into `core/`, never the other way round. Functions called from the page's `onclick="…"` handlers are put on `window` in `ui/main.js`.
- Storage keys stay `rf2_*` (renaming them would lose people's data). A new module file goes into `FILES` in `sw.js` (with a new `CACHE` name) so the app keeps working offline.

Icons are stored base64 in `icons/` and decoded by `build.sh`, which the Pages workflow runs on every push to `main`. The former `/v2/` preview forwards to the live app.

### Checks

Node 22.12 or newer. `npm install` once, then `npm run check` runs everything: ESLint (`npm run lint`), Prettier (`npm run format:check`; `npm run format` fixes it) and the Vitest tests for `core/` (`npm test`, or `npm run test:watch` while working). The app itself needs no install or build step. Prettier covers new files (tests, configs) for now; the existing app code keeps its compact style (see `.prettierignore`).
