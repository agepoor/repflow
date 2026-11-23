import { describe, expect, it } from 'vitest';
import { HOME, addsSomething, isOldAddress, isUnused, pack, summarize, takeIn, unpack } from '../core/move.js';
import { PRESETS, canon } from '../core/routine.js';

const rt = (id, upd, extra = {}) => ({
  id,
  name: 'Routine ' + id,
  rounds: 1,
  rest: 0,
  prep: 0,
  cv: 2,
  sec: 1,
  blocks: [{ id: id + '-b', type: 'timed', name: 'Work', work: 30, cue: '', lastOnly: false, restAfter: 0 }],
  upd,
  ...extra,
});
const workout = (id, ts) => ({ id, ts, name: 'Workout', dur: 60, rounds: 1 });
// a device's data as the app keeps it: the order lists its routines
const doc = (over = {}) => ({
  routines: [],
  deleted: {},
  history: [],
  hdel: {},
  ...over,
  order: { ids: (over.routines || []).map((r) => r.id), ts: 0, ...over.order },
});
// what punchpace.app holds on first open: the default routines, unchanged
const fresh = () => doc({ routines: PRESETS().map((r) => ({ ...r, upd: 0 })) });

describe('isOldAddress', () => {
  it('forwards the old addresses', () => {
    expect(isOldAddress('agepoor.github.io', '/repflow/')).toBe(true);
    expect(isOldAddress('agepoor.github.io', '/repflow')).toBe(true);
    expect(isOldAddress('agepoor.github.io', '/repflow/index.html')).toBe(true);
    expect(isOldAddress('workout-pacer.web.app', '/')).toBe(true);
    expect(isOldAddress('workout-pacer.firebaseapp.com', '/')).toBe(true);
  });
  it('leaves the new address, other GitHub pages, previews and local copies alone', () => {
    expect(isOldAddress('punchpace.app', '/')).toBe(false);
    expect(isOldAddress('agepoor.github.io', '/')).toBe(false);
    expect(isOldAddress('agepoor.github.io', '/repflowx/')).toBe(false);
    expect(isOldAddress('workout-pacer--pr69-abc.web.app', '/')).toBe(false);
    expect(isOldAddress('localhost', '/')).toBe(false);
  });
  it('forwards to punchpace.app', () => expect(HOME).toBe('https://punchpace.app/'));
});

describe('pack and unpack', () => {
  it('round-trips the data, leaving device-only fields behind', () => {
    const d = doc({ routines: [rt('a', 5)], history: [workout('h1', 10)], parts: { ts: 1 }, app: 'repflow', v: 1 });
    const packed = pack(d, { voice: false }, 'agepoor.github.io/repflow');
    const back = unpack(JSON.parse(JSON.stringify(packed)));
    expect(back.from).toBe('agepoor.github.io/repflow');
    expect(back.doc.routines).toEqual([rt('a', 5)]);
    expect(back.doc.history).toEqual([workout('h1', 10)]);
    expect(back.doc.parts).toEqual({ ts: 1 });
    expect(back.settings).toEqual({ voice: false });
  });
  it('refuses anything that is not a move', () => {
    expect(unpack(null)).toBe(null);
    expect(unpack([])).toBe(null);
    expect(unpack({ app: 'other', v: 1, doc: {} })).toBe(null);
    expect(unpack({ app: 'punchpace-move', v: 2, doc: {} })).toBe(null);
    expect(unpack({ app: 'punchpace-move', v: 1 })).toBe(null);
  });
  it('keeps only well-formed parts', () => {
    const back = unpack({
      app: 'punchpace-move',
      v: 1,
      from: 'x'.repeat(500),
      doc: { routines: [rt('a', 1), 'junk', null], history: [workout('h', 1), { id: 'no-time' }, 7], deleted: [] },
      settings: 'loud',
    });
    expect(back.doc.routines).toHaveLength(1);
    expect(back.doc.history).toHaveLength(1);
    expect(back.doc.deleted).toEqual({});
    expect(back.doc.order).toEqual({ ids: [], ts: 0 });
    expect(back.settings).toBe(null);
    expect(back.from).toHaveLength(100);
  });
});

