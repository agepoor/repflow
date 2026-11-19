/* The timer engine: where a workout is at a given time, which combo comes next, which cues a second or count gets,
   and the beeps ahead (for the background). Times are ms on the wall clock. No DOM or browser UI: runs in any JavaScript engine. */
import { mig, norm } from './routine.js';
import { build, moves, stepLen } from './steps.js';
/* the beeps of a workout from step i0 (started at s0, ms) on, as they will sound: {ms, f (Hz), d (s), type, vol}, in order, up to an hour
   ahead of now and until a step that waits for a tap, or to the end bell. {box, i, s0}: Tones only combo calls of step i (drawn by the caller).
   cd(s): countdown beeps (last s) of step s */
function cuePlan(steps, i0, s0, now, cd) {
  const ev = [],
    at = (ms, f, d, type = 'sine', vol = 1) => ev.push({ ms, f, d, type, vol }),
    bellAt = (ms) => [0, 180, 360].forEach((d) => at(ms + d, 1320, 0.35, 'triangle'));
  for (let i = i0; i < steps.length; i++) {
    const s = steps[i],
      L = stepLen(s);
    if (s0 - now > 3600e3) return ev; // up to an hour ahead
    if (i > i0) {
      if (s.type === 'wait') at(s0, 784, 0.2);
      else if (s.kind === 'work') at(s0, 1046, 0.25, 'square', 0.6);
      else if (s.kind === 'rest') bellAt(s0);
    } // same as enter()
    if (!isFinite(L)) return ev; // waits for a tap
    if (s.type === 'time')
      for (let k = Math.min(cd(s), Math.ceil(s.dur)); k > 0; k--)
        at(s0 + Math.max(0, s.dur - k) * 1000, k === 1 ? 880 : 660, 0.12); // same as tick()
    else if (s.mode === 'guided') {
      const per = s.counts * s.tempo + s.repPause;
      for (let r = 0; r < s.reps; r++)
        for (let k = 0; k < s.counts; k++) {
          const t = s0 + (r * per + k * s.tempo) * 1000;
          if (k) at(t, 740, 0.06, 'sine', 0.5);
          else at(t, 1175, 0.12, 'square', 0.7);
        }
    } // same as countFx()
    if (s.boxing && s.vfit === 'tones' && s.combos.length) ev.push({ box: true, i, s0 });
    s0 += L * 1000;
  }
  bellAt(s0);
  return ev;
} // done
const countdownOf = (s, countdown) => (s.seq && s.dur < 10 ? 0 : countdown | 0); // countdown beeps (last s): none on short sequence steps
const boxStr = (b) => JSON.stringify(b || {}, (k, v) => (v instanceof Set ? [...v] : v));
function unbox(s) {
  let b = {};
  try {
    b = JSON.parse(s || '{}') || {};
  } catch (e) {}
  Object.values(b).forEach((B) => {
    if (B && typeof B === 'object') B.seen = new Set(B.seen || []);
  });
  return b;
}
/* where a workout is at time now (ms), from step i that started at s0: the step it is in and when that started (moved: not i any more),
   or done (the last step ended at end). late: ms since the last step change. wait: a following device gives the playing one a moment to finish first */
function advance(steps, i, s0, now, wait) {
  let moved = false,
    late = 0;
  for (let n = 0; n < 1e4; n++) {
    const end = s0 + stepLen(steps[i]) * 1000;
    if (!(now >= end)) break;
    late = now - end;
    if (i + 1 >= steps.length) {
      if (wait && late < 3000) break;
      return { i, s0, moved, late, end, done: true };
    }
    i++;
    s0 = end;
    moved = true;
  }
  return { i, s0, moved, late, done: false };
}
/* the next call of boxing step s; box: the draw state per block (which combos were called, the shuffle bag, repeats left) */
function drawCombo(s, box) {
  const L = s.combos,
    n = L.length;
  if (!n) return '';
  const B = box[s.bid] || (box[s.bid] = { i: -1, left: 0, bag: [], last: -1, num: 0, seen: new Set() });
  B.poolDone = false;
  if (B.left > 0) {
    B.left--;
    poolChk(B, n);
    return L[B.last];
  } // repeat same combo
  let k;
  if (s.order === 'sequence') {
    k = (B.last + 1) % n;
  } else if (s.order === 'shuffle') {
    if (!B.bag.length) {
      B.bag = [...Array(n).keys()].sort(() => Math.random() - 0.5);
      if (n > 1 && B.bag[0] === B.last) B.bag.push(B.bag.shift());
    }
    k = B.bag.shift();
  } else {
    k = (Math.random() * n) | 0;
    if (n > 1 && k === B.last) k = (k + 1 + ((Math.random() * (n - 1)) | 0)) % n;
  }
  B.last = k;
  B.left = s.repeat - 1;
  B.num = k + 1;
  B.seen.add(k);
  poolChk(B, n);
  return L[k];
}
function poolChk(B, n) {
  if (B.left === 0 && B.seen.size >= n) {
    B.poolDone = true;
    B.seen = new Set();
  }
}
const comboGap = (s, c, box) =>
  moves(c) * (s.cl || 1) +
  s.minGap +
  Math.random() * Math.max(0, s.maxGap - s.minGap) +
  (s.poolPause > 0 && box[s.bid] && box[s.bid].poolDone ? s.poolPause : 0); // until the next call, right after drawCombo drew c
/* a timed step at a new whole second left (sec): beep = countdown beep pitch (0: none), count: also say the number, halfway / ten: say so. cd: countdown beeps (last s) */
function secondCues(s, sec, cd) {
  const b = sec <= cd && sec > 0,
    w = s.kind === 'work';
  return {
    beep: b ? (sec === 1 ? 880 : 660) : 0,
    count: b && !w && sec <= 3,
    halfway: w && !s.boxing && sec === Math.floor(s.dur / 2) && s.dur >= 20,
    ten: w && sec === 10 && s.dur >= 30,
  };
}
/* a guided reps step at t s: rep (0-based) and count c (0-based; -2 = breather) */
function guidedAt(s, t) {
  const per = s.counts * s.tempo + s.repPause,
    rep = Math.floor(t / per),
    inRep = t - rep * per;
  return { rep, c: inRep < s.counts * s.tempo ? Math.floor(inRep / s.tempo) : -2 };
}
/* a stored workout (v) that is still going at time now (ms) */
function runLive(v, now) {
  if (!v || v.end || now - (+v.u || 0) > 12 * 3600e3) return false;
  let st;
  try {
    st = build(norm(mig(JSON.parse(v.r))));
  } catch (e) {
    return false;
  }
  if (v.p != null) return true;
  let t = +v.s0;
  for (let i = v.i | 0; i < st.length; i++) {
    const l = stepLen(st[i]);
    if (!isFinite(l)) return true;
    t += l * 1000;
  }
  return now < t + 3000;
}
export { cuePlan, countdownOf, boxStr, unbox, advance, drawCombo, comboGap, secondCues, guidedAt, runLive };
