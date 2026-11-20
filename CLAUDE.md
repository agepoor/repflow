# PunchPace

Audio-guided routine timer (reps, timed blocks, sequences, boxing combos) for people who do the same routines daily or weekly. Installable PWA, works offline, optional sign-in to sync. Open source; the goal is an app that is safe to use and easy to contribute to.

Live: https://agepoor.github.io/repflow/ (the repo is still called `repflow`, the app's old name).

## Commands

No bundler: plain ES modules, served as static files. `package.json` only holds the dev tools (ESLint, Prettier, Vitest; Node 22.12+).

```bash
npm ci                                       # install the dev tools
npm run check                                # lint, format check and tests: run before every commit
npm test                                     # tests only (npm run test:watch while working)
npm run test:rules                           # database rules tests in the Firebase emulator (needs Java 11+; CI runs them too)
npm run format                               # apply Prettier
npm run tokens                               # write tokens.css after changing design/tokens.json
bash build.sh _site                          # build the site (decodes icons/fonts from base64)
python3 -m http.server 8000 -d _site         # run it at http://localhost:8000 (ES modules don't work over file://)
for f in core/*.js ui/*.js cloud.js sw.js; do node --check "$f"; done   # syntax check
node -e "import('./core/schedule.js').then(m=>console.log(Object.keys(m)))"  # load a core module in Node
```

Rebuild `_site` after every change; it is a build output, never commit it.

Prettier formats all code (`npm run format`). Formatting-only commits go in `.git-blame-ignore-revs` so `git blame` skips them; run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once locally.

## Layout

- `index.html`: the page and all views. Loads `tokens.css`, `styles.css` (all CSS) and `ui/main.js`.
- `design/`: the design tokens (`tokens.json`: colours, spacing, type, radii, durations), the script that writes `tokens.css` from them, and the design rules (`design/README.md`).
- `core/`: app logic with no DOM or browser APIs, so it runs in Node. Routine model and migrations (`routine.js`), days, parts of the day, up next and streaks (`schedule.js`), the step list, boxing moves (stable ids) and combo tones (`steps.js`), timer engine (`engine.js`), voice timing (`voice.js`), sync merge and the items the account stores (`merge.js`), durations and dates (`time.js`).
- `ui/`: everything on screen and on the device: views, editor, run screen, settings, history, sound and voice, storage, sync.
- `cloud.js`: Firebase Auth + Realtime Database, loaded only after sign-in or opening Settings. The config in it is public; access is limited by `database.rules.json`. Changing the rules: update `test/rules/` and run `npm run test:rules`.
- `schema/routine.schema.json`: the routine format (JSON Schema), versioned by `cv`. Served with the site.
- `test/`: Vitest tests for `core/`, one file per module (`<module>.test.js`). Tests run in the `Europe/Amsterdam` time zone (`vitest.config.js`) because dates are local time. `test/rules/` tests `database.rules.json` against the Realtime Database emulator (`firebase.json`, `vitest.rules.config.js`, project `demo-punchpace`); `npm test` skips it.
- `eslint.config.js`: lint rules per folder; it reads the element ids from `index.html` because `ui/` uses them as globals.
- `sw.js`: offline cache. `build.sh`: build script (also names the offline cache after the commit). `.github/workflows/deploy.yml`: runs `npm run check` and `npm run test:rules` on pull requests and on `main`, and deploys `main` to GitHub Pages only when both pass. `.github/dependabot.yml`: weekly update PRs for the dev tools and actions (the Firebase SDK version in `cloud.js` and the firebase-tools version in `test:rules` are updated by hand). Secret scanning, Dependabot alerts and CodeQL code scanning are on in the repo settings.

## Rules

- **Pushing to `main` deploys to the live app.** Work on a branch and open a PR; don't push to `main` unless asked.
- `core/` only imports from `core/`. `ui/` calls into `core/`, never the other way round. Pass state into core functions instead of reading globals.
- Functions called from inline `onclick="…"` handlers in `index.html` must be added to the `Object.assign(window, …)` list in `ui/main.js`.
- New or renamed file the app loads: add it to `FILES` in `sw.js`, or the app breaks offline. Don't edit `CACHE`: `build.sh` names it after the commit, so every deploy refreshes the offline cache.
- Never rename storage keys (`rf2_*`) or synced paths (`users/<uid>/v2/…`, `users/<uid>/run`, and the old `users/<uid>/doc`, read once to move an account): it would lose people's data.
- Sync stores one item per routine and workout (`users/<uid>/v2/routines/<id>`, `…/history/<id>`, plus `order`, `parts`, `since`), each with `m`, when it was written. A device asks only for items written since it last looked (`rf2_synced`), so a change to sync should keep downloads to what changed. The rules for which version wins live in `core/merge.js` (`merge`, `newer`); `database.rules.json` indexes `m`.
- Changing the routine data shape: update `schema/routine.schema.json`, add a step to `MIGRATIONS` in `core/routine.js` and bump `CV` (the schema's `cv`), so old routines, exports and other synced devices keep working. `test/schema.test.js` checks that routines are valid. Sync merges across devices (`core/merge.js`), so new fields need a sensible merge.
- Use the design tokens, never hard-coded values: colours by role (`--text-muted`, `--surface`, `--accent-text`, `--routine-blue`), spacing on the 4px grid (`--space-3`), the type scale (`--fs-sm`), `--radius-*`, `--duration-*`. Follow the rules in `design/README.md` (contrast, scales, touch targets); `test/tokens.test.js` checks the colour ones. A light theme is planned, so don't assume dark.
- Repeated inline styles become classes (the utilities at the end of `styles.css`).
- Follow the existing style: Prettier formatting, a short comment at the top of each module saying what it does, comments that explain _why_.
- Update `README.md` when a user-facing feature changes.

## UX and copy

- Guidance guides, it doesn't enforce: features like parts of the day and Up next suggest an order; users can ignore them or switch them off in Settings.
- UI text is plain and short. Step cues say what to do ("Right knee: lift forward, swing out, down"), not exercise jargon.
- Check changes on a phone-sized screen; it's mostly used on Android as an installed app.

## Workflow

- Work comes from GitHub issues (template: What / Why / Notes, one type label + one timing label). Phases are milestones; each issue has one row on the PunchPace board in Notion.
- One issue per session. For anything beyond a small fix, plan first and check the plan before coding.
- Changing `core/`: add or update its tests in `test/`.
- Before finishing: `npm run check`, build, run it, check the change in the browser (including offline if `sw.js` changed).
- Commit subjects describe what changes for the user, in plain words, e.g. "Up next label back on the home screen, quieter outline for the other routines". Reference the issue (`#27`) in the PR.
