/* Browser test: what you can see and tap meets design/README.md on every screen at phone size. Every control has a tap
   area of at least 44×44px (its box, or a larger ::after around it), and text has enough contrast (axe-core's WCAG
   colour check, which also sees opacity and real backgrounds, unlike test/tokens.test.js). */
import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';

const AXE = createRequire(import.meta.url).resolve('axe-core');
const TARGET = 44;

// axe-core is injected as a script, which the app's security policy would block: this test only, not the app
test.use({ bypassCSP: true });

// Every visible control smaller than TARGET in either direction. A checkbox counts as its label, since tapping the label
// ticks it. An ::after that sticks out around the control (the .hit rule in styles.css) is part of its tap area.
const small = (page, scope) =>
  page.evaluate(
    ({ scope, min }) => {
      const out = [];
      const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [data-on*="click:"]';
      for (let e of document.querySelectorAll(`${scope} :is(${sel})`)) {
        if (e.matches('input[type=checkbox], input[type=radio]') && e.closest('label')) e = e.closest('label');
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') continue;
        let [w, h] = [r.width, r.height];
        const a = getComputedStyle(e, '::after');
        if (a.content !== 'none' && a.position === 'absolute') {
          const px = (v) => Math.min(0, parseFloat(v) || 0);
          w -= px(a.left) + px(a.right);
          h -= px(a.top) + px(a.bottom);
        }
        // half a pixel of rounding from layouts that share a row (the days of the week)
        if (w < min - 0.5 || h < min - 0.5) {
          const name = (e.getAttribute('aria-label') || e.title || e.textContent || e.tagName).trim().slice(0, 30);
          out.push(`${name} (${Math.round(w)}×${Math.round(h)})`);
        }
      }
      return out;
    },
    { scope, min: TARGET },
  );

const lowContrast = async (page, scope) => {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async (scope) => {
    const r = await window.axe.run(scope, { runOnly: ['color-contrast'] });
    return r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0].message.split('.')[0]}`));
  }, scope);
};

const check = async (page, scope) => {
  expect.soft(await small(page, scope), `controls under ${TARGET}px in ${scope}`).toEqual([]);
  expect.soft(await lowContrast(page, scope), `text without enough contrast in ${scope}`).toEqual([]);
};

test('every screen: tap areas of at least 44px and readable text', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'New routine' })).toBeVisible();
  await check(page, '#lib');

  await page.getByRole('button', { name: 'This week' }).click();
  await check(page, '#week');
  await page.locator('#week').getByTitle('Back').click();

  await page.getByRole('button', { name: 'History' }).click();
  await check(page, '#hist');
  await page.locator('#hist').getByTitle('Back').click();

  await page.getByRole('button', { name: 'Settings' }).click();
  for (const d of await page.locator('#set details').all()) await d.locator('summary').click();
  await check(page, '#set');
  await page.locator('#set').getByRole('button', { name: 'Back' }).click();

  // the editor with one block of each kind
  await page.getByRole('button', { name: 'New routine' }).click();
  await page.locator('#eName').fill('Tap test');
  for (const kind of ['Reps / counts', 'Timed', 'Sequence', 'Boxing combos', 'Rest'])
    await page.getByRole('button', { name: kind, exact: true }).click();
  for (const d of await page.locator('#edit details').all()) await d.locator('summary').click();
  await check(page, '#edit');

  await page.locator('#edit').getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('#run')).toHaveClass(/\bon\b/);
  await check(page, '#run');
});
