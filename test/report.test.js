import { describe, expect, it } from 'vitest';
import {
  ISSUE_NEW,
  MAX_URL,
  REPORT_EMAIL,
  details,
  errorLine,
  issueUrl,
  mailtoUrl,
  reportText,
  shortBrowser,
} from '../core/report.js';

const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  linuxChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

describe('shortBrowser: browser and system in a few words', () => {
  it.each([
    ['androidChrome', 'Chrome 131 on Android 14'],
    ['samsung', 'Samsung Internet 25 on Android 13'],
    ['iphoneSafari', 'Safari 17.5 on iOS 17.5'],
    ['iphoneChrome', 'Chrome 131 on iOS 17.5'],
    ['firefox', 'Firefox 133 on Windows'],
    ['edge', 'Edge 131 on Windows'],
    ['macSafari', 'Safari 18.1 on macOS'],
    ['linuxChrome', 'Chrome 131 on Linux'],
  ])('%s', (k, want) => expect(shortBrowser(UA[k])).toBe(want));

  it('something unknown', () => {
    expect(shortBrowser('')).toBe('Unknown browser');
    expect(shortBrowser('curl/8.0')).toBe('Unknown browser');
  });
});

describe('errorLine: an error, safe to share', () => {
  const now = 100_000;
  it('message, file and line, how long ago', () => {
    expect(
      errorLine({ message: 'x is not defined', file: 'https://punchpace.app/ui/runner.js', line: 42, at: 95_000 }, now),
    ).toBe('x is not defined (runner.js:42), 5 s ago');
  });
  it('cuts addresses down to the file name, so the page address (and its #data) never gets in', () => {
    const l = errorLine(
      {
        message: 'Failed to load https://punchpace.app/#move=eyJzZWNyZXQiOjF9 here',
        file: 'https://punchpace.app/#move=abc',
      },
      now,
    );
    expect(l).not.toMatch(/move=|eyJ|https?:/);
    expect(l).toContain('Failed to load page here (page)');
  });
  it('long messages are cut, empty ones named', () => {
    expect(errorLine({ message: 'a'.repeat(500), at: now }, now)).toBe('a'.repeat(199) + '…, 0 s ago');
    expect(errorLine({ message: '  ', at: now - 600_000 }, now)).toBe('Unknown error, 10 min ago');
    expect(errorLine({ at: now - 7_200_000 }, now)).toBe('Unknown error, 2 h ago');
  });
});

const base = {
  version: '1.0 · a1b2c3d',
  ua: UA.androidChrome,
  installed: true,
  screen: '412×915',
  lang: 'nl-NL',
  now: 100_000,
};

describe('details and reportText', () => {
  it('lists version, browser, how it was opened, screen and user agent', () => {
    const t = reportText(details(base));
    expect(t).toContain('Version: 1.0 · a1b2c3d');
    expect(t).toContain('Browser: Chrome 131 on Android 14');
    expect(t).toContain('Opened as: installed app');
    expect(t).toContain('Screen: 412×915 · language: nl-NL');
    expect(t).toContain('User agent: ' + UA.androidChrome);
    expect(t).toContain('Recent errors: none since the app opened');
  });
  it('keeps the last 5 errors, newest first', () => {
    const errors = Array.from({ length: 8 }, (_, i) => ({ message: 'err ' + i, at: 100_000 }));
    const d = details({ ...base, errors });
    expect(d.errors.map((e) => e.split(',')[0])).toEqual(['err 7', 'err 6', 'err 5', 'err 4', 'err 3']);
  });
  it('a browser tab and missing values', () => {
    const d = details({ now: 0 });
    expect(d.version).toBe('unknown');
    expect(d.browser).toBe('Unknown browser · browser tab');
  });
});

describe('the links', () => {
  it('email: to the project address, with a space for what happened and the report', () => {
    const u = mailtoUrl(details({ ...base, errors: [{ message: 'boom', at: 99_000 }] }));
    expect(u.startsWith(`mailto:${REPORT_EMAIL}?subject=PunchPace%20problem%20report&body=`)).toBe(true);
    const body = decodeURIComponent(u.split('&body=')[1]);
    expect(body.startsWith('What happened?\n')).toBe(true);
    expect(body).toContain('Version: 1.0 · a1b2c3d');
    expect(body).toContain('- boom, 1 s ago');
    expect(u).not.toMatch(/[ \n]/); // encoded
  });
  it('issue: the problem form with version, browser and the rest filled in', () => {
    const u = new URL(issueUrl(details({ ...base, errors: [{ message: 'boom', at: 99_000 }] })));
    expect(u.origin + u.pathname).toBe(ISSUE_NEW);
    expect(u.searchParams.get('template')).toBe('problem.yml');
    expect(u.searchParams.get('version')).toBe('1.0 · a1b2c3d');
    expect(u.searchParams.get('browser')).toBe('Chrome 131 on Android 14 · installed app');
    const more = u.searchParams.get('more');
    expect(more).toContain('- boom, 1 s ago');
    expect(more).toContain('User agent: ');
    expect(more).not.toContain('Version:');
  });
  it('stay short enough: the oldest errors go first', () => {
    const errors = Array.from({ length: 5 }, (_, i) => ({ message: `error ${i} ` + 'x'.repeat(190), at: 100_000 }));
    for (const f of [mailtoUrl, issueUrl]) {
      const u = f(details({ ...base, errors }));
      expect(u.length).toBeLessThanOrEqual(MAX_URL);
      expect(decodeURIComponent(u.replace(/\+/g, ' '))).toContain('error 4'); // the newest is kept
    }
  });
});

describe('the issue form the link fills in', () => {
  it('has the text fields the link names (.github/ISSUE_TEMPLATE/problem.yml)', async () => {
    const { readFileSync } = await import('node:fs');
    const yml = readFileSync(new URL('../.github/ISSUE_TEMPLATE/problem.yml', import.meta.url), 'utf8');
    const u = new URL(issueUrl(details(base)));
    for (const id of [...u.searchParams.keys()].filter((k) => k !== 'template'))
      expect(yml, id).toMatch(new RegExp(`type: (input|textarea)\\n\\s+id: ${id}\\n`));
  });
});
