import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOVES, TONES } from '../core/steps.js';
import { css, themeVars, tokens } from '../design/tokens.js';

const file = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const T = tokens();
const V = Object.fromEntries(themeVars(T).map(([n, v]) => [n, v]));

/* WCAG contrast of a colour (hex or rgba, composited over what is under it) on an opaque background */
const rgba = (c) => {
  const m = c.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  return m ? [+m[1], +m[2], +m[3], +m[4]] : [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(1);
};
const over = (top, under) => {
  const [r, g, b, a] = rgba(top),
    u = rgba(under);
  return [r, g, b].map((x, i) => x * a + u[i] * (1 - a));
};
const lum = (rgb) => {
  const [r, g, b] = rgb.map((x) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (fg, bg, base = V['--bg']) => {
  const b = over(bg, base),
    f = over(fg, hex(b));
  const [hi, lo] = [lum(f), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (rgb) => `#${rgb.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
const alpha = (c, a) => `rgba(${rgba(c).slice(0, 3).join(', ')}, ${a})`;
const mix = (a, p, b) =>
  hex(
    rgba(a)
      .slice(0, 3)
      .map((x, i) => x * p + rgba(b)[i] * (1 - p)),
  );
const names = (prefix) => Object.keys(V).filter((n) => n.startsWith(prefix));

describe('design tokens', () => {
  it('tokens.css is generated from design/tokens.json (run npm run tokens)', () => {
    expect(file('tokens.css')).toBe(css());
  });

  it('the theme only refers to primitives, so a new theme maps the same names onto other values', () => {
    const walk = (o, path) =>
      Object.entries(o).forEach(([k, x]) => {
        if (k.startsWith('$') || typeof x !== 'object') return;
        if ('$value' in x) {
          if (x.$type === 'color' || path.startsWith('theme.color'))
            expect(x.$value, `${path}.${k}`).toMatch(/^\{primitive\.color\./);
        } else walk(x, `${path}.${k}`);
      });
    walk(T.theme.color, 'theme.color');
  });

  it('the boxing move tags have one colour per move tone', () => {
    expect(names('--tone-')).toEqual([
      ...MOVES.map((m) => `--tone-${m}`),
      ...Array.from({ length: TONES.length - MOVES.length }, (_, i) => `--tone-free-${i + 1}`),
    ]);
  });

  it('the browser and install colours match the background token', () => {
    expect(file('index.html')).toContain(`<meta name="theme-color" content="${V['--bg']}" />`);
    const m = JSON.parse(file('manifest.webmanifest'));
    expect([m.theme_color, m.background_color]).toEqual([V['--bg'], V['--bg']]);
  });

  it('core/ and ui/ have no colours of their own: they use the tokens', () => {
    for (const dir of ['core', 'ui'])
      for (const f of readdirSync(new URL(`../${dir}`, import.meta.url)))
        expect(file(`${dir}/${f}`), `${dir}/${f}`).not.toMatch(
          /#[0-9a-f]{3,8}\b(?![-\w])|rgba?\(|\$\{[^}]*\}[0-9a-f]{2}[;"]/i,
        );
  });

  it('styles.css takes every colour from the tokens', () => {
    const s = file('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(s).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('every token is used', () => {
    const used = ['styles.css', 'index.html', ...readdirSync(new URL('../ui', import.meta.url)).map((f) => `ui/${f}`)]
      .map(file)
      .join('\n');
    // routine and tone colours are picked by name in ui/ (var(--routine-…), var(--tone-…))
    const unused = Object.keys(V).filter(
      (n) => !/^--(routine|tone)-/.test(n) && !new RegExp(`var\\(${n}\\)`).test(used),
    );
    expect(unused).toEqual([]);
  });
});

/* design/README.md: text at least 4.5:1 on what it sits on; focus ring and other marks at least 3:1 */
describe('contrast rules', () => {
  const grounds = ['--bg', '--surface', '--surface-raised'];
  const text = ['--text', '--text-muted', '--accent-text', '--success', '--warning', '--danger-text', '--notice'];

  it.each(text)('%s is readable as text on the page, cards and raised cards', (fg) => {
    for (const bg of grounds) expect(contrast(V[fg], V[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each([...names('--routine-'), '--accent', '--step-prep', '--step-rest'])('text on %s is readable', (bg) => {
    expect(contrast(V['--on-accent'], V[bg])).toBeGreaterThanOrEqual(4.5);
  });

  // .tag in styles.css: a light tint of the move's colour behind text mixed a little towards --text
  const tag = file('styles.css').match(/\.tag\.t \{[^}]*\}/)[0];
  const [tint, mixp] = [/var\(--t\) (\d+)%, transparent/, /var\(--t\) (\d+)%, var\(--text\)/].map(
    (r) => +tag.match(r)[1] / 100,
  );
  it.each(names('--tone-'))('a %s move tag is readable on its tint', (t) => {
    const under = hex(over(alpha(V[t], tint), V['--surface']));
    expect(contrast(mix(V[t], mixp, V['--text']), under)).toBeGreaterThanOrEqual(4.5);
  });

  it('text on a rest step, in a danger message and on a note is readable', () => {
    expect(contrast(V['--step-rest-text'], alpha(V['--step-rest'], 0.12), V['--surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(V['--text'], V['--danger-surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(V['--text'], V['--accent-soft'], V['--surface'])).toBeGreaterThanOrEqual(4.5);
  });

  it('the focus ring stands out (3:1)', () => {
    for (const bg of grounds) expect(contrast(V['--focus'], V[bg])).toBeGreaterThanOrEqual(3);
  });

  // a field is --bg inside a card: its edge has to show against both
  it('the edge of a field stands out (3:1) on the page, cards and raised cards', () => {
    for (const bg of grounds) expect(contrast(V['--border-control'], V[bg]), bg).toBeGreaterThanOrEqual(3);
  });
});
