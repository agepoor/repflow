// Tests database.rules.json against the Realtime Database emulator: each user reaches only users/<own uid>, and only
// writes what the app writes (shape and size, #95).
// Run with `npm run test:rules` (starts the emulator; needs Java). Plain REST calls, so no Firebase SDK is needed.
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { itemsOf } from '../../core/merge.js';
import { PRESETS } from '../../core/routine.js';

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
const write = (path, as, value) =>
  call('PUT', path, as, value === undefined ? VALID[path.split('/').slice(2).join('/')] : value);
// what is stored at a path, read as the owner (no rules)
const stored = async (path) =>
  (await fetch(`http://${HOST}/${path}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })).json();

// What the app writes to each path (cloud.js put and setRun, items from core/merge.js itemsOf, the run from ui/runner.js runDoc)
const ROUTINE = { id: 'r1', name: 'Burpees', steps: [{ type: 'reps', reps: 10 }], upd: 5 };
const RUN = {
  sid: 'abc123def456',
  r: JSON.stringify(ROUTINE),
  i: 2,
  s0: 1700000000000,
  t0: 1700000000000,
  tap: 0,
  nc: 1.5,
  ct: '',
  calls: 0,
  box: '{}',
  by: 'dev12345dev67890',
  dn: 'Android phone',
  u: 1700000000001,
};
const VALID = {
  run: RUN,
  'v2/routines/r1': { d: JSON.stringify(ROUTINE), m: 40 },
  'v2/history/h1': { d: JSON.stringify({ id: 'h1', rid: 'r1', name: 'Burpees', ts: 1, dur: 60, reps: 10 }), m: 40 },
  'v2/order': { ids: ['r1', 'r2'], ts: 2, m: 40 },
  'v2/parts': { mid: 720, eve: 1020, ts: 2, m: 40 },
  'v2/since': 40,
};

beforeAll(async () => {
  expect(await call('PUT', '.settings/rules', 'owner', rules)).toBe(200);
});
beforeEach(async () => {
  // Start every test from the same data: two users with a routine doc and a running timer
  const v2 = {
    routines: { r1: { m: 10, d: '{}' }, r2: { m: 30, del: 3 } },
    history: { h1: { m: 20, d: '{}' } },
    order: { ids: ['r1'], ts: 1, m: 1 },
    parts: { mid: 720, eve: 1020, ts: 1, m: 1 },
    since: 1,
  };
  const user = { doc: { routines: [] }, run: { at: 1 }, v2 };
  expect(await call('PUT', '', 'owner', { users: { alice: user, bob: user } })).toBe(200);
});

// The paths the app syncs (cloud.js); never renamed. doc is the old single document (only read, to move an account),
// v2/* one item per routine/workout
const WRITTEN = ['run', 'v2/routines/r1', 'v2/history/h1', 'v2/order', 'v2/parts', 'v2/since'];
const PATHS = ['doc', ...WRITTEN];

describe('signed in', () => {
  it.each(WRITTEN)('reads and writes their own %s', async (p) => {
    expect(await read(`users/alice/${p}`, 'alice')).toBe(200);
    expect(await write(`users/alice/${p}`, 'alice')).toBe(200);
    expect(await call('DELETE', `users/alice/${p}`, 'alice')).toBe(200);
  });

  it('reads and deletes their own old doc, but no longer writes it', async () => {
    expect(await read('users/alice/doc', 'alice')).toBe(200);
    expect(await write('users/alice/doc', 'alice', { routines: [ROUTINE] })).toBe(401);
    expect(await call('DELETE', 'users/alice/doc', 'alice')).toBe(200);
  });

  it.each(PATHS)("can't read or write someone else's %s", async (p) => {
    expect(await read(`users/bob/${p}`, 'alice')).toBe(401);
    expect(await write(`users/bob/${p}`, 'alice', VALID[p] || {})).toBe(401);
    expect(await call('DELETE', `users/bob/${p}`, 'alice')).toBe(401);
  });

  it("can't list users or read or write the root", async () => {
    expect(await read('users', 'alice')).toBe(401);
    expect(await read('', 'alice')).toBe(401);
    expect(await write('users', 'alice', { alice: {} })).toBe(401);
    expect(await write('', 'alice', {})).toBe(401);
  });

  // Delete account (cloud.js deleteAccount) removes users/<uid> in one go before the sign-in itself (privacy policy, #12)
  it('can delete everything they have, and only that', async () => {
    expect(await call('DELETE', 'users/alice', 'alice')).toBe(200);
    expect(await stored('users/alice')).toBe(null);
    expect(await call('DELETE', 'users/bob', 'alice')).toBe(401);
    expect(await stored('users/bob/v2/since')).toBe(1);
  });

  it("can't write outside users/", async () => {
    expect(await write('other', 'alice', { t: 1 })).toBe(401);
  });

  // put() moves an account by writing everything at once to users/<uid>; a deleted routine or workout is {del}
  it('can move an account in one write, deleted items included', async () => {
    const all = {
      'v2/routines/r3': { d: JSON.stringify({ ...ROUTINE, id: 'r3' }), m: 50 },
      'v2/routines/r4': { del: 4, m: 50 },
      'v2/history/h2': { del: 4, m: 50 },
      'v2/order': { ids: ['r3'], ts: 5, m: 50 },
      'v2/parts': { mid: 600, eve: 1080, ts: 5, off: true, m: 50 },
      'v2/since': 50,
    };
    expect(await call('PATCH', 'users/alice', 'alice', all)).toBe(200);
  });

  // the items exactly as the app makes them (core/merge.js), with m added as cloud.js put() does
  it('can store the preset routines, a workout, deletes, order and parts as the app makes them', async () => {
    const routines = PRESETS();
    const items = itemsOf({
      routines,
      deleted: { gone1: 3 },
      history: [
        { id: 'w1', rid: routines[0].id, name: routines[0].name, ts: 1, dur: 60, rounds: 1, reps: 12, calls: 0 },
      ],
      hdel: { w0: 2 },
      order: { ids: routines.map((r) => r.id), ts: 4 },
      parts: { mid: 690, eve: 1050, ts: 4 },
    });
    const PATH = { 'r/': 'routines', 'h/': 'history' };
    const all = { 'v2/since': 60 };
    Object.entries(items).forEach(([k, v]) => {
      all[PATH[k.slice(0, 2)] ? `v2/${PATH[k.slice(0, 2)]}/${k.slice(2)}` : `v2/${k}`] = { ...v, m: 60 };
    });
    expect(Object.keys(all).length).toBeGreaterThan(8);
    expect(await call('PATCH', 'users/alice', 'alice', all)).toBe(200);
  });

  it('can write a run that is paused, stopped or done, as runDoc in ui/runner.js writes it', async () => {
    expect(await write('users/alice/run', 'alice', { ...RUN, p: 1700000005000 })).toBe(200);
    // end is 'stop' (Stop, also from another device: #114) or 'done' (finished, with fin: when)
    expect(await write('users/alice/run', 'alice', { ...RUN, p: 1700000005000, end: 'stop', u: RUN.u + 1 })).toBe(200);
    expect(await write('users/alice/run', 'alice', { ...RUN, end: 'done', fin: 1700000009000, u: RUN.u + 2 })).toBe(
      200,
    );
  });

  // #119: a write queued offline must not undo a newer change to the same workout; the app checks first (cloud.js
  // setRun, core/merge.js runWins), and the database refuses a write that isn't newer than the stored one
  it('replaces the same workout only with a higher u; a new workout always', async () => {
    expect(await write('users/alice/run', 'alice', RUN)).toBe(200);
    expect(await write('users/alice/run', 'alice', { ...RUN, i: 3, u: RUN.u + 1 })).toBe(200);
    expect(await write('users/alice/run', 'alice', { ...RUN, i: 4, u: RUN.u + 1 })).toBe(401);
    expect(await write('users/alice/run', 'alice', { ...RUN, i: 1, u: RUN.u })).toBe(401);
    expect((await stored('users/alice/run')).i).toBe(3);
    // another workout, even with an older clock (a device whose clock is behind)
    expect(await write('users/alice/run', 'alice', { ...RUN, sid: 'new000workout', u: RUN.u - 5000 })).toBe(200);
    // and the account can still be cleared, as Delete account does
    expect(await call('DELETE', 'users/alice/run', 'alice')).toBe(200);
  });

  it('can write an empty order', async () => {
    expect(await write('users/alice/v2/order', 'alice', { ts: 3, m: 40 })).toBe(200);
  });
});

// Size and shape (#95): a signed-in user can only store what the app stores, so data can't grow without bound or reach
// other devices broken. The limits are ~10x a long routine (100,000 characters) and ~25x a workout entry (5,000).
describe('refuses what the app never writes', () => {
  const big = (n) => 'x'.repeat(n + 1);
  const refused = async (p, value) => expect(await write(`users/alice/${p}`, 'alice', value)).toBe(401);
  const item = VALID['v2/routines/r1'];

  it('just under the limits is fine', async () => {
    expect(await write('users/alice/v2/routines/r1', 'alice', { d: 'x'.repeat(100000), m: 1 })).toBe(200);
    expect(await write('users/alice/v2/history/h1', 'alice', { d: 'x'.repeat(5000), m: 1 })).toBe(200);
    expect(await write('users/alice/run', 'alice', { ...RUN, r: 'x'.repeat(100000) })).toBe(200);
  });

  it('a routine or workout over the size limit', async () => {
    await refused('v2/routines/r1', { d: big(100000), m: 1 });
    await refused('v2/history/h1', { d: big(5000), m: 1 });
  });

  it('a run with a routine over the size limit, or long texts', async () => {
    await refused('run', { ...RUN, r: big(100000) });
    await refused('run', { ...RUN, box: big(10000) });
    await refused('run', { ...RUN, ct: big(1000) });
    await refused('run', { ...RUN, dn: big(200) });
    await refused('run', { ...RUN, sid: big(100) });
  });

  it('an item without m, or with m that is not a number', async () => {
    await refused('v2/routines/r1', { d: item.d });
    await refused('v2/routines/r1', { d: item.d, m: 'now' });
    await refused('v2/history/h1', { del: 1 });
    await refused('v2/order', { ids: ['r1'], ts: 1 });
    await refused('v2/parts', { mid: 720, eve: 1020, ts: 1 });
  });

  it('an item that is both there and deleted, or neither', async () => {
    await refused('v2/routines/r1', { d: item.d, del: 1, m: 1 });
    await refused('v2/routines/r1', { m: 1 });
    await refused('v2/history/h1', { d: '{}', del: 1, m: 1 });
  });

  it('an item that is not an object', async () => {
    await refused('v2/routines/r1', 'hello');
    await refused('v2/history/h1', 5);
    await refused('v2/routines', 'hello');
    await refused('run', 'hello');
  });

  it('wrong types', async () => {
    await refused('v2/routines/r1', { d: { steps: [1] }, m: 1 });
    await refused('v2/routines/r1', { del: 'yesterday', m: 1 });
    await refused('v2/order', { ids: [{ id: 'r1' }], ts: 1, m: 1 });
    await refused('v2/order', { ids: 'r1', ts: 1, m: 1 });
    await refused('v2/parts', { mid: '12:00', eve: 1020, ts: 1, m: 1 });
    await refused('v2/parts', { mid: 720, eve: 1020, ts: 1, off: 'yes', m: 1 });
    await refused('v2/since', 'now');
    await refused('run', { ...RUN, i: 'two' });
    await refused('run', { ...RUN, end: 'paused' });
    await refused('run', { ...RUN, end: 1700000009000 });
    await refused('run', { ...RUN, r: { steps: [1] } });
  });

  it('times of day outside the day', async () => {
    await refused('v2/parts', { mid: -1, eve: 1020, ts: 1, m: 1 });
    await refused('v2/parts', { mid: 720, eve: 1441, ts: 1, m: 1 });
  });

  it('an order with more than 10,000 routines or a long id', async () => {
    const ids = {};
    ids['10000'] = 'r1';
    await refused('v2/order', { ids, ts: 1, m: 1 });
    await refused('v2/order', { ids: [big(100)], ts: 1, m: 1 });
  });

  it('a routine or workout id over 100 characters', async () => {
    await refused(`v2/routines/${big(100)}`, item);
    await refused(`v2/history/${big(100)}`, item);
  });

  it('unknown keys anywhere', async () => {
    await refused('extra', { t: 1 });
    await refused('v2/extra', { t: 1 });
    await refused('v2/routines/r1', { ...item, extra: 1 });
    await refused('v2/history/h1', { ...item, extra: 1 });
    await refused('v2/order', { ...VALID['v2/order'], extra: 1 });
    await refused('v2/parts', { ...VALID['v2/parts'], extra: 1 });
    await refused('run', { ...RUN, extra: 1 });
  });

  it('an unknown key inside a move of the whole account', async () => {
    expect(await call('PATCH', 'users/alice', 'alice', { 'v2/since': 9, 'v2/extra': 1 })).toBe(401);
    expect(await stored('users/alice/v2/since')).toBe(1);
  });
});

describe('changes since a time', () => {
  // a device asks only for items written since it last looked: without the index Firebase refuses (or sends everything)
  const since = (path, as, t) =>
    fetch(`http://${HOST}/${path}.json?ns=${NS}&orderBy=%22m%22&startAt=${t}&auth=${token(as)}`).then(async (r) => [
      r.status,
      await r.json(),
    ]);

  it.each(['routines', 'history'])('%s can be asked for by when they were written', async (p) => {
    const [status, body] = await since(`users/alice/v2/${p}`, 'alice', 15);
    expect(status).toBe(200);
    expect(Object.keys(body)).toEqual(p === 'routines' ? ['r2'] : ['h1']);
  });

  it("not for someone else's items", async () => {
    expect((await since('users/bob/v2/routines', 'alice', 0))[0]).toBe(401);
  });
});

describe('signed out', () => {
  it.each(PATHS)("can't read or write anyone's %s", async (p) => {
    expect(await read(`users/alice/${p}`, null)).toBe(401);
    expect(await write(`users/alice/${p}`, null, VALID[p] || {})).toBe(401);
  });

  it("can't read the root", async () => {
    expect(await read('', null)).toBe(401);
  });
});
