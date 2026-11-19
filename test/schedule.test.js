import { afterEach, describe, expect, it, vi } from 'vitest';
import { daysTxt, nextUp, partAt, partTimes, partsOnIn, rDays, streakOf } from '../core/schedule.js';

afterEach(() => vi.useRealTimers());
const at = (h, m = 0) => new Date(2026, 10, 19, h, m); // Thursday 19 November 2026

describe('parts of the day', () => {
  it('Midday from 12:00 and Evening from 17:00 by default', () => {
    expect(partTimes(undefined)).toEqual({ mid: 720, eve: 1020 });
    expect([at(11, 59), at(12), at(16, 59), at(17), at(23, 59)].map((d) => partAt(undefined, d))).toEqual([
      'am',
      'mid',
      'mid',
      'pm',
      'pm',
    ]);
  });

  it('custom times, and the defaults when they make no sense', () => {
    expect(partTimes({ mid: 660, eve: 1080 })).toEqual({ mid: 660, eve: 1080 });
    expect(partAt({ mid: 660, eve: 1080 }, at(11))).toBe('mid');
    expect(partTimes({ mid: 1080, eve: 660 })).toEqual({ mid: 720, eve: 1020 }); // evening before midday
    expect(partTimes({ mid: 0, eve: 600 })).toEqual({ mid: 720, eve: 1020 });
    expect(partTimes({ mid: 600, eve: 1440 })).toEqual({ mid: 720, eve: 1020 });
  });

  it('the guidance can be switched off', () => {
    expect([partsOnIn(undefined), partsOnIn({}), partsOnIn({ off: true })]).toEqual([true, true, false]);
  });
});

describe('nextUp: the routine to do next today', () => {
  const every = [0, 1, 2, 3, 4, 5, 6];
  const r = (id, when, extra = {}) => ({ id, when, days: every, ...extra });
  const list = [r('eve', 'pm'), r('any', ''), r('morning', 'am'), r('mid1', 'mid'), r('mid2', 'mid')];
  const up = (l, hist = [], parts) => {
    const x = nextUp(l, hist, parts, new Date(Date.now()));
    return x && x.id;
  };

  it('the current part first (in your order), then Anytime, then missed earlier parts, then later ones', () => {
    vi.useFakeTimers({ now: at(13) });
    expect(up(list)).toBe('mid1');
    expect(up(list.filter((x) => x.when !== 'mid'))).toBe('any');
    expect(up(list.filter((x) => x.when === 'am' || x.when === 'pm'))).toBe('morning');
    expect(up(list.filter((x) => x.when === 'pm'))).toBe('eve');
  });

  it('skips what is done today, not planned today, archived, or not logged', () => {
    vi.useFakeTimers({ now: at(13) });
    const hist = [{ rid: 'mid1', ts: at(9).getTime() }];
    expect(up(list, hist)).toBe('mid2');
    expect(
      up([r('a', 'mid', { days: [1] }), r('b', 'mid', { archived: true }), r('c', 'mid', { nolog: true })]),
    ).toBeNull();
  });

  it('a workout yesterday does not count as done today', () => {
    vi.useFakeTimers({ now: at(13) });
    expect(up([r('a', 'mid')], [{ rid: 'a', ts: at(13).getTime() - 24 * 3600e3 }])).toBe('a');
  });

  it('follows custom part times', () => {
    vi.useFakeTimers({ now: at(11) });
    expect(up(list, [], { mid: 600, eve: 1200 })).toBe('mid1');
    expect(up(list)).toBe('morning');
  });

  it('a routine added for today only counts; one skipped today does not', () => {
    vi.useFakeTimers({ now: at(13) });
    expect(up([r('a', 'mid', { days: [], add: ['2026-11-19'] })])).toBe('a');
    expect(up([r('a', 'mid', { skip: ['2026-11-19'] })])).toBeNull();
  });
});

describe('days of the week', () => {
  it('Monday first, ranges of three or more', () => {
    expect(daysTxt({ days: [0, 1, 2, 3, 4, 5, 6] })).toBe('Every day');
    expect(daysTxt({ days: [5, 1, 2, 3, 4] })).toBe('Mon–Fri');
    expect(daysTxt({ days: [1, 3] })).toBe('Mon · Wed');
    expect(daysTxt({ days: [1, 2, 6, 0] })).toBe('Mon · Tue · Sat · Sun');
    expect(daysTxt({ days: [4, 5, 6, 0] })).toBe('Thu–Sun');
    expect(rDays({})).toEqual([]);
  });
});

describe('streaks', () => {
  const day = (d, h = 9) => ({ ts: new Date(2026, 10, d, h).getTime() });

  it('counts days in a row up to today, or up to yesterday while today is still open', () => {
    vi.useFakeTimers({ now: at(13) });
    expect(streakOf([day(17), day(18), day(19)])).toEqual({ cur: 3, best: 3, today: true });
    expect(streakOf([day(17), day(18)])).toEqual({ cur: 2, best: 2, today: false });
    expect(streakOf([day(16), day(17)])).toEqual({ cur: 0, best: 2, today: false });
  });

  it('several workouts on one day count once; Log only workouts not at all', () => {
    vi.useFakeTimers({ now: at(13) });
    expect(streakOf([day(19, 8), day(19, 12), day(18)])).toMatchObject({ cur: 2 });
    expect(streakOf([day(19), { ...day(18), streak: false }, day(17)])).toMatchObject({ cur: 1, best: 1 });
  });

  it('the best run can be in the past, across a month end', () => {
    vi.useFakeTimers({ now: at(13) });
    const oct = [29, 30, 31].map((d) => ({ ts: new Date(2026, 9, d, 9).getTime() }));
    expect(streakOf([...oct, day(1), day(19)])).toEqual({ cur: 1, best: 4, today: true });
  });
});
