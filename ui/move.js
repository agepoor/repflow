/* Moving to punchpace.app. On an old address the app forwards itself there, with this device's routines, settings and
   history in the link after the #, which browsers never send to a server. On punchpace.app the app asks before adding
   them. What to move and how it merges is in core/move.js; this module encodes the link and handles the page. */
import { HOME, addsSomething, isOldAddress, pack, summarize, takeIn, unpack } from '../core/move.js';
import { esc } from './html.js';
import { META, S, saveH, saveRaw, setH, setHDEL, setR, setS, setSNAP, snapOf } from './storage.js';
import { ask, localDoc, scheduleSync } from './sync.js';
import { renderList } from './views.js';

const MOVE_PREFIX = '#move=';

// bytes ⇄ base64url, the URL-safe form of base64 (no + / or = to escape)
function toBase64Url(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/* compressed ("z"), since a long workout history makes a long link; plain JSON ("j") where the browser can't compress */
async function encode(data) {
  const json = JSON.stringify(data);
  if (typeof CompressionStream === 'undefined') return 'j' + toBase64Url(new TextEncoder().encode(json));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return 'z' + toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}
async function decode(text) {
  const bytes = fromBase64Url(text.slice(1));
  if (text[0] === 'j') return JSON.parse(new TextDecoder().decode(bytes));
  if (text[0] !== 'z') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

/* On an old address: go to punchpace.app, with this device's data. It comes along on every visit: punchpace.app only
   asks when it adds something, so "Not now" or a forward that didn't arrive is retried by opening the old app again.
   Returns true when the page is leaving. Stays put when offline (the new address wouldn't load), during a workout, or
   with #stay in the address (to reach the old data, e.g. to export it) */
async function forwardFromOldAddress() {
  if (!isOldAddress(location.hostname, location.pathname)) return false;
  if (location.hash === '#stay' || !navigator.onLine || localStorage.getItem('rf2_run')) return false;
  let url = HOME;
  try {
    const from = location.hostname + location.pathname.replace(/\/(index\.html)?$/, '');
    url += MOVE_PREFIX + (await encode(pack(localDoc(), S, from)));
  } catch (e) {} // nothing to carry: forward anyway
  location.replace(url);
  return true;
}

/* On punchpace.app, arriving from an old address. The data is taken out of the address at once (so it isn't left in
   the browser's history), then the app asks first: anyone can make such a link, so nothing is added unasked */
async function takeInMove() {
  if (!location.hash.startsWith(MOVE_PREFIX)) return;
  const text = location.hash.slice(MOVE_PREFIX.length);
  history.replaceState(null, '', location.pathname + location.search);
  let moved = null;
  try {
    moved = unpack(await decode(text));
  } catch (e) {}
  if (!moved) return;
  const result = takeIn(localDoc(), S, moved);
  if (!addsSomething(localDoc(), S, result)) return; // everything from there is here already
  const { routines, workouts } = summarize(moved);
  const what = [
    routines ? `${routines} routine${routines === 1 ? '' : 's'} you made or changed` : '',
    workouts ? `${workouts} workout${workouts === 1 ? '' : 's'} in your history` : '',
  ].filter(Boolean);
  const installed = matchMedia('(display-mode: standalone)').matches;
  ask({
    title: 'PunchPace has moved here',
    text:
      `<p>Bring your routines from <b>${esc(moved.from || 'the old address')}</b>?` +
      (what.length ? ` That's ${esc(what.join(' and '))}.` : '') +
      ` They're added to what's here; nothing here is removed.</p>` +
      (installed
        ? ''
        : '<p>To use it as an app, install PunchPace from here (browser menu → Install app). You can then remove the old one.</p>'),
    buttons: [{ label: 'Bring them', cls: 'primary', run: () => apply(moved) }, { label: 'Not now' }],
  });
}

function apply(moved) {
  const result = takeIn(localDoc(), S, moved);
  setR(result.doc.routines);
  META.deleted = result.doc.deleted;
  META.orderTs = result.doc.order.ts;
  if (result.doc.parts) META.parts = result.doc.parts;
  setH(result.doc.history);
  setHDEL(result.doc.hdel);
  setS(result.settings);
  saveH();
  setSNAP(snapOf());
  saveRaw();
  renderList();
  scheduleSync(); // signed in: the moved routines go to the account too
}

export { forwardFromOldAddress, takeInMove };
