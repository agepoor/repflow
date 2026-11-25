/* Browser test: one workout seen from two devices. Each browser context is a device with its own device code; they
   share the running workout through a stand-in for cloud.js (fake-cloud.js), so no Firebase is needed. */
import { readFileSync } from 'node:fs';
import { test, expect, devices } from '@playwright/test';

const FAKE = readFileSync(new URL('./fake-cloud.js', import.meta.url), 'utf8');

let shared, pages, errors;
test.beforeEach(() => {
  shared = null;
  pages = [];
  errors = [];
});
test.afterEach(() => expect(errors, 'console errors').toEqual([]));

// a stored value, as the database keeps it: without null fields
const stored = (v) => (v ? JSON.parse(JSON.stringify(v, (k, x) => (x === null ? undefined : x))) : null);

/* a routine short enough to finish during a test: no get-ready, one 8-second block */
const SHORT = [
  {
    id: 'short',
    name: 'Short',
    color: 'blue',
    rounds: 1,
    prep: 0,
    cv: 3,
    blocks: [{ id: 'b1', type: 'timed', name: 'Work', work: 8 }],
  },
];
/* a device signed in to the test account; 'Desktop Chrome' says Windows, so the app calls it "Windows PC".
   routines: what's on it the first time it opens (the presets when left out) */
async function device(browser, baseURL, kind, routines) {
  const ctx = await browser.newContext({ ...devices[kind], baseURL, serviceWorkers: 'block' });
  await ctx.route('**/cloud.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
  await ctx.addInitScript((rs) => {
    localStorage.setItem('rf2_acct', '1'); // signed in before: sync starts on opening
    if (rs && localStorage.getItem('rf2_routines') === null) localStorage.setItem('rf2_routines', JSON.stringify(rs));
  }, routines || null);
  await ctx.exposeFunction('ppGetRun', () => shared);
  await ctx.exposeFunction('ppSetRun', (v) => {
    shared = stored(v);
    for (const p of pages) p.evaluate((x) => window.ppRun && window.ppRun(x), shared).catch(() => {});
  });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  pages.push(page);
  await page.goto('./');
  await expect(page.locator('#list button.go').first()).toBeVisible();
  return page;
}
/* start the first routine on the home screen and pause it */
async function startAndPause(page) {
  await page.locator('#list button.go').first().click();
  await expect(page.locator('#run')).toHaveClass(/\bon\b/);
  await page.locator('#pp').click();
  await expect.poll(() => shared && shared.p).toBeTruthy();
}
const banner = (page) => page.locator('#liveBar');

test('a following device asks: stop the workout everywhere, or only close it here', async ({ browser, baseURL }) => {
  const pc = await device(browser, baseURL, 'Desktop Chrome');
  const phone = await device(browser, baseURL, 'Pixel 7');
  await startAndPause(pc);
  await expect(banner(phone)).toContainText('Paused on Windows PC');

  // Just close here: the workout keeps going on the PC, so the phone shows it again
  await phone.getByRole('button', { name: 'Open' }).click();
  await expect(phone.locator('#run')).toHaveClass(/\bon\b/);
  await phone.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(phone.locator('#ask')).toContainText('It’s paused on Windows PC');
  await phone.getByRole('button', { name: 'Just close here' }).click();
  await expect(phone.locator('#run')).not.toHaveClass(/\bon\b/);
  await expect(banner(phone)).toContainText('Paused on Windows PC');
  await expect(pc.locator('#run')).toHaveClass(/\bon\b/);

  // Stop everywhere: gone on both devices
  await phone.getByRole('button', { name: 'Open' }).click();
  await phone.getByRole('button', { name: 'Stop', exact: true }).click();
  await phone.getByRole('button', { name: 'Stop everywhere' }).click();
  await expect(phone.locator('#run')).not.toHaveClass(/\bon\b/);
  await expect(banner(phone)).toBeEmpty();
  await expect(pc.locator('#run')).not.toHaveClass(/\bon\b/);
  await expect(pc.locator('#toast')).toContainText('Workout stopped on Android phone');
  expect(shared.end).toBe('stop');
});

test('a paused workout whose device is gone can be stopped from the banner', async ({ browser, baseURL }) => {
  const pc = await device(browser, baseURL, 'Desktop Chrome');
  await startAndPause(pc);
  // the PC is gone, as after Reset all gave it a new device code: no device plays the workout any more
  pages = pages.filter((p) => p !== pc);
  await pc.context().close();

  const phone = await device(browser, baseURL, 'Pixel 7');
  await expect(banner(phone)).toContainText('Paused on Windows PC');
  await banner(phone).getByRole('button', { name: 'Stop this workout' }).click();
  await expect(phone.locator('#ask')).toContainText('Stopping it ends it on every device');
  await phone.getByRole('button', { name: 'Stop everywhere' }).click();
  await expect(banner(phone)).toBeEmpty();
  expect(shared.end).toBe('stop');

  // and it stays gone, also on a device that opens the app later
  const tablet = await device(browser, baseURL, 'Pixel 7');
  await expect(tablet.locator('#list button.go').first()).toBeVisible();
  await expect(banner(tablet)).toBeEmpty();
});

/* the cases in docs/multi-device.md that behave as they should; each bug found there gets its test with its fix */
const live = (page) => page.locator('#live');
const logged = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rf2_hist') || '[]').map((h) => h.id));

test('a following device takes over the sound with Play here, or by pausing', async ({ browser, baseURL }) => {
  const pc = await device(browser, baseURL, 'Desktop Chrome');
  const phone = await device(browser, baseURL, 'Pixel 7');
  await pc.locator('#list button.go').first().click();
  await phone.getByRole('button', { name: 'Open' }).click();
  await expect(live(phone)).toContainText('Sound on Windows PC');
  await expect(live(pc)).toBeHidden();

  // Play here: the phone plays the sound, the PC follows; the workout itself doesn't change
  const { s0, i } = shared;
  await live(phone).click();
  await expect.poll(() => shared.dn).toBe('Android phone');
  expect(shared).toMatchObject({ s0, i });
  await expect(live(pc)).toContainText('Sound on Android phone');
  await expect(live(phone)).toBeHidden();

  // pausing on the follower (now the PC) takes the sound back and pauses it on both
  await pc.locator('#pp').click();
  await expect.poll(() => shared.dn).toBe('Windows PC');
  expect(shared.p).toBeTruthy();
  await expect(phone.locator('#pp')).toHaveAttribute('aria-label', 'Resume');
  await expect(live(phone)).toContainText('Sound on Windows PC');
});

test('a workout ends on a device that has it minimized, and is logged once', async ({ browser, baseURL }) => {
  const pc = await device(browser, baseURL, 'Desktop Chrome', SHORT);
  const phone = await device(browser, baseURL, 'Pixel 7');
  await pc.locator('#list button.go').first().click();
  await phone.getByRole('button', { name: 'Open' }).click();
  await phone.locator('#minBtn').click();
  await expect(phone.locator('#mcard')).toContainText('Short');

  await expect(pc.locator('#run')).toHaveClass(/\bfin\b/, { timeout: 15000 });
  await expect(phone.locator('#run')).toHaveClass(/\bfin\b/);
  expect(shared.end).toBe('done');
  // each device logs it under the workout's own id, so sync keeps one entry
  expect(await logged(pc)).toEqual([shared.sid]);
  expect(await logged(phone)).toEqual([shared.sid]);
});

/* deleting the routine (#120) elsewhere, as another device does through sync: here another window on this device
   stores the change (a page without the app, so it doesn't pick up the workout itself, as a second app window would:
   #79). The workout carries on and is logged, but the done screen offers only Close */
async function deleteElsewhere(page) {
  const tab = await page.context().newPage();
  await tab.goto('./robots.txt');
  await tab.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem('rf2_meta') || '{"deleted":{}}');
    meta.deleted = { ...meta.deleted, short: Date.now() };
    localStorage.setItem('rf2_routines', '[]');
    localStorage.setItem('rf2_meta', JSON.stringify(meta));
  });
  await tab.close();
}
const again = (page) => page.locator('#doneView').getByRole('button', { name: 'Again' });
const close = (page) => page.locator('#doneView').getByRole('button', { name: 'Close' });

