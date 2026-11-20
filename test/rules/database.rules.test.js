// Tests database.rules.json against the Realtime Database emulator: each user reaches only users/<own uid>.
// Run with `npm run test:rules` (starts the emulator; needs Java). Plain REST calls, so no Firebase SDK is needed.
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// A demo- project never touches the real database
const NS = 'demo-punchpace';
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
const rules = JSON.parse(readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'));

// The emulator accepts unsigned ID tokens, so a test can sign in as any uid
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid) =>
  `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    sub: uid,
    user_id: uid,
    aud: NS,
    iss: `https://securetoken.google.com/${NS}`,
    iat: 0,
    exp: 9999999999,
    auth_time: 0,
    firebase: { sign_in_provider: 'google.com' },
  })}.`;

/* One REST call. `as`: a uid, 'owner' (admin, skips the rules) or null (signed out). Returns the HTTP status. */
async function call(method, path, as, body) {
  const auth = as && as !== 'owner' ? `&auth=${token(as)}` : '';
  const res = await fetch(`http://${HOST}/${path}.json?ns=${NS}${auth}`, {
    method,
    headers: as === 'owner' ? { Authorization: 'Bearer owner' } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await res.text();
  return res.status;
}
const read = (path, as) => call('GET', path, as);
const write = (path, as, value = { t: 1 }) => call('PUT', path, as, value);

beforeAll(async () => {
  expect(await call('PUT', '.settings/rules', 'owner', rules)).toBe(200);
});
beforeEach(async () => {
  // Start every test from the same data: two users with a routine doc and a running timer
  const user = { doc: { routines: [] }, run: { at: 1 } };
  expect(await call('PUT', '', 'owner', { users: { alice: user, bob: user } })).toBe(200);
});

// The paths the app syncs (cloud.js); never renamed
const PATHS = ['doc', 'run'];

describe('signed in', () => {
  it.each(PATHS)('reads and writes their own %s', async (p) => {
    expect(await read(`users/alice/${p}`, 'alice')).toBe(200);
    expect(await write(`users/alice/${p}`, 'alice')).toBe(200);
    expect(await call('DELETE', `users/alice/${p}`, 'alice')).toBe(200);
  });

  it.each(PATHS)("can't read or write someone else's %s", async (p) => {
    expect(await read(`users/bob/${p}`, 'alice')).toBe(401);
    expect(await write(`users/bob/${p}`, 'alice')).toBe(401);
    expect(await call('DELETE', `users/bob/${p}`, 'alice')).toBe(401);
  });

  it("can't list users or read or write the root", async () => {
    expect(await read('users', 'alice')).toBe(401);
    expect(await read('', 'alice')).toBe(401);
    expect(await write('users', 'alice', { alice: {} })).toBe(401);
    expect(await write('', 'alice', {})).toBe(401);
  });

  it("can't write outside users/", async () => {
    expect(await write('other', 'alice')).toBe(401);
  });
});

describe('signed out', () => {
  it.each(PATHS)("can't read or write anyone's %s", async (p) => {
    expect(await read(`users/alice/${p}`, null)).toBe(401);
    expect(await write(`users/alice/${p}`, null)).toBe(401);
  });

  it("can't read the root", async () => {
    expect(await read('', null)).toBe(401);
  });
});
