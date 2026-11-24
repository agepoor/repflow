/* Browser test: the built app loads without errors, a new routine can be made, started and stopped, and the app still
   opens offline. Catches what the core/ tests can't: a broken ui/ module, index.html, sw.js or security policy. */
import { test, expect } from '@playwright/test';

// Every console error fails the test, CSP violations included (Chromium reports them as console errors). Checked after
// each test, also when a step failed, so the error that broke the page shows up next to the failed step.
let errors = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, 'console errors').toEqual([]));

test('make a routine, run it, open the app offline', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'New routine' })).toBeVisible();

  // Make a routine with one timed block
  await page.getByRole('button', { name: 'New routine' }).click();
  await expect(page.locator('#edit')).toHaveClass(/\bon\b/);
  await page.locator('#eName').fill('Browser test');
  await page.getByRole('button', { name: 'Timed' }).click();
  await expect(page.locator('#blocks')).toContainText('Work');

  // Start it: the run screen opens and the get-ready count goes down
  await page.locator('#edit').getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('#run')).toHaveClass(/\bon\b/);
  const big = page.locator('#big');
  await expect(big).toHaveText(/^\d+$/);
  const first = Number(await big.textContent());
  await expect.poll(async () => Number(await big.textContent()), { timeout: 5000 }).toBeLessThan(first);

  // Stop it: back home, with the new routine in the list
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('#run')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#lib')).toHaveClass(/\bon\b/);
  await expect(page.locator('#list')).toContainText('Browser test');

  // Offline: once the offline worker is ready, a reload still opens the app, with the routine
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#list')).toContainText('Browser test');
  await context.setOffline(false);
});

test('Settings shows the version and commit', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#set')).toHaveClass(/\bon\b/);
  // build.sh fills these in from package.json and git; "dev" would mean the placeholder was left in
  await expect(page.locator('#set')).toContainText(/Version \d+\.\d+(\.\d+)? · [0-9a-f]{7,}(-dirty)?/);
});
