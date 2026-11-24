# Security

Found a security problem in PunchPace? Thank you for looking. Please report it privately, so it can be fixed before anyone else learns about it. Don't open a public issue for it.

## How to report

- **On GitHub (preferred):** the repo's **Security** tab → **Report a vulnerability**. Only the maintainer sees the report, and we can discuss and fix it there.
- **By email:** security@punchpace.app

Please include what you found, how to reproduce it, and what someone could do with it. A short report is fine; you don't need a fix.

## What to expect

PunchPace is a small open-source project with one maintainer, so there is no security team and no bug bounty. You can expect:

- an answer within 7 days,
- updates while it's being fixed,
- credit in the fix and its release notes, if you'd like it.

## Which version

Only the live app is supported: the latest version of the `main` branch, deployed at https://punchpace.app (the old addresses forward there). An installed app updates itself, so there are no older versions to patch.

## What's in scope

- The app's code in this repository, including sign-in and sync (`cloud.js`, `ui/sync.js`).
- The database rules (`database.rules.json`): one user being able to read or change another user's data is the most important kind of report.
- The security headers and Content Security Policy (`firebase.json`, `index.html`).

Not a vulnerability:

- The Firebase config in `cloud.js` being public. Those values identify the project; access is limited by the database rules.
- Problems that need someone else's unlocked device, or a device that is already compromised.
- Problems in Firebase, Google or GitHub themselves: report those to them.

## Testing

Test with your own account and your own data only. Don't try to read or change other people's data, and don't run load tests or automated scanners against the live app or its database. To test the database rules, run them locally in the Firebase emulator (`npm run test:rules`, needs Java 11 or newer).
