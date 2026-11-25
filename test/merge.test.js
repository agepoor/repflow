import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changed, docOf, itemsOf, merge, newer, norm, print, runWins } from '../core/merge.js';

const NOW = new Date(2026, 10, 19, 12, 0).getTime();
beforeEach(() => vi.useFakeTimers({ now: NOW }));
afterEach(() => vi.useRealTimers());

// a routine as stored (already migrated and repaired, so merge returns it as is)
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
const ids = (m) => m.routines.map((r) => r.id);
const byId = (m, id) => m.routines.find((r) => r.id === id);

describe('merge: this device and the account', () => {
  it('keeps routines from both sides', () => {
    const m = merge({ routines: [rt('a', 1)] }, { routines: [rt('b', 1)] });
    expect(ids(m).sort()).toEqual(['a', 'b']);
    expect(m).toMatchObject({ app: 'repflow', v: 1 });
  });

  it('the newest edit of a routine wins, whichever side has it', () => {
    const old = rt('a', 100, { name: 'Old' });
    const edited = rt('a', 200, { name: 'New' });
    expect(byId(merge({ routines: [edited] }, { routines: [old] }), 'a').name).toBe('New');
    expect(byId(merge({ routines: [old] }, { routines: [edited] }), 'a').name).toBe('New');
  });

  it('a delete removes the routine on both sides, and the deletes are kept', () => {
    const m = merge({ routines: [], deleted: { a: 300 } }, { routines: [rt('a', 200), rt('b', 1)] });
    expect(ids(m)).toEqual(['b']);
    expect(m.deleted).toEqual({ a: 300 });
  });

  it('an edit made after the delete brings the routine back', () => {
    const m = merge({ routines: [], deleted: { a: 300 } }, { routines: [rt('a', 400)] });
    expect(ids(m)).toEqual(['a']);
  });

  it('deletes from both sides are combined, the latest time per routine', () => {
    const m = merge({ deleted: { a: 5, b: 9 } }, { deleted: { a: 7, c: 1 } });
    expect(m.deleted).toEqual({ a: 7, b: 9, c: 1 });
  });

  it('identical copies with different ids (a preset made on two devices) become one: the account copy stays', () => {
    const local = rt('local1', 10, { name: 'Same' });
    const remote = rt('remote1', 20, { name: 'Same' });
    remote.blocks[0].id = 'other-block-id'; // block ids don't count
    const m = merge({ routines: [local] }, { routines: [remote] });
    expect(ids(m)).toEqual(['remote1']);
    expect(m.deleted.local1).toBe(NOW);
  });

  it('different content is never collapsed', () => {
    const m = merge(
      { routines: [rt('x', 1, { name: 'Same', rounds: 2 })] },
      { routines: [rt('y', 1, { name: 'Same' })] },
    );
    expect(ids(m).sort()).toEqual(['x', 'y']);
  });

  describe('order', () => {
    it('the side that reordered last wins', () => {
      const L = { routines: [rt('a', 1), rt('b', 1), rt('c', 1)], order: { ids: ['c', 'b', 'a'], ts: 200 } };
      const R = { routines: [rt('a', 1), rt('b', 1), rt('c', 1)], order: { ids: ['a', 'b', 'c'], ts: 100 } };
      const m = merge(L, R);
      expect(ids(m)).toEqual(['c', 'b', 'a']);
      expect(m.order).toEqual({ ids: ['c', 'b', 'a'], ts: 200 });
    });

    it("routines the winning order doesn't know come after, in the other side's order", () => {
      const L = { routines: [rt('a', 1), rt('b', 1)], order: { ids: ['b', 'a'], ts: 200 } };
      const R = { routines: [rt('z', 1), rt('y', 1)], order: { ids: ['z', 'y'], ts: 100 } };
      expect(ids(merge(L, R))).toEqual(['b', 'a', 'z', 'y']);
    });

    it('without any order: by id', () => {
      expect(ids(merge({ routines: [rt('b', 1), rt('a', 1)] }, {}))).toEqual(['a', 'b']);
    });
  });

  describe('history', () => {
    it('workouts from both sides, oldest first, one entry per id', () => {
      const L = {
        history: [
          { id: 'h2', ts: 20 },
          { id: 'h1', ts: 10, by: 'local' },
        ],
      };
      const R = {
        history: [
          { id: 'h1', ts: 10, by: 'account' },
          { id: 'h3', ts: 30 },
        ],
      };
      const m = merge(L, R);
      expect(m.history.map((h) => h.id)).toEqual(['h1', 'h2', 'h3']);
      expect(m.history[0].by).toBe('account'); // the stored copy wins, so devices agree
    });

    it('deleted workouts stay deleted, from either side', () => {
      const m = merge(
        { history: [{ id: 'h1', ts: 1 }], hdel: { h2: 5 } },
        { history: [{ id: 'h2', ts: 2 }], hdel: { h1: 3 } },
      );
      expect(m.history).toEqual([]);
      expect(m.hdel).toEqual({ h1: 3, h2: 5 });
    });

    it('skips broken entries', () => {
      expect(merge({ history: [null, { ts: 1 }, { id: 'ok', ts: 2 }] }, {}).history).toEqual([{ id: 'ok', ts: 2 }]);
    });
  });

  describe('parts of the day', () => {
    it('the newest change wins', () => {
      const a = { mid: 720, eve: 1020, ts: 100 };
      const b = { mid: 660, eve: 1080, ts: 200 };
      expect(merge({ parts: a }, { parts: b }).parts).toBe(b);
      expect(merge({ parts: b }, { parts: a }).parts).toBe(b);
    });

    it('one side only: that one; neither: left out', () => {
      const a = { mid: 720, eve: 1020, ts: 1, off: true };
      expect(merge({ parts: a }, {}).parts).toBe(a);
      expect(merge({}, { parts: a }).parts).toBe(a);
      expect('parts' in merge({}, {})).toBe(false);
    });
  });

  it('merging again changes nothing', () => {
    const L = {
      routines: [rt('a', 5), rt('b', 1)],
      deleted: { gone: 3 },
      order: { ids: ['b', 'a'], ts: 9 },
      history: [{ id: 'h', ts: 1 }],
    };
    const R = {
      routines: [rt('a', 2), rt('c', 4)],
      order: { ids: ['c'], ts: 2 },
      parts: { mid: 700, eve: 1000, ts: 1 },
    };
    const once = merge(L, R);
    expect(merge(once, once)).toEqual(once);
    expect(merge(once, R)).toEqual(once);
    expect(merge(L, once)).toEqual(once);
  });

  it('copes with an empty account', () => {
    const m = merge({ routines: [rt('a', 1)] }, {});
    expect(ids(m)).toEqual(['a']);
    expect(m.history).toEqual([]);
  });
});

