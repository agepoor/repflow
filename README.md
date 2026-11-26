# PunchPace

_Think once. Move without thinking._

PunchPace talks you through the routines you repeat every day or week, from a morning stretch to a boxing session, so you can keep your eyes off the screen and just move.

<p>
  <img src="docs/screenshots/home.png" width="200" alt="Home screen: today's routines grouped by morning, midday and evening, with the next one marked Up next">
  <img src="docs/screenshots/run.jpg" width="200" alt="Run screen during a boxing round: the combo 1-2-5-2 in large type above a countdown ring at 2:54">
  <img src="docs/screenshots/editor.png" width="200" alt="Editor: a boxing block's combo pool, each move shown in the colour of its tone">
  <img src="docs/screenshots/week.png" width="200" alt="Week view: the routines planned for each day, with the done ones ticked">
</p>

## Try it

Open **https://punchpace.app** in any modern browser, on a phone, tablet or computer. You can install it like an app, and it works offline from then on:

- **Android:** in Chrome, ⋮ → _Install app_.
- **iPhone and iPad:** in Safari, the share button → _Add to Home Screen_.
- **Computer:** in Chrome or Edge, the install button in the address bar.

You don't need an account. Without one, everything stays on your device. Sign in with Google or GitHub only if you want your routines and workouts on more than one device.

## What it does

- **Guides you by voice:** it counts, times and calls out each step, so you never have to look.
- **Fits any routine:** reps, timed work, step-by-step sequences, boxing combos and rest, in as many rounds as you like.
- **Plans your day:** routines show up on the days and times of day you choose, with a gentle hint about what's next.
- **Keeps track:** workouts are logged, with streaks and a week overview.
- **Works anywhere:** installable, works offline, and syncs across devices if you sign in.
- **Fits your settings:** text follows the text size set in your browser, and flashes and pops stay off when your device is set to reduce motion.
- **Screen readers and keyboards:** every button and field says what it is, everything works with only a keyboard, each screen starts reading at its heading, and with the voice coach off a screen reader says each new step.

## Feedback

Something not working, or an idea? [Open an issue](https://github.com/agepoor/repflow/issues/new/choose) and pick _Something's wrong_ or _I have an idea_. All you need is a GitHub account.

In the app, **Settings → About → Email a report**, **Open a GitHub issue** or **Copy report** fills in the version, your browser and recent errors for you. You see the report before it's sent; it never includes your routines.

## Contribute

Want to fix something or add a feature? [CONTRIBUTING.md](CONTRIBUTING.md) explains how to run the app locally, how a change gets in, and the rules that keep it safe and working offline. In short: you need git, bash and Python 3 to run it (no bundler, plain JavaScript modules), and Node 22.12+ for the checks.

Every push to `main` deploys to the live app, so all changes go through a pull request.

## Security

Found a security problem? Please report it privately, not in a public issue: see [SECURITY.md](SECURITY.md).

## Privacy

Without an account, nothing leaves your device. With one, routines and workouts sync through Firebase (database in Belgium). There are no ads, analytics or tracking. [privacy.html](privacy.html), also linked in the app's Settings, says what's stored, where, and how to delete it.

## Licence

The code is licensed under the [Apache License 2.0](LICENSE): use, change and share it, also in closed or commercial apps, as long as you keep the licence and copyright notices and mark the files you changed. Contributions are accepted under the same licence. The licence gives no right to use the PunchPace name or logo as your own (section 6).

The display type is [Saira](https://github.com/Omnibus-Type/Saira), under the SIL Open Font License 1.1 (`fonts/OFL.txt`).
