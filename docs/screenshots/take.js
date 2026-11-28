/* Takes the README screenshots: `npm run screenshots` builds the site, opens it with the demo routines (demo.json, an
   export like Settings → Backup → Export JSON makes) and a made-up history, and saves each screen next to this file.
   The date, the time and the random combo order are fixed, so running it again only changes a picture when its screen
   changed. Run it when a pull request changes a screen the README shows. */
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const DIR = new URL('./', import.meta.url).pathname;
const DEMO = JSON.parse(readFileSync(new URL('./demo.json', import.meta.url), 'utf8'));
const rid = (name) => DEMO.routines.find((r) => r.name === name).id;

// Tuesday 24 November 2026, 08:40 in Amsterdam (the config's time zone): the morning, with Morning mobility already done
const NOW = new Date('2026-11-24T08:40:00+01:00').getTime();
const H = 36e5,
  DAY = 24 * H;

/* The workouts done before NOW: a 9-day streak, the week so far ticked off in the week view. Made here rather than kept in
   demo.json because their times count back from NOW. [days ago, hour, routine, length in s] */
const DONE = [
  [0, 7.5, 'Morning mobility', 205],
  [1, 7.3, 'Morning mobility', 205],
  [1, 12.5, 'Push-ups', 410],
  [1, 21, 'Box breathing', 101],
  ...[2, 3, 4, 5, 6, 7, 8].flatMap((d) => [
    [d, 7.4, 'Morning mobility', 205],
    [d, 8, 'Burpees 12-count', 490],
    ...(d % 2 ? [[d, 19, 'Shadow boxing 3 × 3', 670]] : [[d, 21.5, 'Box breathing', 101]]),
  ]),
];
function history() {
  const midnight = NOW - 8 * H - 40 * 6e4;
  return DONE.map(([ago, hour, name, dur], i) => {
    const r = DEMO.routines.find((x) => x.name === name);
    return {
      id: 'demo-h' + i,
      rid: r.id,
      name,
      icon: r.icon,
      color: r.color,
      ts: midnight - ago * DAY + hour * H,
      dur,
      rounds: r.rounds,
      reps: 0,
      calls: 0,
    };
  }).sort((a, b) => a.ts - b.ts);
}

// A console error (a broken page, a security policy violation) stops the run before its picture is saved, so a broken
// screen never replaces a good one
let errors = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
});

// Before the app's own scripts run: the demo data on this device, and a random order that is the same every time
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ routines, settings, hist }) => {
      if (localStorage.getItem('rf2_routines') === null) {
        localStorage.setItem('rf2_routines', JSON.stringify(routines));
        localStorage.setItem('rf2_set', JSON.stringify(settings));
        localStorage.setItem('rf2_hist', JSON.stringify(hist));
      }
      let seed = 7;
      Math.random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    { routines: DEMO.routines, settings: DEMO.settings || {}, hist: history() },
  );
  await page.clock.install({ time: NOW - 60e3 });
  await page.goto('./');
  await page.clock.pauseAt(NOW); // time stands still unless a step moves it on
  await expect(page.locator('#list')).toContainText('Morning mobility');
});

const shot = (page, name, type = 'png') => {
  expect(errors, 'console errors').toEqual([]);
  return page.screenshot({ path: DIR + name + (type === 'png' ? '.png' : '.jpg'), type, animations: 'disabled' });
};

const home = async (page, name) => {
  await expect(page.locator('#lib')).toHaveClass(/\bon\b/);
  await shot(page, name);
};
const week = async (page, name) => {
  await page.locator('#weekBtn').click();
  await expect(page.locator('#week')).toHaveClass(/\bon\b/);
  await shot(page, name);
};
// a boxing round 6 s in, with a combo called
const run = async (page, name) => {
  await page.getByRole('button', { name: 'Start Shadow boxing 3 × 3' }).click();
  await expect(page.locator('#run')).toHaveClass(/\bon\b/);
  await page.clock.runFor(16e3); // 10 s get ready, then 6 s of the round
  await expect(page.locator('#big')).toHaveText('2:54');
  await shot(page, name, 'jpeg'); // the run screen's gradient is smaller as a JPEG
};
// the boxing block, with each combo's moves in their tone colours
const editor = async (page, name) => {
  await page.locator(`[data-id="${rid('Shadow boxing 3 × 3')}"] .info`).click();
  await expect(page.locator('#edit')).toHaveClass(/\bon\b/);
  await page.locator('summary', { hasText: 'Show moves per combo' }).click();
  await page
    .locator('#blocks .block')
    .first()
    .evaluate((e) => {
      e.scrollIntoView({ block: 'start' });
      scrollBy(0, -16);
    });
  await shot(page, name);
};

test.describe('phone', () => {
  // the size most people use PunchPace at (Android); 1.5× keeps the files small and sharp at the README's width
  test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  test('home', ({ page }) => home(page, 'home'));
  test('run', ({ page }) => run(page, 'run'));
  test('editor', ({ page }) => editor(page, 'editor'));
  test('week', ({ page }) => week(page, 'week'));
});

// a tablet propped up while you train
test.describe('tablet', () => {
  test.use({ viewport: { width: 800, height: 1280 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  test('run', ({ page }) => run(page, 'tablet-run'));
});

// planning the week at a desk
test.describe('computer', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  test('week', ({ page }) => week(page, 'computer-week'));
});
