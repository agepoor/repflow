/* Browser test: what you can see and tap meets design/README.md on every screen at phone size. Every control has a tap
   area of at least 44×44px (its box, or a larger ::after around it), and axe-core finds no WCAG A/AA problems: text has
   enough contrast (it also sees opacity and real backgrounds, unlike test/tokens.test.js), every field and control has
   a name. Text follows the browser's
   text size without anything sticking out sideways at 320px wide, and reduce motion stops the flash and pop. */
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

// axe-core's WCAG 2.2 A and AA rules: contrast, a name for every field and control, valid ARIA (#131)
const wcagProblems = async (page, scope) => {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async (scope) => {
    const r = await window.axe.run(scope, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
  }, scope);
};

const check = async (page, scope) => {
  expect.soft(await small(page, scope), `controls under ${TARGET}px in ${scope}`).toEqual([]);
  expect.soft(await wcagProblems(page, scope), `WCAG A/AA problems in ${scope}`).toEqual([]);
};

// Opens every screen in turn and runs check on it: home, week, history, Settings (all its explainers open), the editor
// with one block of each kind (explainers open) and the run screen
async function everyScreen(page, check) {
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

  await page.getByRole('button', { name: 'New routine' }).click();
  await page.locator('#eName').fill('Tap test');
  for (const kind of ['Reps / counts', 'Timed', 'Sequence', 'Boxing combos', 'Rest'])
    await page.getByRole('button', { name: kind, exact: true }).click();
  for (const d of await page.locator('#edit details').all()) await d.locator('summary').click();
  await check(page, '#edit');

  await page.locator('#edit').getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('#run')).toHaveClass(/\bon\b/);
  await check(page, '#run');
}

test('every screen: tap areas of at least 44px and no WCAG A/AA problems', ({ page }) => everyScreen(page, check));

// Everything on a screen that sticks out past its right or left edge
const sideways = (page, scope) =>
  page.evaluate((scope) => {
    const W = document.documentElement.clientWidth,
      out = [];
    for (const e of document.querySelectorAll(`${scope}, ${scope} *`)) {
      const r = e.getBoundingClientRect();
      if (r.width && (r.right > W + 0.5 || r.left < -0.5))
        out.push(`${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${e.textContent.trim().slice(0, 20)}"`);
    }
    if (document.documentElement.scrollWidth > W)
      out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px)`);
    return out;
  }, scope);

test.describe('text at 200% on a 320px screen', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('every screen: the text is larger and nothing sticks out sideways', async ({ page, context }) => {
    // the browser's text size setting, as a phone's text size reaches the page: 32px is 200% of the default 16px
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
    await everyScreen(page, async (page, scope) => {
      expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('32px');
      expect.soft(await sideways(page, scope), `sticks out sideways in ${scope}`).toEqual([]);
    });
  });
});

// The run screen's parts that overlap (#134): a row squeezed smaller than its text (which then spills over the circle or
// is cut off), rows running into each other, the number, cue and sub line sticking out of the circle, and the play
// controls pushed off the bottom
const overlaps = (page) =>
  page.evaluate(() => {
    const box = (e) => e.getBoundingClientRect();
    const name = (e) => e.id || e.className;
    // rows in the layout: not hidden, and not taken out of it (the screen reader line, .sr)
    const rows = [...document.querySelectorAll('#run > *')].filter(
      (e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).position !== 'absolute',
    );
    const out = [];
    // squeezed rows drop to (nearly) nothing; some slack, as the heavy italic font reaches a little past its line box
    for (const e of rows) if (e.clientHeight < e.scrollHeight * 0.8) out.push(`${name(e)} is squeezed`);
    for (const [i, a] of rows.entries())
      for (const b of rows.slice(i + 1))
        if (box(a).height && box(b).height && box(a).bottom > box(b).top + 0.5)
          out.push(`${name(a)} runs into ${name(b)}`);
    if (box(document.querySelector('#run .ctrl')).bottom > innerHeight) out.push('the controls are off the screen');
    const ring = box(document.getElementById('stage'));
    for (const e of document.querySelectorAll('#stage .center > *')) {
      const r = box(e);
      if (r.height && (r.top < ring.top || r.bottom > ring.bottom || r.left < ring.left || r.right > ring.right))
        out.push(`#${e.id} sticks out of the circle`);
    }
    return out;
  });

