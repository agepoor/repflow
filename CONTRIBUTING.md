# Contributing to PunchPace

Thanks for helping. PunchPace is a small project with one maintainer, so this page tries to answer the questions you'd otherwise have to ask: how to set up, how a change gets in, and the few rules that keep the app safe and working offline.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security problem? Don't open an issue: report it privately as [SECURITY.md](SECURITY.md) describes.

## How a change gets in

1. **Start from an issue.** Pick an open [issue](https://github.com/agepoor/repflow/issues) (`good first issue` ones are a good start), or open one first for anything that isn't a small fix with the _Planned change_ template: what's wrong or missing, what you'd change, and when it's done. That way we agree on the change before you spend time on it. Comment on the issue so others know you're on it.
2. **Fork and branch.** Fork the repo and make a branch named after the issue: `<issue number>-<short name>`, for example `37-touch-targets`.
3. **Keep it small.** One issue per pull request. Ideas that come up along the way become new issues, not extra changes in this one.
4. **Check before you push.** `npm run check` must pass (see [Checks](#checks)), and try the change in the browser, on a phone-sized screen too: most people use PunchPace as an installed app on Android.
5. **Open a pull request** against `main`, with `Fixes #<issue number>` in the description so merging closes the issue. The template asks what changes for the user and how you tested it, with a short checklist.
6. **Review.** CI runs the same checks and comments a preview link (pull requests from forks don't get a preview). The maintainer reviews and merges. Every merge to `main` goes live at https://punchpace.app, so nothing goes in without review.

Contributions are accepted under the project's licence, [Apache-2.0](LICENSE).

## Set up

You need git, bash, Python 3 and Node 22.12 or newer. There's no bundler: the app is plain JavaScript modules served as static files, and Node is only there for the checks.

```bash
git clone https://github.com/<your-name>/repflow.git
```

```bash
cd repflow
```

```bash
npm ci
```

```bash
bash build.sh _site
```

```bash
python3 -m http.server 8000 -d _site
```

Open http://localhost:8000. Run `bash build.sh _site` again after every change; `_site` is build output, so don't commit it. Opening `index.html` straight from disk doesn't work, because browsers don't load JavaScript modules over `file://`.

Everything works locally except signing in, which only works on the app's own addresses. To work on sign-in and sync, see [Your own Firebase](#your-own-firebase).

## Checks

```bash
npm run check
```

This runs ESLint, the Prettier format check and the tests. Run it before every commit; CI runs it too and a red check blocks the merge.

- `npm run test:watch` reruns the tests on every save.
- `npm run format` fixes the formatting. Prettier formats all code and Markdown, so don't format by hand.
- `npm run test:e2e` builds the site and runs a browser test at phone size: the app loads without errors, a new routine can be made, started and stopped, the app opens offline, and a workout can be stopped from a second device (with a stand-in for sync, `test/e2e/fake-cloud.js`). Run it when you change `ui/`, `index.html` or `sw.js`; CI runs it on every pull request. The first time, install its browser with `npx playwright install chromium`.
- `npm run test:rules` tests the database security rules in the Firebase emulator (needs Java 11 or newer). Run it when you change `database.rules.json`; CI runs it on every pull request, and after a merge to `main` publishes the rules just before the app.
- `npm run tokens` writes `tokens.css` after you change `design/tokens.json`.

Changed something in `core/`? Add or update its tests in `test/` (one file per module).

## Where things are

- `index.html`, `styles.css`: the page, all its views and all its styles.
- `core/`: the app's logic (routines, schedule, timer, voice timing, sync merging). No DOM or browser APIs, so it runs and is tested in Node. `core/` only imports from `core/`.
- `ui/`: everything on screen and on the device: views, editor, run screen, settings, sound, storage. It calls into `core/`, never the other way round.
- `cloud.js`: sign-in and sync (Firebase), loaded only when needed.
- `design/`: the design tokens (`tokens.json`) and the design rules ([`design/README.md`](design/README.md)).
- `schema/routine.schema.json`: the routine format.
- `test/`: Vitest tests for `core/`, `test/rules/` for the database rules and `test/e2e/` for the browser test.
- `sw.js`: the offline cache. `build.sh`: builds the site.

## Rules that are easy to miss

The checks catch some of these; the rest break the app for real users if missed.

- **No inline code.** The security policy blocks `onclick="…"`, other inline handlers and `<script>` blocks. Buttons name an action instead (`data-on="click:startRun"`), registered in `ui/main.js`; see `ui/actions.js`.
- **New external host** (a script, an API): add it to the security policy in both `firebase.json` and the `<meta>` tag in `index.html`. A test checks they match.
- **New file the app loads:** add it to `FILES` in `sw.js`, or the app breaks offline.
- **Never rename storage keys** (`rf2_*`) or synced paths (`users/<uid>/…`): people would lose their data.
- **Syncing something new?** The database only accepts the keys, types and sizes listed in `database.rules.json`. Add the new field there with a test in `test/rules/`, or its writes are refused.
- **Changing the routine format:** update `schema/routine.schema.json`, add a migration in `core/routine.js` and bump the version, so old routines, exports and other devices keep working.
- **Design tokens, not hard-coded values:** colours by role (`--text-muted`), spacing on the 4px grid (`--space-3`), the type scale (`--fs-sm`). A light theme is planned, so don't assume dark.
- **Plain, short text.** Step cues say what to do ("Right knee: lift forward, swing out, down"), not exercise jargon.
- **User-facing change:** update the [README](README.md) if it describes it.

[`CLAUDE.md`](CLAUDE.md) has the full list, with the reasons. It's written for AI coding assistants too, so if you use one, it already knows these rules.

## Code style

- Prettier decides the formatting.
- Each module starts with a short comment saying what it does. Comments explain _why_, not what the next line does.
- Follow the style of the code around your change.

## Commit messages

Write the subject as what changes for the user, in plain words, for example:

> Up next label back on the home screen, quieter outline for the other routines

Not `fix bug` or `update ui.js`. For a change users don't see, say what it makes possible ("Tests for the database rules run in CI"). Small commits are welcome; the pull request description says how they fit together.

## Releases

The maintainer cuts a release at the end of each release milestone. From launch on, releases are numbered 1.0, 1.1, 1.2…: the app isn't a library, so there's no need for strict semantic versioning. The version lives in one place, `version` in `package.json`; `build.sh` writes it and the commit into the site, and Settings → About shows both ("Version 1.0 · a1b2c3d"). The routine format has its own version (`cv` in `schema/routine.schema.json`), separate from the app's.

1. On a branch, set the new version: `npm version 1.1.0 --no-git-tag-version` (it updates `package.json` and `package-lock.json`). Open a pull request ("Version 1.1") and merge it; the deploy then shows the new version.
2. Tag the merge commit on `main` with the version, without the `.0` patch: `git tag v1.1 <commit>`, then `git push origin v1.1`.
3. On GitHub, **Releases → Draft a new release**, pick the tag and click **Generate release notes**. Pull request titles already say what changes for the user, so the notes need only a light edit: group them under what's new and what's fixed, drop the ones users don't notice (dependency updates, CI), and credit anyone who reported a security problem, if they'd like that ([SECURITY.md](SECURITY.md)). Publish it.

## Your own Firebase

Sign-in and sync use Firebase. The config in `cloud.js` is public; access is limited by `database.rules.json`, and the project only accepts requests from the app's own addresses. To run sign-in and sync yourself, use your own Firebase project:

1. Create a project with a Realtime Database (locked mode) and paste `database.rules.json` into its Rules.
2. Authentication: turn on Google, and GitHub with a GitHub OAuth app whose callback is `https://<authDomain>/__/auth/handler`. Add `localhost` and your own domain under Settings → Authorized domains.
3. Project settings → add a Web app and paste its config into `FIREBASE_CONFIG` in `cloud.js` (it must include `databaseURL`). Set `authDomain` to `<project-id>.firebaseapp.com`, or to your own domain if you host the app on Firebase Hosting.
4. Set up App Check with reCAPTCHA Enterprise and put its site key in `APP_CHECK`. When testing locally, set `APP_CHECK_DEBUG` to `true` and add the token it prints under App Check → Manage debug tokens.

Sign-in and sync work on the free Spark plan; daily database backups need the Blaze plan.

To test without a Firebase project, `EMULATOR` in `cloud.js` points sign-in and the database at the Firebase Emulator Suite.

Don't commit your own config: pull requests keep the project's.
