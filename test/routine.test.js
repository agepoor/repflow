import { describe, expect, it } from 'vitest';
import { CV, PRESETS, bDur, canon, holdMode, inRound, logMode, mig, norm, seqSteps } from '../core/routine.js';

describe('norm: repairing blocks', () => {
  // norm compares blocks as JSON, so a block whose keys are in another order counts as repaired and comes back as a
  // new object with the same content. Nothing relies on getting the same object back, so these check the content.
  it('changes nothing in a routine that needs no repair', () => {
    const r = {
      id: 'r',
      name: 'R',
      rounds: 2,
      rest: 30,
      prep: 5,
      blocks: [{ id: 'a', type: 'timed', name: 'Work', work: 30, cue: '', lastOnly: false, restAfter: 0 }],
    };
    expect(norm(r)).toEqual(r);
  });

  it('gives blocks without an id, or with a repeated one, a unique id', () => {
    const r = norm({
      id: 'r',
      name: 'R',
      rounds: 1,
      rest: 0,
      prep: 0,
      blocks: [{ type: 'timed' }, { id: 'x', type: 'timed' }, { id: 'x', type: 'timed' }, { id: '', type: 'timed' }],
    });
    const ids = r.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids[1]).toBe('x');
    expect(ids[0]).toBe('r-b0');
  });

  it('an id that clashes with a generated one still ends up unique', () => {
    const r = norm({
      id: 'r',
      name: 'R',
      rounds: 1,
      rest: 0,
      prep: 0,
      blocks: [{ id: 'r-b1', type: 'rest' }, { type: 'rest' }],
    });
    expect(r.blocks.map((b) => b.id)).toEqual(['r-b1', 'r-b1x']);
  });

  it("fills in each type's defaults and makes unknown types timed", () => {
    const r = norm({
      id: 'r',
      name: 'R',
      rounds: 1,
      rest: 0,
      prep: 0,
      blocks: [
        { id: 'a', type: 'reps' },
        { id: 'b', type: 'dance' },
      ],
    });
    expect(r.blocks[0]).toMatchObject({
      type: 'reps',
      name: 'Reps',
      reps: 10,
      counts: 12,
      mode: 'guided',
      lastOnly: false,
      restAfter: 0,
    });
    expect(r.blocks[1]).toMatchObject({ type: 'timed', name: 'Work', work: 30 });
  });

  it('turns numbers stored as text into numbers, and bad ones into the default', () => {
    const r = norm({
      id: 'r',
      name: 'R',
      rounds: 1,
      rest: 0,
      prep: 0,
      blocks: [{ id: 'a', type: 'timed', work: '45', restAfter: 'abc' }],
    });
    expect(r.blocks[0].work).toBe(45);
    expect(r.blocks[0].restAfter).toBe(0);
  });

  it('drops blocks that are not objects, and repairs the routine itself', () => {
    const r = norm({ id: 'r', rounds: 0, rest: '20', prep: 'x', blocks: [null, 'x', { id: 'a', type: 'rest' }] });
    expect(r.blocks).toHaveLength(1);
    expect(r).toMatchObject({ rounds: 1, rest: 20, prep: 0, name: 'Routine' });
  });

  it('a routine without a blocks list gets an empty one', () => {
    expect(norm({ id: 'r', name: 'R', rounds: 1, rest: 0, prep: 0 }).blocks).toEqual([]);
  });

  it('passes through things that are not routines', () => {
    expect(norm(null)).toBeNull();
    expect(norm('x')).toBe('x');
  });

  it('keeps everything the presets set (it only fills in defaults they leave out)', () => {
    PRESETS().forEach((p) => expect(norm(p)).toMatchObject(p));
  });
});

