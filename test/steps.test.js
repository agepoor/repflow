import { describe, expect, it } from 'vitest';
import { MOVES, build, moveId, moveTones, moves, movesOf, rTot, stepLen, toneMap } from '../core/steps.js';

const timed = (name, work, extra = {}) => ({ id: name, type: 'timed', name, work, ...extra });
const routine = (blocks, extra = {}) => ({ id: 'r', name: 'R', rounds: 1, rest: 0, prep: 0, blocks, ...extra });
const labels = (steps) => steps.map((s) => (s.type === 'wait' ? `[${s.label}]` : `${s.label}@${s.round}`));

describe('build: the steps a routine plays', () => {
  it('prep, then each round with round rest between rounds (not after the last)', () => {
    const st = build(routine([timed('A', 30), timed('B', 20)], { rounds: 3, rest: 60, prep: 10 }));
    expect(labels(st)).toEqual([
      'Get ready@1',
      'A@1',
      'B@1',
      'Round rest@1',
      'A@2',
      'B@2',
      'Round rest@2',
      'A@3',
      'B@3',
    ]);
    expect(st[0]).toMatchObject({ type: 'time', kind: 'prep', dur: 10 });
    expect(st[3]).toMatchObject({ kind: 'rest', dur: 60 });
    expect(rTot(routine([timed('A', 30), timed('B', 20)], { rounds: 3, rest: 60, prep: 10 }))).toBe(
      10 + 3 * 50 + 2 * 60,
    );
  });

  it('warm-ups only in the first round, finishers only in the last', () => {
    const st = build(
      routine(
        [timed('Warm-up', 60, { firstOnly: true }), timed('Main', 30), timed('Finisher', 45, { lastOnly: true })],
        {
          rounds: 3,
        },
      ),
    );
    expect(labels(st)).toEqual(['Warm-up@1', 'Main@1', 'Main@2', 'Main@3', 'Finisher@3']);
  });

  it('a single round is both first and last', () => {
    const st = build(routine([timed('W', 5, { firstOnly: true }), timed('F', 5, { lastOnly: true })]));
    expect(labels(st)).toEqual(['W@1', 'F@1']);
  });

  it('rest after a block, except after the very last block', () => {
    const st = build(routine([timed('A', 30, { restAfter: 15 }), timed('B', 30, { restAfter: 15 })], { rounds: 2 }));
    expect(labels(st)).toEqual(['A@1', 'Rest@1', 'B@1', 'Rest@1', 'A@2', 'Rest@2', 'B@2']);
  });

  it('a Rest block is played as rest and gets no extra rest after it', () => {
    const st = build(routine([timed('A', 30), { id: 'x', type: 'rest', name: 'Breathe', work: 20, restAfter: 10 }]));
    expect(st.map((s) => [s.label, s.kind])).toEqual([
      ['A', 'work'],
      ['Breathe', 'rest'],
    ]);
  });

  describe('Continue (hold)', () => {
    const blocks = [timed('A', 30), timed('B', 30)];

    it("'' starts everything on its own", () => {
      expect(build(routine(blocks, { rounds: 2 })).some((s) => s.type === 'wait')).toBe(false);
    });

    it("'rounds' waits for a tap before each next round, after the round rest", () => {
      const st = build(routine(blocks, { rounds: 3, rest: 60, hold: 'rounds' }));
      expect(labels(st)).toEqual([
        'A@1',
        'B@1',
        'Round rest@1',
        '[Next round]',
        'A@2',
        'B@2',
        'Round rest@2',
        '[Next round]',
        'A@3',
        'B@3',
      ]);
      expect(st[3].round).toBe(2);
    });

    it("'blocks' waits before every work step but the first", () => {
      const st = build(routine([timed('A', 30, { restAfter: 10 }), timed('B', 30)], { rounds: 2, hold: 'blocks' }));
      expect(labels(st)).toEqual([
        'A@1',
        'Rest@1',
        '[Next block]',
        'B@1',
        '[Next round]',
        'A@2',
        'Rest@2',
        '[Next block]',
        'B@2',
      ]);
    });

    it("'blocks' holds once before a sequence, not before each of its steps", () => {
      const st = build(
        routine([timed('A', 30), { id: 's', type: 'seq', name: 'S', work: 3, steps: 'one\ntwo\nthree' }], {
          hold: 'blocks',
        }),
      );
      expect(labels(st)).toEqual(['A@1', '[Next block]', 'one@1', 'two@1', 'three@1']);
    });

    it('no double tap when a sequence starts with its own tap step', () => {
      const st = build(
        routine([timed('A', 30), { id: 's', type: 'seq', name: 'S', steps: 'Get in position @tap\ngo @5' }], {
          hold: 'blocks',
        }),
      );
      expect(st.filter((s) => s.type === 'wait')).toHaveLength(1);
      expect(st.find((s) => s.type === 'wait')).toMatchObject({ seq: true, label: 'Get in position' });
    });
  });

  it('reps blocks: duration from reps, counts, tempo and breathers (none after the last rep)', () => {
    const [s] = build(
      routine([{ id: 'b', type: 'reps', name: 'Burpees', reps: 8, counts: 12, tempo: 1, repPause: 2, mode: 'guided' }]),
    );
    expect(s).toMatchObject({ type: 'reps', kind: 'work', reps: 8, counts: 12, tempo: 1, repPause: 2 });
    expect(s.dur).toBe(8 * 14 - 2);
  });

  it('reps blocks without their own tempo use the routine count length', () => {
    const [s] = build(
      routine([{ id: 'b', type: 'reps', name: 'R', reps: 2, counts: 4, mode: 'guided' }], { sec: 1.5 }),
    );
    expect(s.tempo).toBe(1.5);
    expect(s.dur).toBe(12);
  });

  it('reps cues come from a comma list', () => {
    const [s] = build(
      routine([{ id: 'b', type: 'reps', name: 'R', reps: 1, counts: 3, mode: 'guided', cues: ' down, up ,, jump ' }]),
    );
    expect(s.cues).toEqual(['down', 'up', 'jump']);
  });

  it('boxing blocks: combos one per line, defaults filled in', () => {
    const [s] = build(
      routine([{ id: 'bx', type: 'boxing', name: 'Box', work: 120, combos: '1-2\n\n 1-2-3 ', minGap: 1, maxGap: 2 }]),
    );
    expect(s).toMatchObject({
      boxing: true,
      combos: ['1-2', '1-2-3'],
      order: 'random',
      repeat: 1,
      poolPause: 0,
      vfit: '',
      bid: 'bx',
    });
  });

  it('sequence blocks: one step per line, with own times, taps and pauses', () => {
    const st = build(
      routine([{ id: 's', type: 'seq', name: 'Mobility', work: 4, steps: 'Cat\nCow @6\n@2\nHold @1:30\nReady? @tap' }]),
    );
    expect(st.map((s) => [s.type, s.label, s.dur])).toEqual([
      ['time', 'Cat', 4],
      ['time', 'Cow', 6],
      ['time', 'Pause', 2],
      ['time', 'Hold', 90],
      ['wait', 'Ready?', undefined],
    ]);
    expect(st[2].q).toBe(true);
    expect(st.map((s) => s.si)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('stepLen', () => {
  it('time steps last their duration; waits and tap reps until a tap', () => {
    expect(stepLen({ type: 'time', dur: 30 })).toBe(30);
    expect(stepLen({ type: 'time', dur: -1 })).toBe(0);
    expect(stepLen({ type: 'wait' })).toBe(Infinity);
    expect(stepLen({ type: 'reps', mode: 'tap', reps: 10 })).toBe(Infinity);
  });

  it('guided reps include the breather after the last rep (the step list stores it without)', () => {
    expect(stepLen({ type: 'reps', mode: 'guided', reps: 3, counts: 4, tempo: 1, repPause: 2 })).toBe(18);
  });
});

describe('boxing combos', () => {
  it('moves split on spaces, dashes and commas', () => {
    expect(movesOf('1-2 slip, 3—2')).toEqual(['1', '2', 'slip', '3', '2']);
    expect(moves('')).toBe(1);
    expect(moves('1-2-3')).toBe(3);
  });

  it('known moves get the same tone in every routine; others the next free one', () => {
    // a move of more than one word is joined with _ (spoken as a space)
    const tm = toneMap([{ type: 'boxing', combos: '1-2\njab cross\nlead_hook rear_hook\nslip duck roll\nspin' }]);
    expect(moveTones('1-2', tm)).toEqual([0, 1]);
    expect(moveTones('jab cross', tm)).toEqual([0, 1]);
    expect(moveTones('lead_hook rear_hook', tm)).toEqual([2, 3]);
    expect(moveTones('slip duck roll', tm)).toEqual([6, 7, 8]);
    expect(moveTones('spin', tm)).toEqual([9]);
    expect(moveTones('never-seen', tm)).toEqual([-1, -1]);
  });

  it('known moves have a stable id, however they are written', () => {
    const ids = (c) => movesOf(c).map(moveId);
    expect(ids('1-2-3-4-5-6')).toEqual(MOVES.slice(0, 6));
    expect(ids('jab cross straight')).toEqual(['jab', 'cross', 'cross']);
    expect(ids('Lead_hook rear_hook hook right_hook')).toEqual(['lead_hook', 'rear_hook', 'lead_hook', 'rear_hook']);
    expect(ids('uppercut rear_uppercut')).toEqual(['lead_uppercut', 'rear_uppercut']);
    expect(ids('slip duck roll bob weave')).toEqual(['slip', 'duck', 'roll', 'roll', 'roll']);
    expect(ids('directe linkse_hoek rechtse_opstoot ontwijk bukken')).toEqual([
      'cross',
      'lead_hook',
      'rear_uppercut',
      'slip',
      'duck',
    ]);
    expect(ids('Forward faint spin 12')).toEqual([null, null, null, null]);
  });

  it("a move's tone is its place in MOVES", () => {
    const tm = toneMap([{ type: 'boxing', combos: MOVES.join(' ') }]);
    expect(moveTones(MOVES.join(' '), tm)).toEqual(MOVES.map((m, i) => i));
  });
});
