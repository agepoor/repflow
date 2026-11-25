import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advance,
  boxStr,
  comboGap,
  countdownOf,
  cuePlan,
  drawCombo,
  guidedAt,
  runDevice,
  runLive,
  secondCues,
  unbox,
} from '../core/engine.js';

afterEach(() => vi.restoreAllMocks());

const t = (dur, extra = {}) => ({ type: 'time', kind: 'work', dur, ...extra });

describe('advance: where a workout is after time away (reload, locked screen, background)', () => {
  const steps = [t(10), t(20), t(5)]; // 35 s in all

  it('stays in the step while it is still going', () => {
    expect(advance(steps, 0, 1000, 5000)).toEqual({ i: 0, s0: 1000, moved: false, late: 0, done: false });
  });

  it('a step ends exactly at its length', () => {
    expect(advance(steps, 0, 0, 10_000)).toMatchObject({ i: 1, s0: 10_000, moved: true, late: 0 });
  });

  it('catches up over several steps, with the start time each step really had', () => {
    expect(advance(steps, 0, 1000, 33_000)).toEqual({ i: 2, s0: 31_000, moved: true, late: 2000, done: false });
  });

  it('picks up from a later step too', () => {
    expect(advance(steps, 1, 11_000, 33_000)).toMatchObject({ i: 2, s0: 31_000, moved: true });
  });

  it('reports done (and when it ended) once the last step is over', () => {
    expect(advance(steps, 0, 1000, 40_000)).toEqual({
      i: 2,
      s0: 31_000,
      moved: true,
      late: 4000,
      end: 36_000,
      done: true,
    });
  });

  it('a following device gives the playing one 3 s to finish first', () => {
    expect(advance(steps, 0, 1000, 37_000, true)).toMatchObject({ i: 2, done: false });
    expect(advance(steps, 0, 1000, 39_500, true)).toMatchObject({ done: true });
  });

  it('stops at a step that waits for a tap, however long ago', () => {
    const st = [t(10), { type: 'wait', kind: 'prep' }, t(10)];
    expect(advance(st, 0, 0, 3_600_000)).toEqual({ i: 1, s0: 10_000, moved: true, late: 3_590_000, done: false });
  });

  it('counts guided reps by their full length, breathers included', () => {
    const st = [{ type: 'reps', mode: 'guided', reps: 2, counts: 3, tempo: 1, repPause: 2 }, t(10)];
    expect(advance(st, 0, 0, 9_000)).toMatchObject({ i: 0 });
    expect(advance(st, 0, 0, 10_000)).toMatchObject({ i: 1, s0: 10_000 });
  });
});

describe('runLive: is a stored workout still going?', () => {
  const r = JSON.stringify({
    id: 'r',
    name: 'R',
    rounds: 1,
    rest: 0,
    prep: 0,
    blocks: [{ id: 'a', type: 'timed', work: 30 }],
  });
  const v = { r, i: 0, s0: 1000, u: 1000 };

  it('while its steps last, plus a 3 s grace', () => {
    expect(runLive(v, 20_000)).toBe(true);
    expect(runLive(v, 1000 + 30_000 + 2999)).toBe(true);
    expect(runLive(v, 1000 + 30_000 + 3000)).toBe(false);
  });

  it('not when it ended, is older than 12 h, or cannot be read', () => {
    expect(runLive({ ...v, end: 5000 }, 2000)).toBe(false);
    expect(runLive({ ...v, p: 3 }, 1000 + 12 * 3600e3 + 1)).toBe(false);
    expect(runLive({ ...v, r: '{oops' }, 2000)).toBe(false);
    expect(runLive(null, 0)).toBe(false);
  });

  it('a paused workout is still going', () => {
    expect(runLive({ ...v, p: 12 }, 3600e3)).toBe(true);
  });

  it('a workout waiting for a tap is still going', () => {
    const held = JSON.stringify({ ...JSON.parse(r), rounds: 2, hold: 'rounds' });
    expect(runLive({ ...v, r: held }, 3600e3)).toBe(true);
  });
});

