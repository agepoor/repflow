import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CV, PRESETS, ROUTINE_ICONS, canon, norm } from '../core/routine.js';
import { build } from '../core/steps.js';

const schema = JSON.parse(readFileSync(new URL('../schema/routine.schema.json', import.meta.url), 'utf8'));

/* A small validator for the JSON Schema keywords the routine schema uses, so the tests need no extra dependency.
   An unknown keyword fails loudly instead of being skipped, so the schema can't quietly use one this doesn't check. */
const NOTES = new Set(['$schema', '$id', 'title', 'description', '$defs']);
const TYPES = {
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: Array.isArray,
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && isFinite(v),
  integer: Number.isInteger,
  boolean: (v) => typeof v === 'boolean',
};
function check(s, v, path = '$', errs = []) {
  if (s.$ref)
    return check(
      s.$ref
        .split('/')
        .slice(1)
        .reduce((o, k) => o[k], schema),
      v,
      path,
      errs,
    );
  const bad = (m) => errs.push(`${path}: ${m}`);
  for (const [k, x] of Object.entries(s)) {
    if (NOTES.has(k)) continue;
    else if (k === 'type') TYPES[x](v) || bad(`not ${x}`);
    else if (k === 'enum') x.includes(v) || bad(`${JSON.stringify(v)} not one of ${x.join(', ')}`);
    else if (k === 'const') v === x || bad(`not ${JSON.stringify(x)}`);
    else if (k === 'minimum') !(typeof v === 'number') || v >= x || bad(`< ${x}`);
    else if (k === 'maximum') !(typeof v === 'number') || v <= x || bad(`> ${x}`);
    else if (k === 'exclusiveMinimum') !(typeof v === 'number') || v > x || bad(`<= ${x}`);
    else if (k === 'minLength') !(typeof v === 'string') || v.length >= x || bad('too short');
    else if (k === 'pattern') !(typeof v === 'string') || new RegExp(x, 'u').test(v) || bad(`doesn't match ${x}`);
    else if (k === 'required') TYPES.object(v) && x.forEach((p) => p in v || bad(`missing ${p}`));
    else if (k === 'properties')
      TYPES.object(v) && Object.entries(x).forEach(([p, ps]) => p in v && check(ps, v[p], `${path}.${p}`, errs));
    else if (k === 'additionalProperties')
      TYPES.object(v) && x === false && Object.keys(v).forEach((p) => p in s.properties || bad(`unknown field ${p}`));
    else if (k === 'items') Array.isArray(v) && v.forEach((it, i) => check(x, it, `${path}[${i}]`, errs));
    else throw new Error(`schema keyword ${k} is not checked by the test validator`);
  }
  return errs;
}
const valid = (r) => check(schema, r);

