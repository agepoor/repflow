/* Design tokens: resolves design/tokens.json and writes tokens.css (npm run tokens). The app's CSS and JS use the theme
   tokens as CSS custom properties: colours by name (--text-muted, --routine-blue, --tone-jab), the scales with a prefix
   (--space-2, --fs-sm, --radius-md, --duration-fast, --font-display). Primitives are not written: only the theme uses them. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PREFIX = { color: '', space: 'space', fontSize: 'fs', radius: 'radius', duration: 'duration', font: 'font' };

const tokens = () => JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));
const get = (t, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), t);
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// a token's value with references followed; colours with an alpha come back as rgba()
function value(t, tok) {
  let v = tok.$value;
  const ref = typeof v === 'string' && v.match(/^\{(.+)\}$/);
  if (ref) {
    const to = get(t, ref[1]);
    if (!to || !('$value' in to)) throw new Error(`token reference ${v} not found`);
    v = value(t, to);
  }
  const a = tok.$extensions && tok.$extensions.alpha;
  return a != null ? `rgba(${hexRgb(v).join(', ')}, ${a})` : v;
}

// every theme token: [css name, css value, path], in file order
function themeVars(t = tokens()) {
  const out = [];
  const walk = (o, path, group) => {
    for (const [k, x] of Object.entries(o)) {
      if (k.startsWith('$')) continue;
      const p = [...path, k];
      if (x && typeof x === 'object' && '$value' in x) {
        const name = [PREFIX[group], ...p.slice(1)].filter(Boolean).join('-');
        const v = value(t, x);
        out.push([
          `--${name}`,
          Array.isArray(v) ? v.map((f) => (/\s/.test(f) ? `'${f}'` : f)).join(', ') : v,
          p.join('.'),
        ]);
      } else if (x && typeof x === 'object') walk(x, p, group);
    }
  };
  for (const [group, o] of Object.entries(t.theme)) {
    if (!(group in PREFIX)) throw new Error(`no CSS prefix for token group ${group}`);
    walk(o, [group], group);
  }
  return out;
}

function css(t = tokens()) {
  const lines = themeVars(t).map(([n, v]) => `  ${n}: ${v};`);
  return `/* Generated from design/tokens.json by npm run tokens: edit that file, not this one. */\n:root {\n${lines.join('\n')}\n}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeFileSync(new URL('../tokens.css', import.meta.url), css());

export { tokens, value, themeVars, css };