describe('runDevice: which device a workout runs on, as the user reads it', () => {
  const me = { id: 'aaa', name: 'Windows PC' };

  it('this device, by its code', () => {
    expect(runDevice({ by: 'aaa', dn: 'Windows PC' }, me)).toBe('this device');
  });

  it('another device by its name', () => {
    expect(runDevice({ by: 'bbb', dn: 'Android phone' }, me)).toBe('Android phone');
  });

  it('the same kind of device under another code: another browser or app (issue 121)', () => {
    expect(runDevice({ by: 'bbb', dn: 'Windows PC' }, me)).toBe('Windows PC (another browser or app)');
  });

  it('a device without a name, or a workout without a device', () => {
    expect(runDevice({ by: 'bbb' }, me)).toBe('another device');
    expect(runDevice({ by: 'bbb', dn: '' }, { id: 'aaa', name: '' })).toBe('another device');
    expect(runDevice({}, me)).toBe('another device');
    // the name a device gets when its kind can't be told says nothing about it being the same computer
    const unknown = { id: 'aaa', name: 'another device' };
    expect(runDevice({ by: 'bbb', dn: 'another device' }, unknown)).toBe('another device');
  });
});

describe('guidedAt: rep and count at a moment in a guided reps step', () => {
  const s = { counts: 4, tempo: 1, repPause: 2 };
  it.each([
    [0, 0, 0],
    [3.5, 0, 3],
    [4.5, 0, -2], // breather
    [6, 1, 0],
    [11.9, 1, -2],
  ])('at %f s: rep %i, count %i', (time, rep, c) => {
    expect(guidedAt(s, time)).toEqual({ rep, c });
  });
});

describe('secondCues: cues at a new whole second left', () => {
  const work = t(60);
  it('countdown beeps in the last seconds, higher on the last one', () => {
    expect([4, 3, 2, 1, 0].map((sec) => secondCues(work, sec, 3).beep)).toEqual([0, 660, 660, 880, 0]);
  });

  it('numbers are said in rest and prep, not during work', () => {
    expect(secondCues(work, 2, 3).count).toBe(false);
    expect(secondCues(t(30, { kind: 'rest' }), 2, 3).count).toBe(true);
    expect(secondCues(t(30, { kind: 'rest' }), 5, 5).count).toBe(false); // only from 3
  });

  it('halfway on work of 20 s or more (not boxing), ten seconds left on work of 30 s or more', () => {
    expect(secondCues(work, 30, 3).halfway).toBe(true);
    expect(secondCues(t(19), 9, 3).halfway).toBe(false);
    expect(secondCues(t(60, { boxing: true }), 30, 3).halfway).toBe(false);
    expect(secondCues(work, 10, 3).ten).toBe(true);
    expect(secondCues(t(29), 10, 3).ten).toBe(false);
  });

  it('countdownOf: no countdown on short sequence steps', () => {
    expect(countdownOf(t(5, { seq: true }), 3)).toBe(0);
    expect(countdownOf(t(10, { seq: true }), 3)).toBe(3);
    expect(countdownOf(t(5), 3)).toBe(3);
  });
});

