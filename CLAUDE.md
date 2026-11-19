# PunchPace

Audio-guided routine timer (reps, timed blocks, sequences, boxing combos) for people who do the same routines daily or weekly. Installable PWA, works offline, optional sign-in to sync. Open source; the goal is an app that is safe to use and easy to contribute to.

Live: https://agepoor.github.io/repflow/ (the repo is still called `repflow`, the app's old name).

## Commands

There is no package.json, bundler, linter or test suite. Plain ES modules, served as static files.

```bash
bash build.sh _site                          # build the site (decodes icons/fonts from base64)
python3 -m http.server 8000 -d _site         # run it at http://localhost:8000 (ES modules don't work over file://)
for f in core/*.js ui/*.js cloud.js sw.js; do node --check "$f"; done   # syntax check
node -e "import('./core/schedule.js').then(m=>console.log(Object.keys(m)))"  # load a core module in Node
```

Rebuild `_site` after every change; it is a build output, never commit it.

## Layout

- `index.html`: the page, all views and all CSS (theme tokens are the CSS variables in `:root`). Loads `ui/main.js`.
- `core/`: app logic with no DOM or browser APIs, so it runs in Node. Routine model and migrations (`routine.js`), days, parts of the day, up next and streaks (`schedule.js`), the step list and combo tones (`steps.js`), timer engine (`engine.js`), voice timing (`voice.js`), sync merge (`merge.js`), durations and dates (`time.js`).
- `ui/`: everything on screen and on the device: views, editor, run screen, settings, history, sound and voice, storage, sync.
- `cloud.js`: Firebase Auth + Realtime Database, loaded only after sign-in or opening Settings. The config in it is public; access is limited by `database.rules.json`.
- `sw.js`: offline cache. `build.sh`: build script. `.github/workflows/deploy.yml`: deploys to GitHub Pages.

## Rules

- **Pushing to `main` deploys to the live app.** Work on a branch and open a PR; don't push to `main` unless asked.
- `core/` only imports from `core/`. `ui/` calls into `core/`, never the other way round. Pass state into core functions instead of reading globals.
- Functions called from inline `onclick="…"` handlers in `index.html` must be added to the `Object.assign(window, …)` list in `ui/main.js`.
- New or renamed module file: add it to `FILES` in `sw.js` **and** bump `CACHE` (`pacer-live-N`), or the app breaks offline. Also bump `CACHE` when changing cached files you want users to get right away.
- Never rename storage keys (`rf2_*`) or synced paths (`users/<uid>/doc`, `users/<uid>/run`): it would lose people's data.
- Changing the routine data shape: migrate older data in `core/routine.js` and keep old routines, exports and other synced devices working. Sync merges across devices (`core/merge.js`), so new fields need a sensible merge.
- Use the theme variables (`--bg`, `--surf`, `--tx`, `--acc`, …) instead of hard-coded colors. A light theme is planned, so don't assume dark.
- Follow the existing style: compact code, a short comment at the top of each module saying what it does, comments that explain *why*.
- Update `README.md` when a user-facing feature changes.

## UX and copy

- Guidance guides, it doesn't enforce: features like parts of the day and Up next suggest an order; users can ignore them or switch them off in Settings.
- UI text is plain and short. Step cues say what to do ("Right knee: lift forward, swing out, down"), not exercise jargon.
- Check changes on a phone-sized screen; it's mostly used on Android as an installed app.

## Workflow

- Work comes from GitHub issues (template: What / Why / Notes, one type label + one timing label). Phases are milestones; each issue has one row on the PunchPace board in Notion.
- One issue per session. For anything beyond a small fix, plan first and check the plan before coding.
- Before finishing: build, run it, check the change in the browser (including offline if `sw.js` changed), run the syntax check.
- Commit subjects describe what changes for the user, in plain words, e.g. "Up next label back on the home screen, quieter outline for the other routines". Reference the issue (`#27`) in the PR.