describe('items: the account stores each routine and workout on its own', () => {
  const doc = {
    routines: [rt('a', 5), rt('b', 1)],
    deleted: { gone: 3 },
    order: { ids: ['b', 'a'], ts: 9 },
    history: [{ id: 'h1', ts: 1, rid: 'a' }],
    hdel: { h0: 4 },
    parts: { mid: 700, eve: 1000, ts: 2 },
  };
  // items as they come back from the account: written time m added, empty lists left out (Firebase drops them)
  const stored = (items) =>
    Object.fromEntries(
      Object.entries(items).map(([k, v]) => [
        k,
        { ...v, m: 123, ...(v.ids && !v.ids.length ? { ids: undefined } : {}) },
      ]),
    );

  it('one item per routine, delete, workout, plus order and parts of the day', () => {
    const it = itemsOf(merge(doc, {}));
    expect(Object.keys(it).sort()).toEqual(['h/h0', 'h/h1', 'order', 'parts', 'r/a', 'r/b', 'r/gone']);
    expect(it['r/gone']).toEqual({ del: 3 });
    expect(JSON.parse(it['r/a'].d)).toMatchObject({ id: 'a', upd: 5 });
  });

  it('the items give back the same data', () => {
    const m = merge(doc, {});
    expect(merge({}, docOf(stored(itemsOf(m))))).toEqual(m);
  });

  it('a routine edited after its delete is stored as the routine', () => {
    const m = merge({ routines: [rt('a', 400)], deleted: { a: 300 } }, {});
    expect(JSON.parse(itemsOf(m)['r/a'].d).upd).toBe(400);
  });

  it('broken or foreign items are skipped', () => {
    const d = docOf({ 'r/x': { d: '{bad' }, 'r/y': { d: JSON.stringify(rt('other', 1)) }, 'h/z': null, junk: 5 });
    expect(d).toEqual({ routines: [], deleted: {}, history: [], hdel: {} });
  });

  it('merging all changed items at once gives the same as merging the whole document', () => {
    const L = { routines: [rt('a', 9), rt('c', 2)], history: [{ id: 'h9', ts: 9 }], order: { ids: ['c', 'a'], ts: 5 } };
    const whole = merge(L, merge(doc, {}));
    expect(merge(L, docOf(stored(itemsOf(merge(doc, {})))))).toEqual(whole);
  });

  it('items arriving one at a time, in any order, end with the same routines, history and deletes', () => {
    const L = { routines: [rt('a', 9), rt('c', 2)], history: [{ id: 'h9', ts: 9 }] };
    const whole = merge(L, merge(doc, {}));
    const items = Object.entries(stored(itemsOf(merge(doc, {}))));
    for (const order of [items, [...items].reverse()]) {
      let local = L;
      order.forEach(([k, v]) => (local = merge(local, docOf({ [k]: v }))));
      expect(ids(local).sort()).toEqual(ids(whole).sort());
      expect(local.deleted).toEqual(whole.deleted);
      expect(local.history).toEqual(whole.history);
      expect(local.hdel).toEqual(whole.hdel);
      expect(local.parts).toEqual(whole.parts);
    }
  });

  it('two devices settling identical copies they both already uploaded keep the same one', () => {
    const a = rt('a1', 10, { name: 'Same' });
    const b = rt('b1', 20, { name: 'Same' });
    // device A has a1 and receives b1; device B has b1 and receives a1. Both are already in the account
    const onA = merge({ routines: [a] }, { routines: [b] }, ['a1']);
    const onB = merge({ routines: [b] }, { routines: [a] }, ['b1']);
    expect(ids(onA)).toEqual(['a1']);
    expect(ids(onB)).toEqual(['a1']);
  });

  describe('which version of an item the account keeps', () => {
    const r = (upd) => ({ d: JSON.stringify(rt('a', upd)) });
    it('routines: the newest edit or delete; a delete wins a tie', () => {
      expect(newer('r/a', r(1), r(2))).toBe(true);
      expect(newer('r/a', r(2), r(1))).toBe(false);
      expect(newer('r/a', r(2), r(2))).toBe(false);
      expect(newer('r/a', r(2), { del: 2 })).toBe(true);
      expect(newer('r/a', { del: 2 }, r(2))).toBe(false);
      expect(newer('r/a', { del: 2 }, r(3))).toBe(true);
      expect(newer('r/a', null, r(1))).toBe(true);
    });
    it('workouts: the stored copy stays, a delete always wins', () => {
      const h = (by) => ({ d: JSON.stringify({ id: 'h', ts: 1, by }) });
      expect(newer('h/h', h('stored'), h('mine'))).toBe(false);
      expect(newer('h/h', h('stored'), { del: 5 })).toBe(true);
      expect(newer('h/h', { del: 5 }, h('mine'))).toBe(false);
      expect(newer('h/h', null, h('mine'))).toBe(true);
    });
    it('order and parts of the day: the newest', () => {
      expect(newer('order', { ids: ['a'], ts: 1 }, { ids: ['b'], ts: 2 })).toBe(true);
      expect(newer('parts', { mid: 1, ts: 2 }, { mid: 2, ts: 1 })).toBe(false);
    });
  });

  it('lists only the items that changed since the last sync', () => {
    const before = itemsOf(merge(doc, {}));
    const synced = Object.fromEntries(Object.entries(stored(before)).map(([k, v]) => [k, print(norm(k, v))]));
    expect(changed(before, synced)).toEqual([]);
    const after = itemsOf(merge({ routines: [rt('a', 6)] }, merge(doc, {})));
    expect(changed(after, synced)).toEqual(['r/a']);
  });
});

