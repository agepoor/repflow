import { describe, expect, it } from 'vitest';
import { fitVoice, learnVoice, phraseBody, planCounts, rateToFit, vSlow, voiceSecOf } from '../core/voice.js';

describe('rateToFit: a voice speed that fits the time a call has', () => {
  // the voice needs about 0.15 s to start, and 0.05 s is kept spare
  it('keeps the normal speed when it fits', () => {
    expect(rateToFit(1, 1, 2)).toBe(1);
  });

  it('speaks faster (a little extra margin, up to 1.5×) when that makes it fit', () => {
    const r = rateToFit(2, 1, 1.7); // needs 2 / 1.5 = 1.33×
    expect(r).toBeCloseTo((2 / 1.5) * 1.03, 6);
    expect(rateToFit(2.2, 1, 1.7)).toBeLessThanOrEqual(1.5);
  });

  it('gives up (0: tones instead) when even 1.5× is too slow, or there is no room', () => {
    expect(rateToFit(3, 1, 1.7)).toBe(0);
    expect(rateToFit(1, 1, 0.2)).toBe(0);
  });

  it('nothing to say: any speed is fine', () => {
    expect(rateToFit(0, 1.2, 0.1)).toBe(1.2);
  });

  it('works from the set speed, not from 1', () => {
    expect(rateToFit(2, 1.2, 1.7)).toBeCloseTo((2 / 1.5) * 1.03, 6);
    expect(rateToFit(1, 1.2, 2)).toBe(1.2);
  });

  it('vSlow: noticeably longer than the time it gets', () => {
    expect([vSlow(1.2, 1), vSlow(1.21, 1)]).toEqual([false, true]);
  });
});

describe('learnVoice / fitVoice: learning how long a voice takes', () => {
  it('ignores phrases too short to learn from, and implausible timings', () => {
    const VFIT = {};
    const VFR = {};
    expect(learnVoice(VFIT, VFR, 'v', 'go', 0.5, 1)).toBe(false);
    expect(learnVoice(VFIT, VFR, 'v', 'Next round', 25, 1)).toBe(false);
    expect(learnVoice(VFIT, VFR, 'v', 'Next round', 0.05, 1)).toBe(false);
    expect(VFIT).toEqual({});
  });

  it('remembers a phrase per voice, and per voice speed', () => {
    const VFIT = {};
    const VFR = {};
    expect(learnVoice(VFIT, VFR, 'v', 'Next round', 1.15, 1)).toBe(true);
    expect(VFIT['v|Next round']).toBe(1); // 1.15 s minus the start-up time
    expect(VFR['v|Next round']).toEqual({ 1: 1 });
    learnVoice(VFIT, VFR, 'v', 'Next round', 0.65, 2); // at 2×: 0.5 s spoken = 1 s at 1×
    expect(VFIT['v|Next round']).toBe(1);
    expect(VFR['v|Next round']).toEqual({ 1: 1, 2: 1 });
  });

  it('a second time averages with the first', () => {
    const VFIT = {};
    const VFR = {};
    learnVoice(VFIT, VFR, 'v', 'Next round', 1.15, 1);
    learnVoice(VFIT, VFR, 'v', 'Next round', 1.35, 1);
    expect(VFIT['v|Next round']).toBe(1.1);
  });

  it('phraseBody: a measurement at this speed first, then the phrase, then the fitted line', () => {
    const fitOf = () => ({ a: 0.5, s: 0.1 });
    expect(phraseBody({}, { 'v|hi there': { 1.5: 0.7 } }, 'v', 'hi there', 1.5, fitOf)).toBe(0.7);
    expect(phraseBody({ 'v|hi there': 0.9 }, {}, 'v', 'hi there', 1.5, fitOf)).toBe(0.9);
    expect(phraseBody({}, {}, 'v', 'hi there', 1.5, fitOf)).toBeCloseTo(0.5 + 0.1 * 10, 6); // 'hi' 3.5 + 'there' 6.5 units
  });

  it('fits a start-up time and a time per letter once it has heard enough different lengths', () => {
    const VFIT = {};
    for (const n of [4, 10, 20, 30, 40]) VFIT['v|' + 'a'.repeat(n)] = 0.3 + 0.05 * (n + 1.5);
    const f = fitVoice(VFIT, 'v');
    expect(f.fit).toBe(true);
    expect(f.a).toBeCloseTo(0.3, 6);
    expect(f.s).toBeCloseTo(0.05, 6);
    expect(f.n).toBe(5);
  });

  it('falls back to its average speed with too few phrases, or a line that makes no sense', () => {
    expect(fitVoice({ v: 1.5, 'v|aaaa': 1, 'v|aaaaaaaaaa': 2 }, 'v')).toEqual({ a: 0, s: 0.062 * 1.5, n: 2 });
    const flat = {};
    for (const n of [4, 10, 20, 30, 40]) flat['v|' + 'a'.repeat(n)] = 1; // as long whatever the length
    expect(fitVoice(flat, 'v').fit).toBeUndefined();
    expect(fitVoice({}, 'other')).toEqual({ a: 0, s: 0.062, n: 0 });
  });

  it('voiceSecOf: start-up time plus the phrase at this speed', () => {
    expect(voiceSecOf('', 1, () => 1)).toBe(0);
    expect(voiceSecOf('Next round', 2, () => 1)).toBeCloseTo(0.15 + 0.5, 6);
  });
});

describe('planCounts: which counts the voice has time to say', () => {
  const s = { counts: 4, tempo: 1, repPause: 0, reps: 10, cues: [] };

  it('every count when they all fit', () => {
    expect(planCounts(s, 'every', () => 0.5).say).toBe('every');
  });

  it('only the reps when the counts are too fast, with the worst one reported', () => {
    const p = planCounts({ ...s, cues: ['down', 'up', 'jump', 'land'] }, 'every', (t) => (t === 'jump' ? 1.6 : 1.2));
    expect(p.say).toBe('reps');
    expect(p.w).toMatchObject({ t: 'jump', v: 1.6, slot: 1 });
  });

  it('nothing when even the rep number does not fit', () => {
    expect(planCounts(s, 'every', () => 5).say).toBe('off');
    expect(planCounts({ ...s, counts: 1 }, 'every', () => 1.5).say).toBe('off');
  });

  it('the last count also has the breather', () => {
    const slow = (t) => (t === '4' ? 2.5 : 0.5);
    expect(planCounts({ ...s, repPause: 2 }, 'every', slow).say).toBe('every');
    expect(planCounts(s, 'every', slow).say).toBe('reps');
  });

  it('keeps a lower setting', () => {
    expect(planCounts(s, 'reps', () => 0.5).say).toBe('reps');
    expect(planCounts(s, 'off', () => 0.5).say).toBe('off');
  });
});
