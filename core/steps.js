/* A routine as the list of steps the timer plays, and the moves and tones of boxing combos.
   No DOM or browser UI: runs in any JavaScript engine. */
import { holdMode, inRound, seqSteps } from './routine.js';
const rTot = (r) => build(r).reduce((a, s) => a + (s.dur || 0), 0);
function build(r) {
  const st = [];
  const P = (s) => st.push(s);
  const hm = holdMode(r),
    tm = toneMap(r.blocks);
  if (r.prep > 0) P({ type: 'time', kind: 'prep', label: 'Get ready', dur: r.prep, round: 1 });
  for (let k = 1; k <= r.rounds; k++) {
    const last = k === r.rounds;
    const bl = r.blocks.filter((b) => inRound(b, k === 1, last));
    bl.forEach((b, bi) => {
      if (b.type === 'reps') {
        const counts = Math.max(1, b.counts | 0),
          reps = Math.max(1, b.reps | 0);
        const tempo = b.tempo > 0 ? b.tempo : r.sec || 1,
          per = counts * tempo + (b.repPause || 0);
        P({
          type: 'reps',
          kind: 'work',
          label: b.name,
          reps,
          counts,
          tempo,
          mode: b.mode,
          repPause: b.repPause || 0,
          display: b.display || 'both',
          cues: (b.cues || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          dur: b.mode === 'tap' ? 0 : reps * per - (b.repPause || 0),
          round: k,
        });
      } else if (b.type === 'timed')
        P({ type: 'time', kind: 'work', label: b.name, dur: b.work, cue: b.cue, round: k });
      else if (b.type === 'boxing')
        P({
          type: 'time',
          kind: 'work',
          label: b.name,
          dur: b.work,
          boxing: true,
          combos: (b.combos || '')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          minGap: b.minGap,
          maxGap: b.maxGap,
          cl: b.tempo > 0 ? b.tempo : r.sec || 1,
          order: b.order || 'random',
          repeat: Math.max(1, b.repeat | 0 || 1),
          poolPause: Math.max(0, +b.poolPause || 0),
          vfit: b.vfit === 'pace' || b.vfit === 'tones' ? b.vfit : '',
          tm,
          bid: b.id,
          round: k,
        });
      else if (b.type === 'seq') {
        const L = seqSteps(b);
        L.forEach((x, j) =>
          P({
            ...(x.tap ? { type: 'wait', kind: 'prep' } : { type: 'time', kind: 'work', dur: x.dur }),
            label: x.t,
            ...(x.q ? { q: true } : {}),
            seq: true,
            blk: b.name,
            si: j,
            sn: L.length,
            round: k,
          }),
        );
      } else if (b.type === 'rest') P({ type: 'time', kind: 'rest', label: b.name || 'Rest', dur: b.work, round: k });
      if (b.restAfter > 0 && b.type !== 'rest' && !(last && bi === bl.length - 1))
        P({ type: 'time', kind: 'rest', label: 'Rest', dur: b.restAfter, round: k });
    });
    if (!last && r.rest > 0) P({ type: 'time', kind: 'rest', label: 'Round rest', dur: r.rest, round: k });
    if (!last && hm === 'rounds') P({ type: 'wait', kind: 'prep', label: 'Next round', round: k + 1 }); // hold until a tap
  }
  let out = st;
  if (hm === 'blocks') {
    out = [];
    let pr = 0; // hold before every work step but the first (after any rest); in a sequence, only before its first step
    st.forEach((s) => {
      if (s.kind === 'work') {
        if (pr && !(s.si > 0))
          out.push({ type: 'wait', kind: 'prep', label: s.round !== pr ? 'Next round' : 'Next block', round: s.round });
        pr = s.round;
      }
      out.push(s);
    });
  }
  return out.filter((s, i) => !(s.type === 'wait' && !s.seq && out[i + 1] && out[i + 1].type === 'wait'));
} // right before a sequence's own tap step: one tap
const stepLen = (s) =>
  s.type === 'wait'
    ? Infinity
    : s.type === 'time'
      ? Math.max(0, +s.dur || 0)
      : s.mode === 'tap'
        ? Infinity
        : s.reps * (s.counts * s.tempo + s.repPause);
function movesOf(c) {
  return c.split(/[\s\-–—,·]+/).filter(Boolean);
}
function moves(c) {
  return Math.max(1, movesOf(c).length);
}
const spoken = (c) => c.replace(/_/g, ' ');
/* move tones: each move of a combo has its own sound, played in rhythm (one per move, at the count length). The same move sounds the
   same in every routine: straights (1 jab, 2 cross) steady, hooks (3, 4) fall, uppercuts (5, 6) rise, lead hand low, rear hand high;
   slip, duck and roll a soft whoosh. Other moves get the next free sound (up to 8 sounds per routine), then a neutral tick.
   [wave, from Hz, to Hz, s, volume]; the tag colours are design tokens (theme.color.tone) */
const TONES = [
    ['triangle', 523, 523, 0.11, 1],
    ['triangle', 784, 784, 0.11, 1], // jab · cross
    ['triangle', 698, 466, 0.15, 1],
    ['triangle', 1047, 698, 0.15, 1], // lead hook · rear hook
    ['triangle', 466, 698, 0.15, 1],
    ['triangle', 698, 1047, 0.15, 1], // lead uppercut · rear uppercut
    ['noise', 3200, 1600, 0.14, 1.6],
    ['noise', 1200, 600, 0.18, 2.6],
    ['noise', 700, 2100, 0.24, 2.6], // slip · duck · roll
    ...[1319, 330, 1568, 262, 1175, 392, 1760, 294].map((f) => ['square', f, f, 0.09, 0.45]),
  ], // free
  TICK = ['noise', 5000, 5000, 0.03, 1.6],
  TFREE = 9;
const mkey = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '');
/* moves with a stable id: how a combo's words are recognised (numbers, English, Dutch, Spanish), so cues, tones and later
   animations refer to the same move. Their order is their tone in TONES. Combos stay text; the ids are derived from it. */