describe('cuePlan: the beeps queued ahead for the background', () => {
  const at = (ev) => ev.map((e) => [e.ms, e.f]);
  const cd = () => 3;

  it('countdowns, the start beep of the next step, and the end bell', () => {
    const ev = cuePlan([t(3, { kind: 'prep' }), t(5)], 0, 0, 0, cd);
    expect(at(ev)).toEqual([
      [0, 660],
      [1000, 660],
      [2000, 880],
      [3000, 1046], // work starts
      [5000, 660],
      [6000, 660],
      [7000, 880],
      [8000, 1320], // done: three bell strokes
      [8180, 1320],
      [8360, 1320],
    ]);
  });

  it('rest starts with a bell; a tap step with a short beep, and nothing after it', () => {
    const ev = cuePlan([t(1), t(1, { kind: 'rest' }), { type: 'wait', kind: 'prep' }, t(5)], 0, 0, 0, () => 0);
    expect(at(ev)).toEqual([
      [1000, 1320],
      [1180, 1320],
      [1360, 1320],
      [2000, 784],
    ]);
  });

  it('guided reps: a strong beep on each rep, soft ones on the counts', () => {
    const ev = cuePlan(
      [{ type: 'reps', kind: 'work', mode: 'guided', reps: 2, counts: 2, tempo: 1, repPause: 1 }],
      0,
      0,
      0,
      cd,
    );
    expect(at(ev).slice(0, 4)).toEqual([
      [0, 1175],
      [1000, 740],
      [3000, 1175],
      [4000, 740],
    ]);
  });

  it('plans the steps that start within the hour', () => {
    const ev = cuePlan([t(1800), t(1800), t(1800), t(1800)], 0, 0, 0, () => 0); // starts at 0, 30, 60 and 90 min
    expect(ev.map((e) => e.ms)).toEqual([1800e3, 3600e3]); // the start beeps of the 2nd and 3rd step
    expect(ev.some((e) => e.f === 1320)).toBe(false); // the end bell is more than an hour away
  });

  it('Tones only boxing steps are handed back for the caller to draw', () => {
    const ev = cuePlan([t(60, { boxing: true, vfit: 'tones', combos: ['1-2'] })], 0, 500, 0, () => 0);
    expect(ev).toContainEqual({ box: true, i: 0, s0: 500 });
  });
});

describe('drawCombo: which combo is called next', () => {
  const s = (extra) => ({ combos: ['a', 'b', 'c'], bid: 'x', order: 'random', repeat: 1, ...extra });
  const draws = (step, n, box = {}) => Array.from({ length: n }, () => drawCombo(step, box));

  it('in order, around and around, marking each full pass', () => {
    const box = {};
    expect(draws(s({ order: 'sequence' }), 4, box)).toEqual(['a', 'b', 'c', 'a']);
    const B = box.x;
    expect(B.num).toBe(1);
    drawCombo(s({ order: 'sequence' }), box);
    drawCombo(s({ order: 'sequence' }), box);
    expect(B.poolDone).toBe(true); // all three called again
  });

  it('repeats each combo the set number of times', () => {
    expect(draws(s({ order: 'sequence', repeat: 2 }), 6)).toEqual(['a', 'a', 'b', 'b', 'c', 'c']);
  });

  it('shuffle: every combo once per pass, never the same twice in a row', () => {
    const out = draws(s({ order: 'shuffle', combos: ['a', 'b', 'c', 'd'] }), 400);
    for (let p = 0; p < 400; p += 4) expect(new Set(out.slice(p, p + 4)).size).toBe(4);
    out.slice(1).forEach((c, i) => expect(c).not.toBe(out[i]));
  });

  it('random: never the same twice in a row', () => {
    const out = draws(s(), 400);
    out.slice(1).forEach((c, i) => expect(c).not.toBe(out[i]));
    expect(new Set(out).size).toBe(3);
  });

  it('a single combo, or none', () => {
    expect(draws(s({ combos: ['only'] }), 3)).toEqual(['only', 'only', 'only']);
    expect(drawCombo(s({ combos: [] }), {})).toBe('');
  });

  it('comboGap: time for the moves, the gap, and a pause after a full pass', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const step = s({ order: 'sequence', cl: 0.5, minGap: 1, maxGap: 3, poolPause: 4 });
    const box = {};
    const c = drawCombo(step, box);
    expect(comboGap(step, c, box)).toBe(0.5 + 1 + 1);
    drawCombo(step, box);
    const last = drawCombo(step, box);
    expect(comboGap(step, last, box)).toBe(0.5 + 1 + 1 + 4);
  });

  it('boxStr / unbox: the draw state survives storage', () => {
    const box = {};
    draws(s({ order: 'sequence' }), 2, box);
    const back = unbox(boxStr(box));
    expect(back.x.seen).toBeInstanceOf(Set);
    expect([...back.x.seen]).toEqual([0, 1]);
    expect(drawCombo(s({ order: 'sequence' }), back)).toBe('c');
    expect(unbox('{broken')).toEqual({});
    expect(unbox('')).toEqual({});
  });
});