test.describe('run screen on a short screen (a browser tab) with text at 200%', () => {
  test.use({ viewport: { width: 412, height: 640 } });

  test('nothing overlaps, also with the pill for a workout running elsewhere', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
    await page.goto('./');
    await page.getByRole('button', { name: 'New routine' }).click();
    await page.locator('#eName').fill('Morning boxing and mobility');
    await page.getByRole('button', { name: 'Boxing combos', exact: true }).click();
    await page.locator('#edit').getByRole('button', { name: 'Start', exact: true }).click();
    // past Get ready, to a combo: the call, the step name, the time and the cue all show
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('#call')).not.toBeEmpty();
    expect.soft(await overlaps(page), 'overlapping on the run screen').toEqual([]);
    // the pill a following device shows; set here, as this test has no second device
    await page.evaluate(() => {
      Object.assign(document.getElementById('live'), { hidden: false, textContent: 'Running on Windows · Chrome' });
    });
    expect.soft(await overlaps(page), 'overlapping on the run screen with the pill').toEqual([]);
    await page.getByRole('button', { name: 'Stop' }).click();
  });
});

// Tab until the element with focus matches sel (a CSS selector) and holds text, as someone with only a keyboard would
async function tabTo(page, sel, text = '') {
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate(
      ([sel, text]) => document.activeElement.matches(sel) && document.activeElement.textContent.includes(text),
      [sel, text],
    );
    if (hit) return;
  }
  throw new Error(`Tab never reached ${sel} ${text}`);
}

test('keyboard only: make a routine, start it and stop it; focus follows each screen', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'New routine' })).toBeVisible();
  await tabTo(page, '[data-on="click:newRoutine"]');
  await page.keyboard.press('Enter');
  // a view that opens moves focus to its heading, where a screen reader starts reading
  await expect(page.locator('#eTitle')).toBeFocused();
  await expect(page.locator('#eTitle')).toHaveText('New routine');
  await tabTo(page, '#eName');
  await page.keyboard.type('Keyboard test');
  await tabTo(page, '[data-on="click:addBlock"][data-args=\'["timed"]\']');
  await page.keyboard.press('Enter');
  await expect(page.locator('#blocks')).toContainText('Work');
  await tabTo(page, '#edit .go1');
  await page.keyboard.press('Enter');
  await expect(page.locator('#run')).toHaveClass(/\bon\b/);
  await expect(page.locator('#pp')).toBeFocused();
  await tabTo(page, '#run [data-on="click:stopRun"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('#run')).not.toHaveClass(/\bon\b/);
  // back home, focus returns to where you left it (New routine), not to the top of the page
  await expect(page.locator('[data-on="click:newRoutine"]')).toBeFocused();
  // the routine opens from its name
  await tabTo(page, '#list button.info', 'Keyboard test');
  await page.keyboard.press('Enter');
  await expect(page.locator('#eTitle')).toHaveText('Edit routine');
  await expect(page.locator('#eName')).toHaveValue('Keyboard test');
});

test('the run screen tells a screen reader each new step when the voice coach is off', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings' }).click();
  const voice = page.locator('#setForm').getByRole('checkbox', { name: 'Voice coach' });
  if (await voice.isChecked()) await voice.uncheck();
  await page.locator('#set').getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'New routine' }).click();
  await page.locator('#eName').fill('Announce test');
  await page.getByRole('button', { name: 'Timed', exact: true }).click();
  await page.locator('#edit').getByRole('button', { name: 'Start', exact: true }).click();
  const say = page.locator('#runSay');
  await expect(say).toHaveAttribute('aria-live', 'polite');
  await expect(say).toHaveText('Get ready');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(say).not.toHaveText('Get ready');
  await expect(say).toHaveText(await page.locator('#phase').textContent(), { ignoreCase: true });
});

test('reduce motion: nothing flashes or pops', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'New routine' })).toBeVisible();
  // the classes the app adds: a new step on the run screen, a routine that moved, and the done screen's badge
  const animations = await page.evaluate(() => {
    const badge = Object.assign(document.createElement('div'), { className: 'badge' });
    document.getElementById('doneView').append(badge);
    const card = document.querySelector('#list .rcard');
    document.getElementById('big').classList.add('flash');
    card.classList.add('flash');
    return [document.getElementById('big'), card, badge].map((e) => getComputedStyle(e).animationName);
  });
  expect(animations).toEqual(['none', 'none', 'none']);
});
