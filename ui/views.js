/* Home screen, routing between views, parts of the day (Settings) and drag to reorder. */
import { does } from './actions.js';
import { iconKey } from '../core/routine.js';
import {
  DN,
  PARTS,
  WHEN,
  daysTxt,
  nextUp,
  onDay,
  partAt,
  partOf,
  partTimes,
  partsOnIn,
  rDays,
  setDay,
} from '../core/schedule.js';
import { build } from '../core/steps.js';
import { dk, fmt, hhmm } from '../core/time.js';
import { autoT, autosave, cur, fillEditor, openEditor, readHead, saveRoutine, setCur, vfAll } from './editor.js';
import { openHist, updHistBtn } from './history.js';
import { openWeek, renderWeek } from './week.js';
import { COLORS, esc, nsTag, svgi, tint } from './html.js';
import { MINI, X, liveCard, liveIn, minRun, miniTx, stopRun } from './runner.js';
import { openSettings } from './settings.js';
import { buzz } from './sound.js';
import { H, META, R, persist, saveRaw, setR, store } from './storage.js';
import { banner, scheduleSync } from './sync.js';
let ROUTING = false;
function routeOf(v) {
  return v === 'hist'
    ? '#/history'
    : v === 'week'
      ? '#/week'
      : v === 'set'
        ? '#/settings'
        : v === 'edit' && cur
          ? cur._new
            ? '#/new'
            : '#/edit/' + cur.id
          : '#/';
}
function show(v) {
  if (v === 'lib' && document.getElementById('list')) renderList();
  document.querySelectorAll('.view').forEach((e) => e.classList.toggle('on', e.id === v));
  scrollTo(0, 0);
  if (v !== 'edit') sessionStorage.removeItem('rf2_draft');
  else vfAll(); // back in the editor: voice notes with the latest settings and what the voice learned
  if (ROUTING) return;
  const h = routeOf(v),
    st = history.state && history.state.rf;
  if (v === 'lib') {
    if (st) {
      ROUTING = true;
      history.back();
    } else if (location.hash && location.hash !== '#/') history.replaceState(null, '', '#/');
  } else if (location.hash !== h) {
    st ? history.replaceState({ rf: 1 }, '', h) : history.pushState({ rf: 1 }, '', h);
  }
}
function saveDraft() {
  if (cur && document.getElementById('edit').classList.contains('on')) {
    if (autoT) autosave();
    try {
      readHead();
      store(sessionStorage, 'rf2_draft', JSON.stringify(cur));
    } catch (e) {}
  }
}
function route() {
  const h = location.hash || '#/',
    view = (document.querySelector('.view.on') || {}).id;
  let d = null;
  try {
    d = JSON.parse(sessionStorage.getItem('rf2_draft') || 'null');
  } catch (e) {}
  ROUTING = true;
  try {
    let m;
    if (h === '#/history') openHist();
    else if (h === '#/week') openWeek();
    else if (h === '#/settings') openSettings();
    else if ((m = h.match(/^#\/edit\/(.+)$/)) && R.find((r) => r.id === m[1])) {
      if (view !== 'edit' || !cur || cur.id !== m[1]) {
        if (d && d.id === m[1]) {
          setCur(d);
          fillEditor();
          show('edit');
        } else openEditor(m[1]);
      }
    } else if (h === '#/new' && d && d._new) {
      setCur(d);
      fillEditor();
      show('edit');
    } else {
      if (view === 'edit' && cur) saveRoutine(false);
      else show('lib');
      if (location.hash && location.hash !== '#/') history.replaceState(null, '', '#/');
    }
  } finally {
    ROUTING = false;
  }
}
function initHistoryNav() {
  addEventListener('popstate', () => {
    if (ROUTING) {
      ROUTING = false;
      return;
    }
    if (run.classList.contains('on')) {
      if (X && X.steps) minRun(true);
      else {
        ROUTING = true;
        stopRun();
        ROUTING = false;
      }
    }
    route();
  }); // Back minimizes a running workout
}
const partsOn = () => partsOnIn(META.parts);
function partT() {
  return partTimes(META.parts);
}
const clk = (n) =>
  new Date(2000, 0, 1, Math.floor(n / 60), n % 60).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // shown: the device's clock format, like the time fields
function partTxt(w) {
  const t = partT();
  return w === 'am'
    ? 'until ' + clk(t.mid)
    : w === 'mid'
      ? clk(t.mid) + '–' + clk(t.eve)
      : w === 'pm'
        ? 'from ' + clk(t.eve)
        : '';
}
function partNow(d = new Date()) {
  return partAt(META.parts, d);
}
function renderParts() {
  const el = document.getElementById('partForm');
  if (!el) return;
  const t = partT(),
    on = partsOn(),
    d = on ? '' : ' disabled';
  el.innerHTML = `<div class="tg"><label class="chk"><input type="checkbox" ${on ? 'checked' : ''} ${does('change:setGuideChk')}> Guide me through the day</label></div>
  <div${on ? '' : ' class="dim"'}><label for="pMid">Midday starts</label><input id="pMid" type="time" value="${hhmm(t.mid)}" ${does('change:setPart')}${d}></div><div${on ? '' : ' class="dim"'}><label for="pEve">Evening starts</label><input id="pEve" type="time" value="${hhmm(t.eve)}" ${does('change:setPart')}${d}></div>`;
  partSum();
}
function setGuide(on) {
  META.parts = { ...partT(), ts: Date.now(), ...(on ? {} : { off: true }) };
  saveRaw();
  scheduleSync();
  renderParts();
}
function partSum(bad) {
  const el = document.getElementById('partSum');
  if (!el) return;
  el.style.color = bad ? 'var(--danger-text)' : '';
  el.textContent =
    bad ||
    (partsOn()
      ? `Morning ${partTxt('am')} · Midday ${partTxt('mid')} · Evening ${partTxt('pm')}`
      : 'Off: Today is one list in your own order, without Up next or Next.');
}
function setPart() {
  const v = (id) => {
      const m = /^(\d\d):(\d\d)/.exec(document.getElementById(id).value || '');
      return m ? +m[1] * 60 + +m[2] : NaN;
    },
    m = v('pMid'),
    e = v('pEve');
  if (!(m > 0)) return partSum('Midday has to start after midnight.');
  if (!(e > m)) return partSum('Evening has to start after midday.');
  const t = partT();
  if (t.mid === m && t.eve === e) return partSum();
  META.parts = { mid: m, eve: e, ts: Date.now(), ...(partsOn() ? {} : { off: true }) };
  saveRaw();
  scheduleSync();
  partSum();
}
function upNext() {
  return nextUp(R, H, META.parts);
}
let SORT = false; // order view, opened with the Order button: all routines in their real order, drag to reorder, until Done
function setSort(v) {
  SORT = v;
  renderList();
  if (v) document.getElementById('list').scrollIntoView({ block: 'nearest' });
}
function renderList() {
  updHistBtn();
  const flat = SORT; // order view: all routines in one list, in their real order
  const act = R.filter((r) => !r.archived),
    arc = R.filter((r) => r.archived),
    now = new Date(),
    wd = now.getDay(),
    tk = dk(now.getTime());
  // r.skip = date keys of the days it was skipped ("Skip today"): not highlighted for the rest of that day, still planned for that weekday
  // r.add = date keys of the days it was added to ("Add to today", this time only): in Today for the rest of that day
  const skip = (r) => onDay(r, 'skip', tk),
    added = (r) => onDay(r, 'add', tk) && !rDays(r).includes(wd),
    tod = act.filter((r) => (rDays(r).includes(wd) && !skip(r)) || added(r)),
    oth = act.filter((r) => !tod.includes(r));
  const done = (r) => H.some((h) => h.rid === r.id && dk(h.ts) === tk),
    LV = !flat && MINI && X && X.steps && liveIn() ? X.r.id : null; // LV: the minimized workout, shown live in its own card
  const handle = `<span class="handle" title="Drag to reorder"><svg width="14" height="22" viewBox="0 0 14 22" fill="currentColor"><circle cx="4" cy="5" r="1.8"/><circle cx="10" cy="5" r="1.8"/><circle cx="4" cy="11" r="1.8"/><circle cx="10" cy="11" r="1.8"/><circle cx="4" cy="17" r="1.8"/><circle cx="10" cy="17" r="1.8"/></svg></span>`;
  const hd = () => (flat && act.length > 1 ? handle : ''); // drag handles only in the order view
  const dot = (r, sz) =>
    `<div class="dot" style="background:${tint(COLORS[r.color], 13)};color:${COLORS[r.color]}">${svgi(iconKey(r), sz)}</div>`;
  const go = (r, sz) =>
    `<button class="go primary" style="background:${COLORS[r.color]};border-color:${COLORS[r.color]}" ${does('click:startRun', r.id)} aria-label="Start">${svgi('play', sz)}</button>`;
  const tot = (r) => build(r).reduce((a, s) => a + (s.dur || 0), 0);
  // today: full card, highlighted until a workout for it is logged today; subtle × skips it for today only
  const full = (r) => {
    if (r.id === LV) return liveCard();
    const st = build(r),
      t = tot(r),
      ok = done(r),
      nx = NX && NX.id === r.id;
    return `<div class="card rcard ${ok ? 'done' : NX && !nx ? 'today soft' : 'today'}" style="--c:${COLORS[r.color]}" data-id="${r.id}">${hd()}${dot(r, 22)}
   <div class="info tap" ${does('click:openEditor', r.id)}><b>${esc(r.name)}</b>${nx ? '<span class="nxt">Up next</span>' : ''}${ok ? `<span class="ok" title="Done today">${svgi('check', 16, 3)}</span>` : ''}<div class="muted">${r.rounds} round${r.rounds > 1 ? 's' : ''} · ${r.blocks.length} block${r.blocks.length !== 1 ? 's' : ''} · ~${fmt(t)} ${st.some((s) => s.mode === 'tap' || s.type === 'wait') ? '+ tap' : ''}${(r.sec || 1) !== 1 ? ` · count ${r.sec} s` : ''}${r.nolog ? ' · ' + nsTag('not logged', 'Not logged') : r.streak === false ? ' · ' + nsTag('log only', 'Logged, not counted for streak') : ''}${added(r) ? ' · added for today' : ''}</div></div>
   ${ok ? '' : added(r) ? `<button class="ghost skip" ${does('click:addToday', r.id, false)} title="Remove from today" aria-label="Remove from today">${svgi('x', 16)}</button>` : `<button class="ghost skip" ${does('click:skipToday', r.id, true)} title="Skip today" aria-label="Skip today">${svgi('x', 16)}</button>`}${go(r, 22)}</div>`;
  };
  // other routines: one compact row; a skipped one says so and can be brought back, the others can be added to today (+)
  const mini = (r) => {
    if (r.id === LV) return liveCard();
    const dt = daysTxt(r),
      sk = skip(r);
    return `<div class="card rcard mini${sk ? ' skipped' : ''}${flat && tod.includes(r) ? ' tod' : ''}" style="--c:${COLORS[r.color]}" data-id="${r.id}">${hd()}${dot(r, 18)}
   <div class="info tap" ${does('click:openEditor', r.id)}><b>${esc(r.name)}</b><span class="muted">~${fmt(tot(r))}${dt ? ' · ' + dt : ''}</span></div>
   ${sk ? `<button class="ghost undo" ${does('click:skipToday', r.id, false)} title="Skipped today · tap to highlight it again">Undo skip</button>` : flat ? '' : `<button class="ghost skip" ${does('click:addToday', r.id, true)} title="Add to today (this time only)" aria-label="Add to today">${svgi('plus', 16)}</button>`}${go(r, 18)}</div>`;
  };
  const grp = (a, f) => `<div class="grp">${a.map(f).join('')}</div>`;
  const NX = flat || !partsOn() ? null : upNext(); // the suggestion (same one the done screen offers as Next): an Up next label, the others a quieter outline; a guide, any order is fine
  const parts = (a) =>
    !partsOn() || !a.some(partOf)
      ? grp(a, full)
      : [...PARTS, '']
          .map((w) => {
            const l = a.filter((r) => partOf(r) === w);
            return l.length
              ? `<div class="sech part${w && w === partNow() ? ' now' : ''}">${w ? WHEN[w] : 'Anytime'}${w ? `<span class="pt"> · ${partTxt(w)}</span>` : ''}${w && w === partNow() ? '<span class="pn"> · now</span>' : ''}</div>` +
                  grp(l, full)
              : '';
          })
          .join(''); // Today grouped by part of the day, once any of them has one; the current part is marked "now": a guide, any order is fine
  if (flat && act.length) {
    document.getElementById('list').innerHTML =
      `<div class="sech shead"><span class="sht">All routines · in order</span><button class="ghost sbtn on" ${does('click:setSort', false)}>${svgi('check', 14, 2.5)}Done</button></div>${grp(act, mini)}`;
  }
  /* home: Today on top (or a quiet note when nothing is left for today), then the other routines; without any days
     planned it is one list. New routine sits at the end; Reorder (under the list) opens the order view, the only place to reorder. */
  else {
    const planned = act.some((r) => rDays(r).length) || tod.length > 0,
      add = `<button class="addrow" ${does('click:newRoutine')}>${svgi('plus', 20, 2.5)}New routine</button>`;
    const head = (t) => `<div class="sech">${t}</div>`;
    const none = `<div class="card noday">${svgi('moon', 18)}<span>${act.some((r) => rDays(r).includes(wd)) ? 'Nothing left for today' : 'Nothing planned for today'}<span class="muted"> · + on a routine adds it to today</span></span></div>`;
    document.getElementById('list').innerHTML = !act.length
      ? `<p class="muted">${arc.length ? 'All routines are archived.' : 'No routines yet.'}</p>${add}`
      : !planned
        ? head('Routines') + grp(oth, mini) + add
        : head(`Today · ${DN[wd]}`) +
          (tod.length ? parts(tod) : none) +
          (oth.length ? `<div class="sech">Other routines</div>${grp(oth, mini)}` : '') +
          add;
  }
  const ro =
      !flat && act.length > 1
        ? `<button class="ghost" ${does('click:setSort', true)} title="See all routines in their real order and reorder them">${svgi('sort', 16)}Reorder</button>`
        : '',
    ab = arc.length
      ? `<button class="ghost" ${does('click:toggleArch')} aria-expanded="${archOpen}">Archived (${arc.length})<span style="display:inline-flex;transition:transform .15s;transform:rotate(${archOpen ? 90 : 0}deg)">${svgi('right', 16)}</span></button>`
      : '';
  document.getElementById('arch').innerHTML =
    (ro || ab ? `<div class="lfoot">${ro || '<span></span>'}${ab}</div>` : '') +
    (archOpen
      ? arc
          .map(
            (
              r,
            ) => `<div class="card rcard arch"><div class="dot" style="background:${tint(COLORS[r.color], 13)};color:${COLORS[r.color]}">${svgi(iconKey(r), 22)}</div>
   <div class="info tap" ${does('click:openEditor', r.id)}><b>${esc(r.name)}</b><div class="muted">${r.rounds} round${r.rounds > 1 ? 's' : ''} · ${r.blocks.length} block${r.blocks.length !== 1 ? 's' : ''}</div></div>
   <button ${does('click:setArchived', r.id, false)}>Unarchive</button></div>`,
          )
          .join('')
      : '');
  if (LV) miniTx();
  if (MINI) banner();
  if (document.getElementById('week').classList.contains('on')) renderWeek();
} // archived: the live card goes on top
let archOpen = false;
function toggleArch() {
  archOpen = !archOpen;
  renderList();
}
function skipToday(id, on) {
  const r = R.find((r) => r.id === id);
  if (!r) return;
  setDay(r, 'skip', on);
  persist();
  renderList();
}
function addToday(id, on) {
  const r = R.find((r) => r.id === id);
  if (!r) return;
  setDay(r, 'add', on);
  persist();
  renderList();
  const c = document.querySelector(`#list .rcard[data-id="${id}"]`);
  if (c) {
    c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    c.classList.add('flash');
    setTimeout(() => c.classList.remove('flash'), 1300);
  }
} // shows where it went
function setArchived(id, v) {
  const r = R.find((r) => r.id === id);
  if (!r) return;
  if (v) r.archived = true;
  else delete r.archived;
  persist();
  renderList();
}

/* drag to reorder, only in the order view (Order button): every routine in its real order, so the row stays where it is
   when picked up and follows the finger; a dashed slot shows where it will land. On drop the row settles into the slot
   and flashes; the order view stays open until Done. */
let dragBusy = false;
function initDrag() {
  document.getElementById('list').addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.handle');
    if (!h || dragBusy || !SORT) return;
    e.preventDefault();
    const list = e.currentTarget,
      id = h.closest('.rcard').dataset.id,
      pid = e.pointerId,
      sy0 = e.clientY,
      y0 = scrollY;
    let st = null,
      cy = e.clientY,
      raf = 0;
    try {
      list.setPointerCapture(pid);
    } catch (_) {}
    const start = () => {
      list.classList.add('sorting');
      buzz(15);
      const cards = [...list.querySelectorAll('.rcard')],
        card = cards.find((c) => c.dataset.id === id),
        from = cards.indexOf(card);
      const box = cards.map((c) => {
        const b = c.getBoundingClientRect();
        return { top: b.top + scrollY, h: b.height };
      });
      const sz = box[1] ? box[1].top - box[0].top : box[0].h,
        lt = list.getBoundingClientRect().top + scrollY;
      const slot = document.createElement('div');
      slot.className = 'dslot';
      slot.style.cssText = `top:${box[from].top - lt}px;height:${box[from].h}px`;
      list.prepend(slot);
      card.classList.add('drag', 'lift');
      setTimeout(() => card.classList.remove('lift'), 160);
      st = {
        cards,
        card,
        from,
        to: from,
        box,
        sz,
        slot,
        lt,
        head: list.querySelector('.sech .sht') || list.querySelector('.sech'),
        off: sy0 + y0 - (box[from].top + box[from].h / 2),
      };
    }; // keeps the spot where it was grabbed under the finger
    const place = () => {
      const { cards, card, from, box, sz } = st,
        n = cards.length,
        c = cy + scrollY - st.off; // centre of the dragged row, page coordinates
      card.style.transform = `translateY(${c - (box[from].top + box[from].h / 2)}px)`;
      // finger above or below the list = cancel: nothing moves, release keeps the order
      const fy = cy + scrollY,
        out = fy < box[0].top - 24 || fy > box[n - 1].top + box[n - 1].h + 24;
      let to = from;
      if (!out) {
        for (let k = from + 1; k < n; k++) if (c > box[k].top + box[k].h / 2) to = k;
        for (let k = from - 1; k >= 0; k--) if (c < box[k].top + box[k].h / 2) to = k;
      }
      st.to = to;
      card.classList.toggle('cancel', out);
      st.slot.classList.toggle('same', to === from);
      st.head.textContent = to === from ? 'Order unchanged' : 'Drop where it belongs';
      st.slot.style.top = box[to].top - st.lt + 'px';
      cards.forEach((x, k) => {
        if (x === card) return;
        const sh = from < to && k > from && k <= to ? -sz : from > to && k >= to && k < from ? sz : 0;
        x.style.transform = sh ? `translateY(${sh}px)` : '';
      });
    };
    const edge = () => {
      raf = 0;
      if (!st) return;
      const v =
        cy < 70 ? -Math.ceil((70 - cy) / 6) : cy > innerHeight - 70 ? Math.ceil((cy - innerHeight + 70) / 6) : 0;
      if (v) {
        const y = scrollY;
        scrollBy(0, v);
        if (scrollY !== y) place();
        raf = requestAnimationFrame(edge);
      }
    };
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      cy = ev.clientY;
      if (!st) {
        if (Math.abs(cy - sy0) < 6) return;
        start();
      }
      place();
      if (!raf) raf = requestAnimationFrame(edge);
    };
    const up = (ev) => {
      if (ev.pointerId !== pid) return;
      list.removeEventListener('pointermove', move);
      list.removeEventListener('pointerup', up);
      list.removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf);
      raf = 0;
      if (!st) {
        list.classList.remove('sorting');
        return;
      }
      const { cards, card, from, to, box } = st;
      st = null;
      if (to !== from) {
        const ids = cards.map((c) => c.dataset.id);
        const [m] = ids.splice(from, 1);
        ids.splice(to, 0, m);
        const by = {};
        R.forEach((r) => (by[r.id] = r));
        const slots = R.map((r, i) => (ids.includes(r.id) ? i : -1)).filter((i) => i >= 0);
        const nr = R.slice();
        slots.forEach((sl, k) => (nr[sl] = by[ids[k]]));
        setR(nr);
        persist();
      }
      // settle into the slot so it is clear where it went; unchanged: it just slides back, no highlight
      dragBusy = true;
      card.classList.remove('cancel');
      card.classList.add('lift');
      if (to !== from) {
        card.classList.add('landed');
        buzz(10);
      }
      card.style.transform = `translateY(${box[to].top - box[from].top}px)`;
      setTimeout(() => {
        dragBusy = false;
        list.classList.remove('sorting');
        renderList();
        const c = to !== from && list.querySelector(`.rcard[data-id="${id}"]`);
        if (c) {
          c.classList.add('flash');
          c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          setTimeout(() => c.classList.remove('flash'), 1300);
        }
      }, 550);
    };
    list.addEventListener('pointermove', move);
    list.addEventListener('pointerup', up);
    list.addEventListener('pointercancel', up);
  });
}
export {
  ROUTING,
  show,
  saveDraft,
  route,
  partsOn,
  partTxt,
  partNow,
  renderParts,
  setGuide,
  setPart,
  upNext,
  SORT,
  setSort,
  renderList,
  toggleArch,
  skipToday,
  addToday,
  setArchived,
  initHistoryNav,
  initDrag,
};