describe('mig: older data', () => {
  it('v2 → v3: older forms are stored as they are read now', () => {
    const r = mig({ id: 'r', cv: 2, hold: true, icon: '🔥', skip: '2026-10-23', add: '2026-10-24', blocks: [] });
    expect(r).toEqual({
      id: 'r',
      cv: CV,
      hold: 'rounds',
      icon: 'flame',
      skip: ['2026-10-23'],
      add: ['2026-10-24'],
      blocks: [],
    });
    expect(mig({ cv: 2, hold: false, blocks: [] })).toEqual({ cv: CV, blocks: [] });
  });

  it('v2 → v3: a voice language only becomes its own sound & voice', () => {
    const r = mig({ cv: 2, lang: 'nl-NL', blocks: [] });
    expect(r.lang).toBeUndefined();
    expect(r.snd).toMatchObject({ lang: 'nl-NL', voice: true, beeps: true });
    expect(mig({ cv: 2, lang: 'nl-NL', snd: { lang: 'en-GB' }, blocks: [] }).snd).toEqual({ lang: 'en-GB' });
  });

  it('a routine without a version is read as v2', () => {
    expect(mig({ hold: true, blocks: [] })).toEqual({ cv: CV, hold: 'rounds', blocks: [] });
  });

  it('leaves the current version alone, and runs only the steps a routine still needs', () => {
    const r = { cv: CV, hold: true, blocks: [] };
    expect(mig(r)).toBe(r);
    expect(mig('x')).toBe('x');
  });

  it('keeps routines it changes otherwise the same', () => {
    const r = { id: 'r', cv: 2, sec: 1.5, blocks: [{ id: 'a', type: 'reps', tempo: 2 }], upd: 5 };
    expect(mig(r)).toEqual({ ...r, cv: CV });
  });
});

describe('canon: routines from storage or the account', () => {
  it('migrates, repairs, and gives an old copy of a preset its preset id', () => {
    const [r] = canon([
      { id: 'old123', name: 'Burpee Tabata', rounds: 8, rest: 10, prep: 10, blocks: [{ type: 'timed', work: 20 }] },
    ]);
    expect(r.id).toBe('p-tabata');
    expect(r.cv).toBe(CV);
    expect(r.blocks[0].id).toBeTruthy();
  });

  it("doesn't take a preset id that is already in use", () => {
    const list = canon([
      { id: 'p-tabata', name: 'Burpee Tabata', rounds: 1, rest: 0, prep: 0, blocks: [] },
      { id: 'copy', name: 'Burpee Tabata', rounds: 1, rest: 0, prep: 0, blocks: [] },
    ]);
    expect(list.map((r) => r.id)).toEqual(['p-tabata', 'copy']);
  });
});

describe('seqSteps: the Sequence block', () => {
  it('reads times, taps and pauses at the end of a line', () => {
    expect(
      seqSteps({ work: 3, steps: 'Plain\nOwn @6\nDecimal @1,5\nClock @1:30\nWords @ 10 sec\nWait @tap\n@4\n\n  ' }),
    ).toEqual([
      { t: 'Plain', dur: 3 },
      { t: 'Own', dur: 6 },
      { t: 'Decimal', dur: 1.5 },
      { t: 'Clock', dur: 90 },
      { t: 'Words', dur: 10 },
      { t: 'Wait', tap: true },
      { t: 'Pause', dur: 4, q: true },
    ]);
  });

  it('keeps a line with a time it cannot read as typed, and flags it', () => {
    expect(seqSteps({ work: 5, steps: 'Hold @soon' })).toEqual([{ t: 'Hold @soon', dur: 5, bad: true, v: 'soon' }]);
  });

  it('falls back to 3 s per step', () => {
    expect(seqSteps({ steps: 'a' })).toEqual([{ t: 'a', dur: 3 }]);
  });
});

describe("what a routine's settings mean", () => {
  it('bDur: block length in seconds (tap reps: unknown)', () => {
    expect(bDur({ type: 'timed', work: 30 }, {})).toBe(30);
    expect(bDur({ type: 'reps', mode: 'guided', reps: 3, counts: 4, repPause: 2 }, { sec: 1 })).toBe(16);
    expect(bDur({ type: 'reps', mode: 'tap', reps: 3 }, {})).toBeNull();
    expect(bDur({ type: 'seq', work: 2, steps: 'a\nb @5\nc @tap' }, {})).toBe(7);
  });

  it('inRound: every round, warm-up or finisher', () => {
    expect([inRound({}, true, false), inRound({}, false, false)]).toEqual([true, true]);
    expect([inRound({ firstOnly: true }, true, false), inRound({ firstOnly: true }, false, true)]).toEqual([
      true,
      false,
    ]);
    expect([inRound({ lastOnly: true }, true, false), inRound({ lastOnly: true }, false, true)]).toEqual([false, true]);
  });

  it('holdMode and logMode', () => {
    expect([holdMode({}), holdMode({ hold: 'rounds' }), holdMode({ hold: 'blocks' })]).toEqual([
      '',
      'rounds',
      'blocks',
    ]);
    expect([logMode({}), logMode({ streak: false }), logMode({ nolog: true })]).toEqual(['streak', 'log', 'off']);
  });
});
