/* Shared HTML bits: icons, colours, escaping, the toast, info boxes. */
import { does } from './actions.js';
import { MOVES } from '../core/steps.js';
const IC = {
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  wind: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  nolog:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/><path d="M3 3l18 18"/>',
  flame:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  glove:
    '<path d="M8 12.5V8.5A5.5 5.5 0 0 1 13.5 3 5.5 5.5 0 0 1 19 8.5V13a4 4 0 0 1-4 4h-4a3 3 0 0 1-3-3"/><path d="M8 11H6.5a2.5 2.5 0 0 0 0 5H9"/><path d="M10.5 17v4h7v-4.5"/><path d="M12 8.5h4"/>',
  dumbbell:
    '<path d="M6.5 6.5v11"/><path d="M17.5 6.5v11"/><path d="M3.5 9v6"/><path d="M20.5 9v6"/><path d="M6.5 12h11"/>',
  timer: '<circle cx="12" cy="14" r="8"/><path d="M10 2h4"/><path d="M12 14l3-3"/>',
  heart:
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  repeat:
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  basketball:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M2 12h20"/><path d="M5.5 4.4c3.2 3.8 3.2 11.4 0 15.2"/><path d="M18.5 4.4c-3.2 3.8-3.2 11.4 0 15.2"/>',
  soccer:
    '<circle cx="12" cy="12" r="10"/><path d="m12 7 4.75 3.45-1.8 5.6h-5.9l-1.8-5.6z"/><path d="M12 7V2"/><path d="m16.75 10.45 4.76-1.55"/><path d="m14.95 16.05 2.94 4.04"/><path d="m9.05 16.05-2.94 4.04"/><path d="M7.25 10.45 2.49 8.9"/>',
  volleyball:
    '<circle cx="12" cy="12" r="10"/><path d="M11.1 7.1a16.55 16.55 0 0 1 10.9 4"/><path d="M12 12a12.6 12.6 0 0 1-8.7 5"/><path d="M16.8 13.6a16.55 16.55 0 0 1-9 7.5"/><path d="M20.7 17a12.8 12.8 0 0 0-8.7-5 13.3 13.3 0 0 1 0-10"/><path d="M6.3 3.8a16.55 16.55 0 0 0 1.9 11.5"/>',
  tennis:
    '<circle cx="12" cy="12" r="10"/><path d="M5.6 4.3a10 10 0 0 1 0 15.4"/><path d="M18.4 4.3a10 10 0 0 0 0 15.4"/>',
  medball:
    '<circle cx="12" cy="12" r="10"/><path d="M2.6 9.5c4.6 2.6 14.2 2.6 18.8 0"/><path d="M2.6 14.5c4.6 2.6 14.2 2.6 18.8 0"/>',
  juggle: '<circle cx="12" cy="6.5" r="3.5"/><circle cx="6" cy="16.5" r="3.5"/><circle cx="18" cy="16.5" r="3.5"/>',
  bounce:
    '<circle cx="15" cy="7" r="4"/><path d="M2 21h20"/><path d="M4 17.5c1.5-3.5 3.5-6 6.5-8" stroke-dasharray="2 3"/>',
  hash: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
  steps:
    '<path d="M10 12h11"/><path d="M10 18h11"/><path d="M10 6h11"/><path d="M4 10h2"/><path d="M4 6h1v4"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sliders:
    '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  flask:
    '<path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.6a1 1 0 0 0 .9 1.4h12.8a1 1 0 0 0 .9-1.4l-5.1-10.2a2 2 0 0 1-.2-.9V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  archive:
    '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  unarchive:
    '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  alert:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  cloudOk: '<path d="m17 15-5.5 5.5L9 18"/><path d="M5 17.743A7 7 0 1 1 15.71 10h1.79a4.5 4.5 0 0 1 1.5 8.742"/>',
  cloudOff:
    '<path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  vol: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
  sort: '<path d="M7 20V4M3.5 7.5 7 4l3.5 3.5M17 4v16M13.5 16.5 17 20l3.5-3.5"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pause:
    '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  prev: '<path d="M18 5v14l-10-7z" fill="currentColor"/><path d="M6 5v14"/>',
  next: '<path d="M6 5v14l10-7z" fill="currentColor"/><path d="M18 5v14"/>',
};
function svgi(n, sz = 20, sw = 2) {
  return `<svg class="ic" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || IC.activity}</svg>`;
}

/* colours come from the design tokens (tokens.css): a routine's colour by name, tints of it with color-mix */
const COLORS = Object.fromEntries(
  ['orange', 'red', 'blue', 'green', 'purple', 'yellow', 'teal', 'pink'].map((c) => [c, `var(--routine-${c})`]),
);
const tint = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
// a move tone's tag colour: known moves by id, then the free ones in order (design/tokens.json theme.color.tone)
const toneColor = (i) => `var(--tone-${i < MOVES.length ? MOVES[i] : 'free-' + (i - MOVES.length + 1)})`;
function toast(msg, info) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'alert');
    t.onclick = () => t.remove();
    document.body.appendChild(t);
  }
  t.className = info ? 'info' : '';
  t.textContent = msg;
  clearTimeout(t._h);
  t._h = setTimeout(() => t.remove(), 8000);
}
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const OPEN = new Set();
function infoToggle(el, k) {
  if (el.open) OPEN.add(k);
  else OPEN.delete(k);
} // keeps an info box open across re-renders
function info(k, title, body) {
  return `<details class="info" ${OPEN.has(k) ? 'open' : ''} ${does('toggle:infoToggle', k)}><summary>${title}</summary><div class="body">${body}</div></details>`;
}
function nsTag(t, title, s = 13) {
  return `<span class="nst" title="${title}">${svgi('nolog', s)}${t}</span>`;
}
export { svgi, COLORS, tint, toneColor, toast, esc, infoToggle, info, nsTag };