test('a routine deleted while it runs finishes with only Close', async ({ browser, baseURL }) => {
  const pc = await device(browser, baseURL, 'Desktop Chrome', SHORT);
  await expect(pc.locator('#syncDot')).toBeHidden(); // synced: a sync that ends later would bring the routine back
  await pc.locator('#list button.go').first().click();
  await expect.poll(() => shared && shared.sid).toBeTruthy();
  await deleteElsewhere(pc);

  await expect(pc.locator('#run')).toHaveClass(/\bfin\b/, { timeout: 15000 });
  await expect(pc.locator('#doneView')).toContainText('Workout complete');
  await expect(close(pc)).toBeVisible();
  await expect(again(pc)).toHaveCount(0);
  expect(await logged(pc)).toEqual([shared.sid]);
});

test('Again goes away when the routine is deleted while the done screen is open', async ({ browser, baseURL }) => {
  const pc = await device(browser, baseURL, 'Desktop Chrome', SHORT);
  await pc.locator('#list button.go').first().click();
  await expect(pc.locator('#run')).toHaveClass(/\bfin\b/, { timeout: 15000 });
  await expect(again(pc)).toBeVisible();

  await deleteElsewhere(pc);
  await expect(again(pc)).toHaveCount(0);
  await expect(close(pc)).toBeVisible();
});

