import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { CV, PRESETS, ROUTINE_ICONS, canon, norm } from '../core/routine.js';
import { build } from '../core/steps.js';

const schema = JSON.parse(readFileSync(new URL('../schema/routine.schema.json', import.meta.url), 'utf8'));

/* strict: a keyword ajv doesn't know is an error instead of being ignored. valid(r) lists what is wrong ([] = valid). */
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const valid = (r) =>
  validate(r)
    ? []
    : validate.errors.map(
        (e) =>
          `${e.instancePath || '/'} ${e.message}${e.params.additionalProperty ? ': ' + e.params.additionalProperty : ''}`,
      );

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

  it('matches the routine colours in the design tokens', () => {
    const t = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url), 'utf8'));
    expect(schema.properties.color.enum).toEqual(Object.keys(t.theme.color.routine).filter((k) => !k.startsWith('$')));
  });

  it('the validator catches mistakes (so passing means something)', () => {
    const [r] = canon(structuredClone(V2));
    expect(valid({ ...r, extra: 1 })).toEqual(['/ must NOT have additional properties: extra']);
    expect(valid({ ...r, rounds: '2' })).toEqual(['/rounds must be integer']);
    expect(valid({ ...r, cv: 2 })).toEqual(['/cv must be equal to constant']);
    expect(valid({ ...r, blocks: [{ ...r.blocks[0], type: 'run' }] })).toEqual([
      '/blocks/0/type must be equal to one of the allowed values',
    ]);
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