/* Shaped like real stored data (made-up content): every block type and routine setting in use before the schema, as v2 */
const V2 = [
  {
    id: 'a1',
    name: 'Morning',
    icon: 'activity',
    color: 'orange',
    rounds: 2,
    rest: 60,
    prep: 20,
    notes: '## Notes\n\n1. **Bold** step',
    cv: 2,
    sec: 1.2,
    upd: 1793607750245,
    streak: false,
    days: [1, 3, 0],
    when: 'am',
    hold: 'blocks',
    skip: '2026-10-23', // one date instead of a list: older data
    add: ['2026-11-01'],
    snd: {
      beeps: true,
      voice: true,
      lang: 'nl_NL',
      voiceURI: '',
      speakCounts: 'every',
      countdown: 3,
      volume: 0.8,
      rate: 1.1,
      pitch: 1,
    },
    blocks: [
      {
        name: 'Plank',
        work: 45,
        cue: 'Plank',
        lastOnly: false,
        restAfter: 10,
        id: 'b1',
        type: 'timed',
        firstOnly: true,
      },
      {
        name: 'Dead bugs',
        reps: 6,
        counts: 8,
        mode: 'guided',
        repPause: 0,
        cues: 'left, extend, return, centre, right, extend, return, centre',
        display: 'both',
        lastOnly: false,
        restAfter: 15,
        id: 'b2',
        type: 'reps',
        tempo: 0,
      },
      {
        name: 'Push-ups',
        reps: 15,
        counts: 1,
        mode: 'tap',
        repPause: 0,
        cues: '',
        display: 'cue',
        lastOnly: false,
        restAfter: 0,
        id: 'b3',
        type: 'reps',
        tempo: 2,
      },
      { name: 'Rest', work: 15, lastOnly: true, restAfter: 0, id: 'b4', type: 'rest' },
      {
        name: 'Steps',
        work: 3,
        steps: 'Ready @tap\nStep one\nHold @10',
        lastOnly: false,
        restAfter: 0,
        id: 'b5',
        type: 'seq',
      },
    ],
  },
  {
    id: 'a2',
    name: 'Drill',
    icon: 'glove',
    color: 'green',
    rounds: 1,
    rest: 60,
    prep: 10,
    notes: '',
    cv: 2,
    sec: 1,
    upd: 1793346245412,
    hold: 'rounds',
    archived: true,
    blocks: [
      {
        name: 'Footwork',
        work: 120,
        combos: 'Forward\nBackward',
        minGap: 1,
        maxGap: 2,
        lastOnly: false,
        restAfter: 0,
        id: 'c1',
        type: 'boxing',
        repeat: 2,
        poolPause: 0,
      },
      {
        name: 'Jab',
        work: 120,
        combos: 'Jab\nFaint-Jab-Jab\n1-2 slip slip',
        minGap: 0.5,
        maxGap: 2,
        lastOnly: false,
        restAfter: 0,
        id: 'c2',
        type: 'boxing',
        order: 'shuffle',
        tempo: 0.4,
        vfit: 'pace',
      },
    ],
  },
];

describe('schema/routine.schema.json', () => {
  it('matches the code: version and icon names', () => {
    expect(schema.properties.cv.const).toBe(CV);
    expect(schema.properties.icon.enum).toEqual(ROUTINE_ICONS);
  });

  it('matches the colours the app has', () => {
    const html = readFileSync(new URL('../ui/html.js', import.meta.url), 'utf8');
    const colors = [...html.match(/const COLORS = \{([^}]*)\}/)[1].matchAll(/(\w+):/g)].map((m) => m[1]);
    expect(schema.properties.color.enum).toEqual(colors);
  });

  it('the validator catches mistakes (so passing means something)', () => {
    const [r] = canon(structuredClone(V2));
    expect(valid({ ...r, extra: 1 })).toEqual(['$: unknown field extra']);
    expect(valid({ ...r, rounds: '2' })).toEqual(['$.rounds: not integer']);
    expect(valid({ ...r, cv: 2 })).toEqual(['$.cv: not 3']);
    expect(valid({ ...r, blocks: [{ ...r.blocks[0], type: 'run' }] })).toHaveLength(1);
  });

  it('every preset is valid', () => {
    PRESETS().forEach((p) => expect(valid(p)).toEqual([]));
  });

  it('stored v2 routines are valid once loaded', () => {
    canon(structuredClone(V2)).forEach((r) => expect(valid(r)).toEqual([]));
  });

  it('loading changes how nothing plays', () => {
    const after = canon(structuredClone(V2));
    V2.forEach((r, i) => expect(build(after[i])).toEqual(build(r)));
  });

  it('repaired routines are valid: missing ids, numbers typed as text, unknown block types', () => {
    const r = canon([
      {
        id: 'x',
        name: '',
        rounds: '3',
        rest: '30',
        prep: null,
        blocks: [{ type: 'reps', reps: '8' }, { type: 'run', work: '20' }, { id: 'd', type: 'rest' }, null],
      },
    ])[0];
    expect(valid(r)).toEqual([]);
    expect(norm(r)).toBe(r); // and nothing left to repair
  });
});