test('a workout that ended long before the app was opened again asks before logging', async ({ browser, baseURL }) => {
  const pc = await device(browser, baseURL, 'Desktop Chrome', SHORT);
  await pc.locator('#list button.go').first().click();
  await expect.poll(() => shared && shared.sid).toBeTruthy();
  // as if it started an hour ago and the app was closed since
  const hour = 3600e3;
  await pc.evaluate((h) => {
    const d = JSON.parse(localStorage.getItem('rf2_run'));
    Object.assign(d, { s0: d.s0 - h, t0: d.t0 - h, u: d.u - h });
    localStorage.setItem('rf2_run', JSON.stringify(d));
  }, hour);
  shared = { ...shared, s0: shared.s0 - hour, t0: shared.t0 - hour, u: shared.u - hour };
  await pc.reload();
  await expect(pc.locator('#run')).toHaveClass(/\bfin\b/);
  await expect(pc.locator('#doneView')).toContainText('Ended while the app was closed');
  expect(await logged(pc)).toEqual([]);
  await pc.getByRole('button', { name: 'Log it' }).click();
  expect(await logged(pc)).toEqual([shared.sid]);
});

/* signing out on the controller (#118): the other devices close the workout instead of finishing and logging it */
async function signOutMidWorkout(page, how) {
  await page.locator('#minBtn').click();
  await page.locator('#setBtn').click();
  if (how === 'reset') {
    await page.getByRole('button', { name: 'Reset all' }).click();
    await page.getByRole('button', { name: 'Reset this device' }).click();
  } else {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.locator('#ask').getByRole('button', { name: 'Sign out', exact: true }).click();
  }
}

test('signing out on the controller stops the workout on the other devices; it keeps running there', async ({
  browser,
  baseURL,
}) => {
  const pc = await device(browser, baseURL, 'Desktop Chrome', SHORT);
  const phone = await device(browser, baseURL, 'Pixel 7', SHORT);
  await pc.locator('#list button.go').first().click();
  await phone.getByRole('button', { name: 'Open' }).click();
  await expect(live(phone)).toContainText('Sound on Windows PC');

  await signOutMidWorkout(pc);
  await expect(phone.locator('#run')).not.toHaveClass(/\bon\b/);
  await expect(phone.locator('#toast')).toContainText('Workout stopped on Windows PC');
  expect(shared.end).toBe('stop');
  // the PC still has it (its own write came back, and is ignored), and finishes it on its own
  await expect(pc.locator('#mcard')).toContainText('Short');
  await expect(pc.locator('#run')).toHaveClass(/\bfin\b/, { timeout: 15000 });
  expect(await logged(pc)).toEqual([shared.sid]);
  expect(shared.end).toBe('stop');
  await expect(banner(phone)).toBeEmpty();
  expect(await logged(phone)).toEqual([]);
});

test('Reset all on the controller stops the workout on the other devices', async ({ browser, baseURL }) => {
  const pc = await device(browser, baseURL, 'Desktop Chrome');
  const phone = await device(browser, baseURL, 'Pixel 7');
  await pc.locator('#list button.go').first().click();
  await phone.getByRole('button', { name: 'Open' }).click();

  await signOutMidWorkout(pc, 'reset');
  await expect(phone.locator('#run')).not.toHaveClass(/\bon\b/);
  await expect(phone.locator('#toast')).toContainText('Workout stopped on Windows PC');
  expect(shared.end).toBe('stop');
});

/* starting a routine while another device runs one (#117): ask first, as on the device that runs it */
test('starting a routine while another device runs one asks first; Cancel keeps it running', async ({
  browser,
  baseURL,
}) => {
  const pc = await device(browser, baseURL, 'Desktop Chrome');
  const phone = await device(browser, baseURL, 'Pixel 7');
  await pc.locator('#list button.go').first().click();
  await expect(banner(phone)).toContainText('Live on Windows PC');
  const { sid } = shared;
  const first = await pc.locator('#list .info b').first().textContent();
  const asked = [];

  // Cancel: nothing changes on either device
  phone.once('dialog', (d) => {
    asked.push(d.message());
    d.dismiss();
  });
  await phone.locator('#list button.go').nth(1).click();
  expect(asked[0]).toMatch(new RegExp(`^Stop “${first}” on Windows PC and start “.+”\\?$`));
  await expect(phone.locator('#run')).not.toHaveClass(/\bon\b/);
  await expect(banner(phone)).toContainText('Live on Windows PC');
  expect(shared.sid).toBe(sid);
  await expect(pc.locator('#run')).toHaveClass(/\bon\b/);

  // the same routine: start it again here
  phone.once('dialog', (d) => {
    asked.push(d.message());
    d.dismiss();
  });
  await phone.locator('#list button.go').first().click();
  expect(asked[1]).toBe(`Stop “${first}” on Windows PC and start it again here?`);
  expect(shared.sid).toBe(sid);

  // OK: the phone runs the new one, the PC switches to it
  phone.once('dialog', (d) => d.accept());
  await phone.locator('#list button.go').nth(1).click();
  await expect(phone.locator('#run')).toHaveClass(/\bon\b/);
  await expect.poll(() => shared.sid).not.toBe(sid);
  expect(shared.dn).toBe('Android phone');
  await expect(pc.locator('#toast')).toContainText('started on Android phone');
});
