/* Sync: merging this device's data with the account's, and the items the account stores it as. No DOM or browser UI:
   runs in any JavaScript engine. */
import { canon } from './routine.js';
/* L: this device, Rm: the account (all of it, or only the items that changed). stored: ids of routines already in the
   account besides those in Rm (Rm may be partial), so two devices settling the same identical copies keep the same one */
function merge(L, Rm, stored = []) {
  const del = { ...(Rm.deleted || {}) };
  Object.entries(L.deleted || {}).forEach(([k, v]) => {
    if (!(del[k] >= v)) del[k] = v;
  });
  const by = {};
  [...canon(Rm.routines || []), ...canon(L.routines || [])].forEach((r) => {
    const o = by[r.id];
    if (!o || (r.upd || 0) > (o.upd || 0)) by[r.id] = r;
  });
  let list = Object.values(by).filter((r) => !(del[r.id] >= (r.upd || 0)));
  // collapse identical copies (same content, different id), e.g. presets created on two devices: a copy the account
  // already has stays; between two of those, the lowest id, so every device makes the same choice
  const strip = (r) => {
    const { id, upd, ...x } = r;
    return JSON.stringify({ ...x, blocks: (x.blocks || []).map(({ id, ...b }) => b) });
  };
  const keep = {};
  const rid = new Set([...(Rm.routines || []).map((r) => r.id), ...stored]);
  list
    .sort((a, b) => rid.has(b.id) - rid.has(a.id) || (a.id < b.id ? -1 : 1))
    .forEach((r) => {
      const k = strip(r);
      if (keep[k]) del[r.id] = Math.max(Date.now(), r.upd || 0);
      else keep[k] = r;
    });
  list = list.filter((r) => !(del[r.id] >= (r.upd || 0)));
  const lo = L.order || { ids: [], ts: 0 },
    ro = Rm.order || { ids: [], ts: 0 };
  const [w, o] = (lo.ts || 0) > (ro.ts || 0) ? [lo, ro] : [ro, lo];
  const pos = (id) => {
    let i = w.ids.indexOf(id);
    if (i >= 0) return i;
    i = o.ids.indexOf(id);
    return i >= 0 ? 1e4 + i : 2e4;
  };
  list.sort((a, b) => pos(a.id) - pos(b.id) || (a.id < b.id ? -1 : 1));
  const hd = { ...(Rm.hdel || {}) };
  Object.entries(L.hdel || {}).forEach(([k, v]) => {
    if (!(hd[k] >= v)) hd[k] = v;
  });
  // a workout followed on two devices is logged on both under the same id: the stored copy wins, so devices agree
  const hm = {};
  [...(L.history || []), ...(Rm.history || [])].forEach((h) => {
    if (h && h.id) hm[h.id] = h;
  });
  const history = Object.values(hm)
    .filter((h) => !hd[h.id])
    .sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const lp = L.parts,
    rp = Rm.parts,
    parts = lp && rp ? ((lp.ts || 0) >= (rp.ts || 0) ? lp : rp) : lp || rp; // parts of the day: the newest change wins
  return {
    app: 'repflow',
    v: 1,
    routines: list,
    deleted: del,
    order: { ids: list.map((r) => r.id), ts: Math.max(lo.ts || 0, ro.ts || 0) },
    history,
    hdel: hd,
    ...(parts ? { parts } : {}),
  };
}

/* The account stores every routine and workout as its own item, so a device downloads only what changed:
   'r/<id>': {d: routine JSON} or {del: time deleted}; 'h/<id>': {d: workout JSON} or {del: time deleted};
   'order': {ids, ts}; 'parts': parts of the day. (cloud.js adds m: when the item was written.) */
function itemsOf(doc) {
  const it = {};
  Object.entries(doc.deleted || {}).forEach(([id, t]) => (it['r/' + id] = { del: t }));
  (doc.routines || []).forEach((r) => (it['r/' + r.id] = { d: JSON.stringify(r) })); // merge only keeps routines edited after their delete
  (doc.history || []).forEach((h) => (it['h/' + h.id] = { d: JSON.stringify(h) }));
  Object.entries(doc.hdel || {}).forEach(([id, t]) => (it['h/' + id] = { del: t }));
  const o = doc.order || {};
  it.order = { ids: o.ids || [], ts: o.ts || 0 };
  if (doc.parts) it.parts = doc.parts;
  return it;
}
/* items (all, or only some) back into a document merge() understands; broken items are skipped */
function docOf(items) {
  const doc = { routines: [], deleted: {}, history: [], hdel: {} };
  const parse = (v, id) => {
    try {
      const x = JSON.parse(v.d);
      return x && x.id === id ? x : null;
    } catch (e) {
      return null;
    }
  };
  Object.entries(items || {}).forEach(([k, v]) => {
    if (!v || typeof v !== 'object') return;
    const [kind, id] = [k.slice(0, 2), k.slice(2)];
    if (kind === 'r/' || kind === 'h/') {
      const [list, dels] = kind === 'r/' ? [doc.routines, doc.deleted] : [doc.history, doc.hdel];
      if (typeof v.del === 'number') dels[id] = v.del;
      else {
        const x = parse(v, id);
        if (x) list.push(x);
      }
    } else if (k === 'order') doc.order = { ids: Array.isArray(v.ids) ? v.ids : [], ts: v.ts || 0 };
    else if (k === 'parts') {
      const { m, ...p } = v;
      doc.parts = p;
    }
  });
  return doc;
}
/* should this device's version of an item replace the stored one? The same rules as merge(): the newest edit or delete
   of a routine (a delete wins a tie), a deleted workout stays deleted and otherwise the stored copy stays, the newest
   order and parts of the day */
function newer(key, stored, mine) {
  if (!mine) return false;
  if (!stored) return true;
  if (key.startsWith('h/')) return typeof mine.del === 'number' && typeof stored.del !== 'number';
  if (key.startsWith('r/')) {
    const t = (v) => {
      if (typeof v.del === 'number') return [v.del, 1];
      try {
        return [JSON.parse(v.d).upd || 0, 0];
      } catch (e) {
        return [-1, 0];
      }
    };
    const [a, b] = [t(mine), t(stored)];
    return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  }
  return (mine.ts || 0) > (stored.ts || 0);
}
/* a short fingerprint of an item, to tell which items changed since this device last synced them */
function print(v) {
  const s = JSON.stringify(v, (k, x) => (k === 'm' ? undefined : x));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36) + s.length.toString(36);
}
/* an item as it came back from the account, in the form itemsOf() makes it (no m, empty lists back), or undefined if broken */
const norm = (k, v) => itemsOf(docOf({ [k]: v }))[k];
/* keys of the items that differ from what this device last synced (synced: key → print) */
const changed = (items, synced) => Object.keys(items).filter((k) => print(items[k]) !== (synced || {})[k]);
export { merge, itemsOf, docOf, newer, norm, print, changed };