describe('runWins: a write of the running workout only replaces a version its device knew about (#119)', () => {
  const run = (by, u, extra = {}) => ({ sid: 's1', by, u, ...extra });
  it('goes ahead when the account has no workout', () => {
    expect(runWins(null, run('pc', 5), 0)).toBe(true);
    expect(runWins({}, run('pc', 5), 0)).toBe(true);
  });
  it('goes ahead over this device’s own last write: nobody changed it since', () => {
    expect(runWins(run('pc', 9), run('pc', 10), 0)).toBe(true);
  });
  it('goes ahead over another device’s write that this device had seen (taking over, stopping it)', () => {
    expect(runWins(run('phone', 6), run('pc', 7), 6)).toBe(true);
    expect(runWins(run('phone', 6, { end: 'stop' }), run('pc', 7), 8)).toBe(true);
  });
  it('is dropped when another device changed it after this write was made, even with an older clock', () => {
    // the PC went offline having seen u 6; the phone paused at 8; the PC's queued step at 9 must not undo the pause
    expect(runWins(run('phone', 8, { p: 8 }), run('pc', 9), 6)).toBe(false);
    expect(runWins(run('phone', 8), run('pc', 7), 6)).toBe(false);
  });
  it('a new workout from another device the writer never saw is not replaced either', () => {
    expect(runWins({ sid: 's2', by: 'phone', u: 8 }, run('pc', 9), 6)).toBe(false);
  });
  it('nothing to write', () => {
    expect(runWins(run('pc', 1), null, 0)).toBe(false);
  });
});
