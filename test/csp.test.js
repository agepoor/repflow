/* The Content Security Policy: the header (firebase.json) and the <meta> tag (index.html, for GitHub Pages) stay in
   step, scripts only come from known hosts, and the app has no inline event handlers the policy would block. */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const file = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = file('index.html');
const header = JSON.parse(file('firebase.json'))
  .hosting.headers.flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy').value;
const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)[1];
const parse = (p) =>
  Object.fromEntries(
    p
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([k, ...v]) => [k, v]),
  );

describe('Content Security Policy', () => {
  const H = parse(header),
    M = parse(meta);
  it('meta tag matches the header, except frame-ancestors (header only)', () => {
    const { 'frame-ancestors': fa, ...rest } = H;
    expect(fa).toEqual(["'none'"]);
    expect(M).toEqual(rest);
  });
  it('allows no inline scripts or eval', () => {
    for (const d of ['default-src', 'script-src']) {
      expect(H[d]).not.toContain("'unsafe-inline'");
      expect(H[d]).not.toContain("'unsafe-eval'");
    }
    expect(H['object-src']).toEqual(["'none'"]);
  });
  it('lets the app load the Firebase library it imports', () => {
    const sdk = file('cloud.js').match(/const SDK = '(https:\/\/[^/]+)\//)[1];
    expect(H['script-src']).toContain(sdk);
  });
  it('lets the offline worker fetch and cache that library (the worker gets the header too)', () => {
    const sdk = file('cloud.js').match(/const SDK = '(https:\/\/[^/]+)\//)[1];
    expect(file('sw.js')).toContain(sdk);
    expect(H['connect-src']).toContain(sdk);
  });
  it('lets App Check run its reCAPTCHA script, frame and requests', () => {
    expect(file('cloud.js')).toMatch(/provider: 'ReCaptcha\w+Provider'/);
    expect(H['script-src']).toContain('https://www.google.com');
    expect(H['frame-src']).toContain('https://www.google.com');
    expect(H['connect-src']).toContain('https://www.google.com');
  });
  it('lets sign-in open its frame on the auth domain', () => {
    const auth = file('cloud.js').match(/authDomain: '([^']+)'/)[1];
    expect(H['frame-src']).toContain(`https://${auth}`);
  });
});

describe('no inline event handlers', () => {
  const files = ['index.html', ...readdirSync(new URL('../ui', import.meta.url)).map((f) => `ui/${f}`)];
  it.each(files)('%s', (f) => {
    // attributes like onclick="…" in markup or in HTML built in strings (not comments)
    const src = file(f).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src.match(/\son[a-z]+\s*=\s*["']/g)).toBeNull();
  });
});