describe('isUnused', () => {
  it('is true for the defaults on first open', () => expect(isUnused(fresh())).toBe(true));
  it('is false once something was changed, deleted, reordered or logged', () => {
    expect(isUnused(doc({ routines: [rt('a', 3)] }))).toBe(false);
    expect(isUnused(doc({ deleted: { a: 1 } }))).toBe(false);
    expect(isUnused(doc({ order: { ids: [], ts: 4 } }))).toBe(false);
    expect(isUnused(doc({ history: [workout('h', 1)] }))).toBe(false);
  });
});

describe('takeIn', () => {
  const moved = (d, settings = { voice: false }) => unpack(pack(d, settings, 'old'));
  it('brings everything to an unused address, settings included', () => {
    const r = takeIn(
      fresh(),
      { voice: true, beeps: true },
      moved(doc({ routines: [rt('mine', 9)], history: [workout('h', 5)] })),
    );
    expect(r.doc.routines.map((x) => x.id)).toContain('mine');
    expect(r.doc.history.map((h) => h.id)).toEqual(['h']);
    expect(r.settings).toEqual({ voice: false, beeps: true });
  });
  it('keeps the settings of an address that was already used, and merges without duplicates', () => {
    const here = doc({ routines: [rt('a', 10), rt('b', 2)], history: [workout('h1', 1)] });
    const there = doc({
      routines: [rt('a', 5, { name: 'older' }), rt('c', 3)],
      history: [workout('h1', 1), workout('h2', 2)],
    });
    const r = takeIn(here, { voice: true }, moved(there));
    expect(r.settings).toEqual({ voice: true });
    expect(r.doc.routines.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
    expect(r.doc.routines.find((x) => x.id === 'a').name).toBe('Routine a'); // the newer copy wins
    expect(r.doc.history.map((h) => h.id)).toEqual(['h1', 'h2']);
  });
  it('the same move twice changes nothing more', () => {
    const m = moved(doc({ routines: [rt('x', 4)], history: [workout('h', 3)] }));
    const once = takeIn(fresh(), {}, m);
    const twice = takeIn(once.doc, {}, m);
    expect(twice.doc.routines).toEqual(once.doc.routines);
    expect(twice.doc.history).toEqual(once.doc.history);
  });
});

describe('summarize', () => {
  it('counts only routines someone made or changed', () => {
    const m = unpack(pack(doc({ routines: [rt('a', 0), rt('b', 7)], history: [workout('h', 1)] }), {}, 'old'));
    expect(summarize(m)).toEqual({ routines: 1, workouts: 1 });
  });
});

describe('addsSomething', () => {
  const moved = (d, settings = {}) => unpack(pack(d, settings, 'old'));
  const check = (local, settings, m) => addsSomething(local, settings, takeIn(local, settings, m));
  it('is true for new routines, workouts or settings', () => {
    expect(check(fresh(), {}, moved(doc({ routines: [rt('x', 4)] })))).toBe(true);
    expect(check(fresh(), {}, moved(doc({ history: [workout('h', 3)] })))).toBe(true);
    expect(check(fresh(), { voice: true }, moved(doc(), { voice: false }))).toBe(true);
  });
  it('is false once everything arrived, so a repeat visit asks nothing', () => {
    const m = moved(doc({ routines: [rt('x', 4)], history: [workout('h', 3)] }), { voice: false });
    const once = takeIn(fresh(), { voice: true }, m);
    expect(check(once.doc, once.settings, m)).toBe(false);
  });
  it('is false for older copies of what is here', () => {
    const here = doc({ routines: canon([rt('a', 10)]), history: [workout('h', 1)] }); // as stored: repaired
    expect(check(here, {}, moved(doc({ routines: [rt('a', 5, { name: 'older' })] })))).toBe(false);
  });
});
