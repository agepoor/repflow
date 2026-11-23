/* Moving to punchpace.app: a browser keeps saved data per address, so the old addresses hand their data over in the
   link they forward to. This module decides which addresses are old, packs the data, checks what arrives and merges
   it with what the new address already has. No DOM or browser APIs: the link encoding is done in ui/move.js. */
import { changed, itemsOf, merge, print } from './merge.js';

const HOME = 'https://punchpace.app/';
const MOVE_APP = 'punchpace-move';

// address → path the app lives under. Only these forward; local copies and PR previews never do
const OLD_ADDRESSES = {
  'agepoor.github.io': '/repflow',
  'workout-pacer.web.app': '',
  'workout-pacer.firebaseapp.com': '',
};

function isOldAddress(hostname, pathname) {
  if (!(hostname in OLD_ADDRESSES)) return false;
  const base = OLD_ADDRESSES[hostname];
  return pathname === base || pathname.startsWith(base + '/');
}

/* doc: this device's data in the shape sync uses (routines, deleted, order, history, hdel, parts). Account keys, the
   sync state and a running workout stay behind: they belong to the device, not to the routines */
function pack(doc, settings, from) {
  const { routines, deleted, order, history, hdel, parts } = doc;
  return {
    app: MOVE_APP,
    v: 1,
    from,
    doc: { routines, deleted, order, history, hdel, ...(parts ? { parts } : {}) },
    settings,
  };
}

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/* Checks a packed move. Returns null for anything that isn't one: the link can be crafted by anyone, so only the
   known parts are kept, and routines still go through the usual migration and repair when merged */
function unpack(data) {
  if (!isObject(data) || data.app !== MOVE_APP || data.v !== 1 || !isObject(data.doc)) return null;
  const d = data.doc;
  const doc = {
    routines: Array.isArray(d.routines) ? d.routines.filter(isObject) : [],
    deleted: isObject(d.deleted) ? d.deleted : {},
    order: isObject(d.order) && Array.isArray(d.order.ids) ? d.order : { ids: [], ts: 0 },
    history: Array.isArray(d.history) ? d.history.filter((h) => isObject(h) && h.id && typeof h.ts === 'number') : [],
    hdel: isObject(d.hdel) ? d.hdel : {},
  };
  if (isObject(d.parts)) doc.parts = d.parts;
  return {
    from: typeof data.from === 'string' ? data.from.slice(0, 100) : '',
    doc,
    settings: isObject(data.settings) ? data.settings : null,
  };
}

/* the new address hasn't been used yet: only the default routines, unchanged, and no workouts logged */
function isUnused(doc) {
  return (
    (doc.history || []).length === 0 &&
    Object.keys(doc.deleted || {}).length === 0 &&
    !(doc.order && doc.order.ts) &&
    (doc.routines || []).every((r) => !r.upd)
  );
}

/* What the new address ends up with. Routines and workouts merge as in sync (the newest copy of each wins, nothing is
   duplicated). Settings come along only if the new address hasn't been used: otherwise its own choices stay */
function takeIn(local, localSettings, moved) {
  return {
    doc: merge(local, moved.doc),
    settings: moved.settings && isUnused(local) ? { ...localSettings, ...moved.settings } : localSettings,
  };
}

/* what the question on arrival counts: routines someone made or changed, and workouts logged */
function summarize(moved) {
  return {
    routines: moved.doc.routines.filter((r) => r.upd).length,
    workouts: moved.doc.history.length,
  };
}

/* does taking in the move change anything here? The old address sends its data on every visit (so "Not now", or a
   forward that didn't arrive, can be retried simply by opening it again); the question is only asked when it adds
   something */
function addsSomething(local, localSettings, result) {
  const before = Object.fromEntries(Object.entries(itemsOf(local)).map(([k, v]) => [k, print(v)]));
  const after = itemsOf(result.doc);
  return (
    changed(after, before).length > 0 ||
    Object.keys(before).some((k) => !(k in after)) ||
    JSON.stringify(result.settings) !== JSON.stringify(localSettings)
  );
}

export { HOME, isOldAddress, pack, unpack, isUnused, takeIn, summarize, addsSomething };