const MOVES = ['jab', 'cross', 'lead_hook', 'rear_hook', 'lead_uppercut', 'rear_uppercut', 'slip', 'duck', 'roll'];
function moveId(t) {
  const k = mkey(t),
    n = k.match(/^[1-6](?![0-9])/),
    rear = /rear|right|back|rechts|achter|derech/.test(k);
  if (n) return MOVES[n[0] - 1];
  if (/upper|opstoot/.test(k)) return rear ? 'rear_uppercut' : 'lead_uppercut';
  if (/hook|hoek|gancho/.test(k)) return rear ? 'rear_hook' : 'lead_hook';
  if (/cross|straight|direct|recht|recto|cruzado/.test(k)) return 'cross';
  if (/jab/.test(k)) return 'jab';
  if (/slip|ontwijk|esquiv/.test(k)) return 'slip';
  if (/duck|buk|duik|agach/.test(k)) return 'duck';
  if (/rol|bob|weave/.test(k)) return 'roll';
  return null;
}
function toneMap(bl) {
  const m = new Map(),
    used = new Set();
  let f = TFREE; // move → sound (-1: tick), for a routine's boxing blocks
  for (const b of bl || [])
    if (b.type === 'boxing')
      for (const l of (b.combos || '').split('\n'))
        for (const t of movesOf(l)) {
          const k = mkey(t);
          if (!k || m.has(k)) continue;
          let i = MOVES.indexOf(moveId(k));
          if (i < 0 && used.size < 8 && f < TONES.length) i = f++;
          m.set(k, i);
          if (i >= 0) used.add(i);
        }
  return m;
}
const moveTones = (c, tm) =>
  movesOf(c).map((t) => {
    const i = tm && tm.get(mkey(t));
    return i == null ? -1 : i;
  });
const callTxt = (c) => spoken(c).replace(/-/g, ' ');
export { rTot, build, stepLen, movesOf, moves, spoken, TONES, TICK, mkey, MOVES, moveId, toneMap, moveTones, callTxt };
