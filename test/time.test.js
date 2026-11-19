import { describe, expect, it } from 'vitest';
import { dayAdd, dk, durStepSize, durWords, fmt, fmtDur, parseDur, weekStart } from '../core/time.js';

describe('parseDur: durations as people type them', () => {
  it.each([
    ['90', 90],
    ['0', 0],
    ['1:30', 90],
    ['1.30', 90],
    ['1,30', 90],
    ['01:05', 65],
    ['1:00:00', 3600],
    ['1.02.03', 3723],
    ['20m', 1200],
    ['20 min', 1200],
    ['1m30', 90],
    ['1m 30s', 90],
    ['1m30s', 90],
    ['45s', 45],
    ['45 sec', 45],
    ['1h', 3600],
    ['1h 30m', 5400],
    ['1.5m', 90],
    ['1,5m', 90],
    ['  2M  ', 120],
  ])('%j → %i s', (typed, sec) => {
    expect(parseDur(typed)).toBe(sec);
  });

  it('treats empty input as no value', () => {
    expect(parseDur('')).toBeNull();
    expect(parseDur('   ')).toBeNull();
    expect(parseDur(null)).toBeNull();
    expect(parseDur(undefined)).toBeNull();
  });

  it.each(['abc', '1:75', '1:60', '61:00:00x', '1:2:3:4', '-5', 'm', '1x'])('rejects %j', (typed) => {
    expect(parseDur(typed)).toBeNaN();
  });

  it('accepts numbers as well as strings', () => {
    expect(parseDur(90)).toBe(90);
  });
});

describe('showing durations', () => {
  it('fmt: the timer face (m:ss, seconds alone under a minute, rounded up)', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(9.2)).toBe('10');
    expect(fmt(59)).toBe('59');
    expect(fmt(60)).toBe('1:00');
    expect(fmt(605)).toBe('10:05');
    expect(fmt(-3)).toBe('0');
  });

  it('fmtDur: m:ss, or h:mm:ss from an hour', () => {
    expect(fmtDur(90)).toBe('1:30');
    expect(fmtDur(5)).toBe('0:05');
    expect(fmtDur(3723)).toBe('1:02:03');
    expect(fmtDur('x')).toBe('0:00');
  });

  it('durWords: spoken-style', () => {
    expect(durWords(0)).toBe('0 s');
    expect(durWords(45)).toBe('45 s');
    expect(durWords(120)).toBe('2 min');
    expect(durWords(3725)).toBe('1 h 2 min 5 s');
  });

  it('durStepSize: −/+ steps grow with the value', () => {
    expect([30, 59, 60, 299, 300, 599, 600].map(durStepSize)).toEqual([5, 5, 15, 15, 30, 30, 60]);
  });
});

describe('day keys', () => {
  it('dk: local date as YYYY-MM-DD', () => {
    expect(dk(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });

  it('dayAdd: across months, years and the clock change', () => {
    expect(dayAdd('2026-01-31', 1)).toBe('2026-02-01');
    expect(dayAdd('2026-01-01', -1)).toBe('2025-12-31');
    expect(dayAdd('2028-02-28', 1)).toBe('2028-02-29');
    expect(dayAdd('2026-03-28', 2)).toBe('2026-03-30'); // summer time starts on the 29th
    expect(dayAdd('2026-10-24', 2)).toBe('2026-10-26'); // and ends on the 25th
  });

  it('weekStart: weeks start on Monday', () => {
    expect(weekStart('2026-11-19')).toBe('2026-11-16'); // Thursday
    expect(weekStart('2026-11-16')).toBe('2026-11-16'); // Monday
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // Sunday
  });
});
