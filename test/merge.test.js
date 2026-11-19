import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { merge } from '../core/merge.js';

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
