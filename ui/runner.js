/* The run screen: plays a workout with the timer engine (core/engine.js), shows it, and keeps it in sync across devices. */
import { does } from './actions.js';
import {
  advance,
  boxStr,
  comboGap,
  drawCombo,
  guidedAt,
  runDevice,
  runLive,
  secondCues,
  unbox,
} from '../core/engine.js';
import { iconKey, mig, norm, uid } from '../core/routine.js';
import { build, callTxt, moves, rTot, spoken, stepLen } from '../core/steps.js';
import { fmt } from '../core/time.js';
import { cur, editOn, saveRoutine, vfAll } from './editor.js';
import { logWorkout, updHistBtn } from './history.js';
import { COLORS, esc, svgi, tint } from './html.js';
import {
  BGT,
  SAYB,
  SV,
  UTT,
  ac,
  beep,
  bell,
  bgOff,
  buzz,
  cSay,
  cdn,
  comboTones,
  fitRate,
  hush,
  muted,
  ph,
  say,
  sayDur,
  silentHere,
  waitTx,
} from './sound.js';
import { H, HDEL, R, S, store } from './storage.js';
import { CLOUD, CR, CR1, CU, SEEN, SWITCH, ask, banner } from './sync.js';
import { partsOn, renderList, show, upNext } from './views.js';
/* The timer runs on the wall clock: a workout is stored as start times (ms, on the sync server's clock), so it survives
   reloads, locked screens and closed apps, and every signed-in device shows the same moment. One device plays the
   sound (the one you last controlled it from); the others follow silently. */
let X = null; // run state
const PH = { prep: 'var(--step-prep)', work: null, rest: 'var(--step-rest)' };
const DEV = (() => {
  let d = null;
  try {
    d = JSON.parse(localStorage.getItem('rf2_dev') || 'null');
  } catch (e) {}
  if (!d || !d.id) {
    const u = navigator.userAgent;
    d = {
      id: uid() + uid(),
      off: 0,
      name: /iPhone/.test(u)
        ? 'iPhone'
        : /iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)
          ? 'iPad'
          : /Android/.test(u)
            ? /Mobile/.test(u)
              ? 'Android phone'
              : 'Android tablet'
            : /Mac/.test(u)
              ? 'Mac'
              : /Windows/.test(u)
                ? 'Windows PC'
                : /CrOS/.test(u)
                  ? 'Chromebook'
                  : /Linux/.test(u)
                    ? 'Linux PC'
                    : 'another device',
    };
    store(localStorage, 'rf2_dev', JSON.stringify(d));
  }
  return d;
})();
let OFF = +DEV.off || 0;
const NOW = () => Date.now() + OFF; // server-aligned clock
const mine = () => !!(X && X.steps && X.by === DEV.id);
function runDoc(end) {
  return {
    sid: X.sid,
    r: JSON.stringify(X.r),
    i: X.i,
    s0: X.s0,
    t0: X.t0,
    p: X.p,
    tap: X.tap,
    nc: X.nc,
    ct: X.ct || '',
    calls: X.calls || 0,
    box: boxStr(X.box),
    by: X.by,
    dn: X.dn || '',
    u: X.u,
    end: end || null,
    fin: X.fin || null,
  };
}
let LASTDOC = null,
  UNLOCKED = false,
  LOOP = false,
  LAST = null;
/* save the run on this device and, when signed in, publish it to the other devices */
function pushRun(end) {
  if (!X || !X.steps) return;
  X.u = Math.max(NOW(), (X.u || 0) + 1);
  const d = runDoc(end);
  LASTDOC = d;
  if (end || !mine()) localStorage.removeItem('rf2_run');
  else store(localStorage, 'rf2_run', JSON.stringify(d));
  if (CU && CLOUD && CR1 && !SWITCH) CLOUD.setRun(d, SEEN).catch(() => {});
}
function kick() {
  if (!LOOP) {
    LOOP = true;
    requestAnimationFrame(loop);
  }
}
function wake() {
  if (S.wake && navigator.wakeLock && document.visibilityState === 'visible')
    navigator.wakeLock
      .request('screen')
      .then((w) => {
        if (X && X.steps) X.wl = w;
        else w.release();
      })
      .catch(() => {});
}
/* minimize (⌄ or Back): the workout shrinks into its own card on the home screen, which then shows it live (step, time,
   round, progress, pause); tap the card to expand it again. One workout at a time. An archived one shows on top; the Order view shows only the order. */
let MINI = false,
  MORPH = null;
const liveIn = () => R.some((r) => r.id === X.r.id && !r.archived);
function liveCard() {
  const r = X.r,
    c = COLORS[r.color] || COLORS.blue,
    p = X.p != null;
  return `<div class="card rcard live" id="mcard" style="--c:${c}" ${does('click:maxRun')} role="button" aria-label="Open workout"><div class="dot" style="background:${tint(c, 13)};color:${c}">${svgi(iconKey(r), 22)}</div><div class="info"><b>${esc(r.name)}</b><div class="muted" id="mbTx"></div></div><span class="mexp" aria-hidden="true">${svgi('up', 18)}</span><button class="go primary" id="mbPP" style="background:${c};border-color:${c}" ${does('click:pauseOnly')} aria-label="${p ? 'Resume' : 'Pause'}">${svgi(p ? 'play' : 'pause', 22)}</button><i id="mbP"></i></div>`;
}
const shown = (el) => (el && el.offsetParent ? el.getBoundingClientRect() : null);
function minRun(back) {
  if (!X || !X.steps || MINI) return;
  MINI = true;
  if (!back) {
    const v = (document.querySelector('.view.on') || {}).id;
    if (v === 'edit' && cur) saveRoutine(false);
    else if (v !== 'lib') show('lib');
  } // Back: route() goes home
  miniUI();
  requestAnimationFrame(() => {
    const c = document.getElementById('mcard');
    if (shown(c)) c.scrollIntoView({ block: 'nearest' });
    morph(false, shown(c), () => {
      if (MINI) run.classList.remove('on');
    });
  });
}
function maxRun() {
  if (!X || !X.steps) return;
  if (MORPH) MORPH();
  const r = shown(document.getElementById('mcard'));
  MINI = false;
  run.classList.add('on');
  render();
  miniUI();
  morph(true, r);
}
function miniUI() {
  renderList();
  banner();
}
function miniTx() {
  const el = document.getElementById('mbTx');
  if (!el || !X || !X.steps) return;
  const s = X.steps[X.i],
    t = Math.max(0, ((X.p ?? NOW()) - X.s0) / 1000);
  const v =
    s.type === 'wait'
      ? 'tap to start'
      : s.type === 'time'
        ? fmt(s.dur - t)
        : `rep ${Math.min(s.reps, (s.mode === 'tap' ? Math.floor(X.tap / s.counts) : Math.floor(t / (s.counts * s.tempo + s.repPause))) + 1)} / ${s.reps}`;
  const h = `${s.seq && !s.label ? s.blk : s.label} · ${v} · Round ${s.round}/${X.r.rounds}${X.p != null ? ' · Paused' : ''}`;
  if (el.textContent !== h) el.textContent = h;
  const b = document.getElementById('mbP');
  if (b) b.style.width = rBar.style.width;
}
/* the run screen grows out of (open) or shrinks into the card at rect r: a clip that follows the card's shape, the content fading */
function morph(open, r, done) {
  if (MORPH) MORPH();
  let a = [];
  const end = () => {
    if (MORPH !== end) return;
    MORPH = null;
    if (done) done();
    a.forEach((x) => x.cancel());
  };
  MORPH = end;
  if (!r || !r.height || !run.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return end();
  const W = run.getBoundingClientRect(),
    m = (v) => Math.max(0, Math.round(v)) + 'px',
    box = `inset(${m(r.top - W.top)} ${m(W.right - r.right)} ${m(W.bottom - r.bottom)} ${m(r.left - W.left)} round 12px)`,
    full = 'inset(0px 0px 0px 0px round 0px)';
  const o = { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' };
  a = [
    run.animate(
      open
        ? [{ clipPath: box }, { clipPath: full }]
        : [
            { clipPath: full, opacity: 1 },
            { opacity: 1, offset: 0.65 },
            { clipPath: box, opacity: 0 },
          ],
      o,
    ),
    ...[...run.children].map((k) =>
      k.animate(
        open
          ? [{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }]
          : [{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }],
        o,
      ),
    ),
  ];
  a[0].onfinish = end;
}
function openRun() {
  MINI = false;
  miniUI();
  rName.innerHTML =
    svgi(iconKey(X.r), 16) +
    '<span>' +
    esc(X.r.name) +
    '</span>' +
    (X.r.test ? '<span class="muted" title="Not logged">· Test</span>' : '');
  run.classList.remove('fin');
  run.classList.add('on');
  wake();
  kick();
}
/* one workout at a time per account: ask before replacing the one this device shows, or one that runs on another
   device and is only on the home screen here (it would otherwise be replaced without a word, and not logged) */
function replaceOk(r) {
  let w = X && X.steps ? { name: X.r.name, id: X.r.id, by: X.by, dn: X.dn } : null;
  if (!w && CR && CR.sid && runLive(CR, NOW())) {
    let cr = {};
    try {
      cr = JSON.parse(CR.r) || {};
    } catch (e) {}
    w = { name: cr.name || 'Workout', id: cr.id, by: CR.by, dn: CR.dn };
  }
  if (!w) return true;
  const where = w.by && w.by !== DEV.id ? ` on ${runDevice(w, DEV)}` : '';
  if (w.id === r.id)
    return confirm(where ? `Stop “${w.name}”${where} and start it again here?` : `Restart “${w.name}”?`);
  return confirm(`Stop “${w.name}”${where} and start “${r.name}”?`);
}
function startRun(id, test) {
  // test = test run from the editor: plays normally, never logged
  const r = R.find((r) => r.id === id);
  if (!r) return;
  if (!replaceOk(r)) return; // one workout at a time
  ac();
  UNLOCKED = true;
  const steps = build(r);
  if (!steps.length) {
    alert('Add a block first.');
    return;
  }
  if (X && X.wl) X.wl.release().catch(() => {});
  const t = NOW();
  X = {
    sid: uid() + uid(),
    r: JSON.parse(JSON.stringify(r)),
    steps,
    i: 0,
    s0: t,
    t0: t,
    p: null,
    tap: 0,
    nc: 1.5,
    ct: '',
    calls: 0,
    box: {},
    by: DEV.id,
    dn: DEV.name,
    u: 0,
    lastCount: -1,
    lastSec: null,
  };
  if (test) {
    X.r.nolog = true;
    X.r.test = true;
  }
  openRun();
  ppIcon();
  liveUI();
  enter(0, t);
}
/* open a workout from its saved state: after a reload, or one that is running on another device */
function adopt(d) {
  let r;
  try {
    r = norm(mig(typeof d.r === 'string' ? JSON.parse(d.r) : d.r));
  } catch (e) {
    return false;
  }
  const steps = r && r.blocks ? build(r) : [];
  if (!steps.length) return false;
  if (X && X.wl) X.wl.release().catch(() => {});
  const t = NOW();
  X = {
    sid: d.sid,
    r,
    steps,
    i: Math.max(0, Math.min(steps.length - 1, d.i | 0)),
    s0: +d.s0 || t,
    t0: +d.t0 || t,
    p: d.p == null ? null : +d.p,
    tap: d.tap | 0,
    nc: +d.nc || 1.5,
    ct: d.ct || '',
    calls: d.calls | 0,
    box: unbox(d.box),
    by: d.by || DEV.id,
    dn: d.dn || '',
    u: +d.u || 0,
    lastCount: -1,
    lastSec: null,
  };
  openRun();
  stepUI();
  ppIcon();
  liveUI();
  render();
  return true;
}
function restoreRun() {
  let d = null;
  try {
    d = JSON.parse(localStorage.getItem('rf2_run') || 'null');
  } catch (e) {}
  if (!d || !d.sid || d.end || d.by !== DEV.id || NOW() - (+d.u || 0) > 12 * 3600e3) {
    localStorage.removeItem('rf2_run');
    return;
  }
  adopt(d);
}
function closeRun() {
  if (MORPH) MORPH();
  const m = MINI;
  if (X && X.wl) X.wl.release().catch(() => {});
  X = null;
  MINI = false;
  miniUI();
  bgOff();
  hush();
  run.classList.remove('on', 'fin');
  run.style.background = 'var(--bg)';
  localStorage.removeItem('rf2_run');
  if (editOn()) vfAll();
  return m;
} // m: was minimized (stay where you are) · editor: voice notes with what the voice learned
/* Stop. On the device that plays the sound it ends the workout everywhere. A following device asks first: end it on
   the other device too, or only close it here (issue 108). Without that choice nobody could end a workout whose device is
   gone, e.g. after Reset all gave it a new device code (issue 114) */
function stopRun() {
  if (X && X.steps && !mine() && !run.classList.contains('fin')) return askStop();
  endRun();
}
function askStop() {
  ask({
    title: 'Stop this workout?',
    text: `<p>It’s ${X.p != null ? 'paused' : 'playing'} on <b>${esc(runDevice(X, DEV))}</b>. Stop it there too, or only close it here?</p>`,
    buttons: [
      {
        label: 'Stop everywhere',
        cls: 'danger',
        run: () => {
          claim();
          endRun();
        },
      },
      { label: 'Just close here', run: endRun },
      { label: 'Cancel', cls: 'ghost' },
    ],
  });
}
function endRun() {
  const stay = run.classList.contains('fin') && LAST && LAST.min; // finished while minimized: Close returns to where you were
  if (X && X.steps && mine()) pushRun('stop');
  closeRun();
  if (!stay) show('lib');
  else if (document.getElementById('lib').classList.contains('on')) renderList();
  banner();
}
/* ends a workout this device isn't showing (× on the home-screen banner), as stopped by this device, so every device
   closes it. v is the run as the account stores it: the same fields as runDoc */
function stopShared(v) {
  if (!v || !v.sid || !(CU && CLOUD && CR1 && !SWITCH)) return;
  const d = { ...v, by: DEV.id, dn: DEV.name, u: Math.max(NOW(), (+v.u || 0) + 1), end: 'stop' };
  LASTDOC = d;
  CLOUD.setRun(d, SEEN).catch(() => {});
}
/* before signing out on the controller (issue 118): the account learns the workout stopped, so the other devices close it
   instead of finishing and logging it on the clock. It keeps running here: the local copy gets the same time and device
   as the stop, so the echo of this write is ignored (onRemoteRun only reacts when one of them differs). Resolves once
   the account has it, or after a moment offline, so signing out never waits long */
function leaveRun() {
  if (!X || !X.steps || !mine() || !(CU && CLOUD && CR1 && !SWITCH)) return Promise.resolve();
  X.u = Math.max(NOW(), (X.u || 0) + 1);
  LASTDOC = runDoc(); // what this device still runs
  store(localStorage, 'rf2_run', JSON.stringify(LASTDOC));
  return Promise.race([CLOUD.setRun(runDoc('stop'), SEEN).catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
}
function claim() {
  if (!X || !X.steps || mine()) return;
  X.by = DEV.id;
  X.dn = DEV.name;
  liveUI();
}
function ppIcon() {
  const p = !!(X && X.p != null);
  pp.innerHTML = svgi(p ? 'play' : 'pause', 30);
  pp.setAttribute('aria-label', p ? 'Resume' : 'Pause');
  const b = document.getElementById('mbPP');
  if (b) {
    b.innerHTML = svgi(p ? 'play' : 'pause', 22);
    b.setAttribute('aria-label', p ? 'Resume' : 'Pause');
  }
}
function togglePause() {
  if (!X || !X.steps) return;
  claim();
  const t = NOW();
  if (X.p != null) {
    const d = t - X.p;
    X.s0 += d;
    X.t0 += d;
    X.p = null;
  } else {
    X.p = t;
    hush();
  }
  ppIcon();
  pushRun();
}
function jump(d) {
  if (!X || !X.steps) return;
  claim();
  X.bq = null;
  const j = X.i + d;
  if (j < 0) return;
  const t = X.p ?? NOW();
  if (j >= X.steps.length) return finish(t);
  enter(j, t);
}
function color(s) {
  return s.kind === 'work' ? COLORS[X.r.color] : PH[s.kind];
}
function setStep(i, at) {
  X.i = i;
  X.s0 = at;
  X.lastCount = -1;
  X.lastSec = null;
  X.tap = 0;
  X.ct = '';
  X.nc = 1.5;
  X.sc = 0;
  X.vn = '';
} // sc: calls in this step · vn: voice note
function stepUI() {
  const i = X.i,
    s = X.steps[i],
    c = color(s);
  run.style.background = `radial-gradient(circle at 50% 45%, ${tint(c, 33)}, var(--bg) 75%), var(--bg)`;
  ring.style.stroke = c;
  phase.textContent = s.seq ? s.blk : s.label;
  phase.style.color = c;
  showCall(s.seq ? s.label : X.ct, false);
  rRound.textContent = `Round ${s.round}/${X.r.rounds}`;
  const n = X.steps[i + 1];
  next.textContent = n
    ? n.type === 'wait'
      ? n.seq
        ? `Next: ${n.label ? n.label + ' · ' : ''}tap to start`
        : `Next: ${n.label === 'Next round' ? `Round ${n.round} · ` : ''}${X.steps[i + 2] ? X.steps[i + 2].label + ' · ' : ''}tap to start`
      : `Next: ${n.label}${n.type === 'reps' ? ` · ${n.reps}×` : ` · ${fmt(n.dur)}`}`
    : 'Last one — finish strong';
  tapHint.textContent =
    s.type === 'wait'
      ? 'Tap the circle when ready · space works too'
      : s.type === 'reps' && s.mode === 'tap'
        ? 'Tap the circle for each ' + (s.counts > 1 ? 'count' : 'rep') + ' · space works too'
        : vnTxt(s);
  tapHint.classList.toggle('rsv', !!s.boxing && vOn()); // room for the voice line, so nothing moves when it shows up
  // text under the number: room is kept for the whole step (nothing jumps within a step), and only when the step has text,
  // so a bare number sits exactly in the middle of the ring
  stage.classList.toggle(
    'nosub',
    s.type === 'time' && s.kind === 'work' && !(s.boxing && s.order === 'sequence') && !s.seq,
  );
  stage.classList.toggle('cue', s.type === 'reps' && s.counts > 1 && s.display === 'both' && s.cues.length > 0);
  pips.innerHTML = s.type === 'reps' && s.reps <= 40 ? Array.from({ length: s.reps }, () => '<b></b>').join('') : '';
}
function enter(i, at, quiet) {
  setStep(i, at);
  stepUI();
  const s = X.steps[i],
    bg = at < BGT; // bg: its beep already played in the background
  if (!quiet) {
    // announcements
    if (s.seq) showCall(s.label); // flash: the same step twice in a row still shows a new one
    if (s.type === 'wait') {
      if (!bg) beep(784, 0.2);
      buzz([80, 60, 80]);
      say(waitTx(s));
    } else if (s.kind === 'work') {
      if (!bg) beep(1046, 0.25, 'square', 0.6);
      buzz([120]);
      say(
        s.type === 'reps'
          ? `${s.label}. ${s.reps} ${ph('reps')}`
          : s.boxing
            ? `${s.label}. ${ph('fight')}`
            : s.q
              ? ''
              : s.cue || s.label,
      );
    } else if (s.kind === 'rest') {
      if (!bg) bell();
      buzz([80, 60, 80]);
      say(`${ph(s.label)}. ${sayDur(s.dur)}`);
    } else say(`${X.r.name}. ${ph('Get ready')}`);
  }
  if (mine()) pushRun();
  render();
}
/* steps that ended while the app was in the background or closed: move on to where the workout is now. Back more than
   2 s late: no step announcements, only a beep and the name of the current step, so you know where you are */
function catchUp(now) {
  const a = advance(X.steps, X.i, X.s0, now, !mine());
  if (a.moved) setStep(a.i, a.s0);
  if (a.done) return finish(a.end, a.late);
  if (a.moved) {
    const q = a.late > 2000;
    enter(X.i, X.s0, q);
    if (q && UNLOCKED && mine()) back();
  }
}
function back() {
  const s = X.steps[X.i];
  beep(1046, 0.12, 'sine', 0.5);
  say(s.type === 'wait' ? waitTx(s) : s.kind === 'work' ? (s.q ? '' : s.label) : ph(s.label));
}
function finish(end, late = 0, remote) {
  end = Math.round(end ?? NOW());
  const r = X.r;
  if (mine() && !remote) {
    X.fin = end;
    pushRun('done');
  }
  const bgd = end < BGT;
  bgOff();
  hush();
  if (late < 2000) {
    if (!bgd) bell();
    buzz([200, 100, 200, 100, 400]);
    say(ph('done'));
  }
  if (X.wl) X.wl.release().catch(() => {});
  const tot = X.steps.filter((s) => s.type === 'reps').reduce((a, s) => a + s.reps, 0),
    calls = X.calls || 0;
  const entry = {
    id: X.sid,
    rid: r.id,
    name: r.name,
    icon: iconKey(r),
    color: r.color,
    ts: end,
    dur: Math.max(0, Math.round((end - X.t0) / 1000)),
    rounds: r.rounds,
    reps: tot,
    calls,
  };
  if (r.streak === false) entry.streak = false; // Log only: in history, not in the streak
  X = { done: true };
  run.style.background = 'var(--bg)';
  localStorage.removeItem('rf2_run');
  const ask = !r.nolog && late > 15 * 60e3 && !H.some((h) => h.id === entry.id) && !HDEL[entry.id]; // ended long before the app was opened again: ask instead of logging
  const mr = MINI && shown(document.getElementById('mcard')); // finished while minimized: the done screen grows out of the card
  LAST = { r, entry, ask, min: MINI, L: r.nolog || ask ? null : logWorkout(entry) };
  MINI = false;
  miniUI();
  updHistBtn();
  showDone();
  run.classList.add('on', 'fin');
  banner();
  if (mr) morph(true, mr);
}
function showDone() {
  if (!LAST) return;
  const { r, entry, ask, L } = LAST,
    e = entry.dur,
    nx = r.test || !partsOn() ? null : upNext(), // nx: what's left for today, one tap away
    again = R.some((x) => x.id === r.id); // the routine may have been deleted while it ran: then only Close (issue 120)
  const st = [
    [`${Math.floor(e / 60)}:${String(e % 60).padStart(2, '0')}`, 'Time'],
    [r.rounds, r.rounds === 1 ? 'Round' : 'Rounds'],
  ];
  if (entry.reps) st.push([entry.reps, 'Reps']);
  if (entry.calls) st.push([entry.calls, 'Combos']);
  doneView.innerHTML = `<div class="badge">${svgi('check', 48, 3)}</div><h2>Workout complete</h2><div class="dname">${svgi(iconKey(r), 16)}<span>${esc(r.name)}</span></div>${ask ? `<div class="streak text-muted">Ended while the app was closed · <button class="ghost" style="padding:var(--space-half) var(--space-1);color:var(--accent-text);font-weight:700" ${does('click:logLate')}>Log it</button></div>` : !L ? `<div class="streak text-muted">${svgi('nolog', 16)}${r.test ? 'Test run · not logged' : 'Not logged'}</div>` : (H.find((h) => h.id === entry.id) || entry).streak === false ? `<div class="streak text-muted">${svgi('nolog', 16)}Logged · not counted for streak</div>` : L.cur ? `<div class="streak">${svgi('flame', 16)}${L.cur}-day streak${L.newBest ? ' · new best!' : ''}</div>` : ''}
    <div class="stats" style="grid-template-columns:repeat(${st.length},1fr)">${st.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    ${nx ? `<button class="primary nextb" style="background:${COLORS[nx.color] || ''};border-color:${COLORS[nx.color] || ''}" ${does('click:startRun', nx.id)}>${svgi('play', 20)}<span>Next: ${esc(nx.name)} · ~${fmt(rTot(nx))}</span></button>` : ''}
    <div class="acts"><button ${does('click:stopRun')}>${svgi('x', 18)}Close</button>${again ? `<button class="${nx ? '' : 'primary'}" style="${nx ? '' : `background:${COLORS[r.color] || ''};border-color:${COLORS[r.color] || ''}`}" ${does('click:startRun', r.id, !!r.test)}>${svgi('play', 18)}Again</button>` : ''}</div>`;
}
function logLate() {
  if (!LAST || !LAST.ask) return;
  LAST.ask = false;
  LAST.L = logWorkout(LAST.entry);
  updHistBtn();
  showDone();
}
function loop() {
  if (!X || !X.steps) {
    LOOP = false;
    return;
  }
  if (X.p == null) catchUp(NOW());
  if (X && X.steps) {
    if (X.p == null) tick();
    if (X && X.steps) render();
  }
  requestAnimationFrame(loop);
}
/* sound plays on one device: the one the workout was started or last controlled from */
function liveUI() {
  const el = document.getElementById('live');
  if (!el) return;
  let h = '';
  if (X && X.steps) {
    if (!mine()) h = `${svgi('mute', 15)}<span>Sound on ${esc(runDevice(X, DEV))} · <b>Play here</b></span>`;
    else if (!UNLOCKED) h = `${svgi('vol', 15)}<span><b>Tap for sound</b></span>`;
  }
  el.innerHTML = h;
  el.hidden = !h;
  const b = document.querySelector('.ctrl .sm');
  if (b) {
    // Stop everywhere; on a following device it asks whether to stop the other device too (stopRun)
    b.title = 'Stop';
    b.setAttribute('aria-label', b.title);
  }
}
function liveTap() {
  if (!X || !X.steps) return;
  if (!mine()) {
    claim();
    pushRun();
  }
  UNLOCKED = true;
  ac();
  say(X.steps[X.i].label);
  liveUI();
}
// browsers only allow sound after a tap: the first one after a reload turns it back on
let PRIMED = false; // first tap: unlock speech on Android with a silent utterance
function initSoundUnlock() {
  ['click', 'touchend', 'keydown'].forEach((ev) =>
    document.addEventListener(
      ev,
      () => {
        if (PRIMED || !window.speechSynthesis) return;
        PRIMED = true;
        try {
          const u = new SpeechSynthesisUtterance(' ');
          u.volume = 0;
          speechSynthesis.speak(u);
        } catch (e) {}
      },
      true,
    ),
  );
  ['click', 'keydown'].forEach((ev) =>
    document.addEventListener(
      ev,
      () => {
        if (UNLOCKED) return;
        UNLOCKED = true;
        try {
          ac();
        } catch (e) {}
        if (mine()) say(X.steps[X.i].label);
        setTimeout(liveUI);
      },
      true,
    ),
  );
}
function nextCombo(s) {
  return drawCombo(s, X.box);
}
function showCall(c, flash = true) {
  call.textContent = c ? spoken(c) : '';
  if (!c) return;
  const L = c.length,
    w = Math.max(...c.split(/\s+/).map((x) => x.length), Math.ceil(L / 3));
  call.style.fontSize = L <= 10 ? '' : `min(56px, ${Math.round(480 / w)}px, ${(140 / w).toFixed(1)}vw)`;
  if (flash) {
    call.classList.remove('flash');
    void call.offsetWidth;
    call.classList.add('flash');
  }
}
/* a boxing call (s.vfit). Saying it can take longer than the time it gets (short count length, long combo):
   Voice (default): the next call waits until the previous one is said (max 4 s late), so the voice sets the pace.
   Voice, tones when too fast (pace): calls stay on time; each is said at your voice speed, faster (up to 1.5×) or, when even that
   doesn't fit, played as tones and shown. Never cut off, never behind. Either way the run screen says so (X.vn).
   Tones only: every call as tones, on time (in the background drawn ahead, see bgOn) */
function vOn() {
  return !!window.speechSynthesis && SV().voice && !muted && !silentHere();
}
function vBusy() {
  return speechSynthesis.speaking || performance.now() < SAYB;
}
function boxCall(s, t) {
  const v = vOn(),
    busy = v && vBusy(),
    byCall = busy && !!(UTT && UTT.call),
    m = s.vfit,
    late = t - X.nc;
  if (busy && (!m || !X.sc) && late < 4) {
    if (!m && byCall && late > 0.2) vnSet('wait');
    return;
  } // still saying the previous call (or the block's name, before its first call)
  const q = X.bq;
  while (q && q.length && q[0].i < X.i) q.shift();
  const e = m === 'tones' && q && q.length && q[0].i === X.i ? q.shift() : null; // Tones only: the call drawn ahead in the background
  const c = e ? e.c : nextCombo(s),
    tx = callTxt(c);
  X.ct = c;
  X.calls = (X.calls || 0) + 1;
  X.sc = (X.sc || 0) + 1;
  showCall(c);
  if (e && X.box[s.bid]) X.box[s.bid].num = e.u;
  X.nc = e ? e.n : t + callGap(s, c);
  let said = !m;
  if (!m) say(tx, false, false, { call: true });
  else if (m === 'pace' && v) {
    const k = busy ? 0 : fitRate(tx, X.nc - t);
    if (k) {
      const r = Math.max(k, boxRate(s));
      say(tx, false, false, { call: true, rate: r });
      said = true;
      if (r > SV().rate * 1.1) vnSet('fast');
    } else if (!busy || byCall) vnSet('beep');
  } // busy with something else (Ten seconds): just this call as tones
  if (said) beep(1500, 0.05, 'square', 0.4);
  else comboTones(c, s.cl || 1, s.tm);
  pushRun();
}
const callGap = (s, c) => comboGap(s, c, X.box);
function boxRate(s) {
  const k = String(SV().rate);
  if (s.vrk !== k) {
    s.vrk = k;
    s.vr = Math.max(SV().rate, ...s.combos.map((c) => fitRate(callTxt(c), moves(c) * (s.cl || 1) + (+s.minGap || 0))));
  }
  return s.vr;
} // one steady (faster) voice speed per block
const VN = {
  wait: 'Paced by voice: calls wait until it finishes',
  fast: 'Keeping the pace: voice sped up',
  beep: 'Too fast to speak: tones + call on screen',
};
function vnTxt(s) {
  if (!s || !mine() || !SV().voice) return '';
  if (s.boxing) return VN[X.vn] || '';
  if (s.type === 'reps' && s.mode === 'guided') {
    const p = cSay(s);
    if (p !== SV().speakCounts)
      return p === 'reps' ? 'Counts too fast to speak: rep numbers only' : 'Too fast to speak: beeps only';
  }
  return '';
}
function vnSet(k) {
  if (X.vn === k || X.vn === 'beep') return;
  X.vn = k;
  tapHint.textContent = vnTxt(X.steps[X.i]);
}
function tick() {
  const s = X.steps[X.i],
    t = (X.t = (NOW() - X.s0) / 1000);
  if (t >= stepLen(s)) return;
  if (s.type === 'time') {
    const left = s.dur - t;
    const sec = Math.ceil(left);
    if (sec !== X.lastSec) {
      X.lastSec = sec;
      const q = secondCues(s, sec, cdn(s));
      if (q.beep) {
        beep(q.beep, 0.12);
        if (q.count) say(String(sec), true, true);
      }
      if (q.halfway) say(ph('halfway'), false);
      if (q.ten) {
        say(ph('ten'), false);
      }
    }
    if (s.boxing && mine() && t >= X.nc && left > 1.5) boxCall(s, t);
  } else if (s.mode === 'guided') {
    const { rep, c } = guidedAt(s, t);
    const key = rep * 1000 + c;
    if (key !== X.lastCount && c >= 0) {
      X.lastCount = key;
      countFx(rep, c, s);
    }
  }
}
function countFx(rep, c, s) {
  // rep 0-based, c 0-based
  const first = c === 0;
  beep(first ? 1175 : 740, first ? 0.12 : 0.06, first ? 'square' : 'sine', first ? 0.7 : 0.5);
  if (first) buzz(40);
  const lbl = s.cues[c],
    sp = s.mode === 'guided' ? cSay(s) : SV().speakCounts;
  if (sp === 'every') say(lbl || (s.counts > 1 ? String(c + 1) : String(rep + 1)), true, true);
  else if (sp === 'reps' && first) say(String(rep + 1), true, true);
  big.classList.remove('flash');
  void big.offsetWidth;
  big.classList.add('flash');
}
function tap() {
  if (!X || !X.steps || X.p != null) return;
  const s = X.steps[X.i];
  if (s.type === 'wait') {
    ac();
    jump(1);
    return;
  }
  if (s.type !== 'reps' || s.mode !== 'tap') return;
  const total = s.reps * s.counts;
  if (X.tap >= total) return;
  ac();
  claim();
  const c = X.tap % s.counts,
    rep = Math.floor(X.tap / s.counts);
  countFx(rep, c, s);
  X.tap++;
  if (X.tap >= total) {
    const sid = X.sid,
      i = X.i;
    setTimeout(() => {
      if (X && X.sid === sid && X.i === i && mine()) jump(1);
    }, 350);
  }
  pushRun();
  render();
}
let FB = '';
function fitBig() {
  const t = String(big.textContent),
    L = t.length,
    W = big.parentElement.clientWidth,
    key = t + '|' + W;
  if (key === FB) return;
  FB = key;
  const one = !/\s/.test(t);
  big.style.whiteSpace = one ? 'nowrap' : '';
  big.style.overflowWrap = one ? 'normal' : '';
  if (L <= 4 || one) {
    big.style.fontSize = '';
  } else {
    const w = Math.max(...t.split(/\s+/).map((x) => x.length), Math.ceil(L / 2));
    big.style.fontSize = `min(${Math.round(380 / w)}px, ${(40 / w).toFixed(1)}vh, ${Math.round(118 / w)}vw)`;
  }
  const sw = big.scrollWidth;
  if (W && sw > W) {
    const fs = parseFloat(getComputedStyle(big).fontSize);
    big.style.fontSize = Math.floor(((fs * W) / sw) * 0.96) + 'px';
  }
}
function fitCue() {
  const L = cueLine.textContent.length;
  cueLine.style.fontSize = L <= 10 ? '' : `min(${Math.round(420 / L) + 10}px, ${((4.6 * 10) / L + 1.2).toFixed(1)}vh)`;
}
function render() {
  if (!X || !X.steps) return;
  const s = X.steps[X.i];
  let t = (X.t = Math.max(0, ((X.p ?? NOW()) - X.s0) / 1000)),
    frac = 0;
  if (s.type === 'wait') {
    if (!big.querySelector('svg')) big.innerHTML = svgi('play', 96);
    cueLine.textContent = '';
    sub.textContent = 'tap to start';
    fitBig();
  } else if (s.type === 'time') {
    const left = Math.max(0, s.dur - t);
    big.textContent = fmt(left);
    cueLine.textContent = '';
    fitBig();
    frac = t / s.dur;
    sub.textContent = s.boxing
      ? s.order === 'sequence' && X.box[s.bid]
        ? `combo ${X.box[s.bid].num} / ${s.combos.length}`
        : ''
      : s.seq
        ? `step ${s.si + 1} / ${s.sn}`
        : s.kind === 'work'
          ? ''
          : 'breathe';
  } else {
    let rep,
      c,
      breather = false;
    if (s.mode === 'guided') {
      const per = s.counts * s.tempo + s.repPause;
      t = Math.min(t, s.reps * per - 1e-6);
      rep = Math.floor(t / per);
      const inRep = t - rep * per;
      c = Math.floor(inRep / s.tempo);
      if (inRep >= s.counts * s.tempo) {
        breather = true;
        c = s.counts - 1;
      }
      frac = t / s.dur;
    } else {
      rep = Math.floor(X.tap / s.counts);
      c = X.tap % s.counts;
      frac = X.tap / (s.reps * s.counts);
      if (X.tap >= s.reps * s.counts) {
        rep = s.reps - 1;
        c = s.counts;
      }
    }
    rep = Math.min(rep, s.reps - 1);
    let bigTxt,
      cueTxt = '',
      subTxt;
    if (s.counts > 1) {
      const cue = s.cues[Math.min(c, s.counts - 1)] || '';
      const n = s.mode === 'tap' ? c : c + 1;
      const d = cue ? s.display : 'number';
      if (breather) {
        bigTxt = '·';
        subTxt = `breathe · next rep ${rep + 2}`;
      } else {
        subTxt = `rep ${rep + 1} / ${s.reps}`;
        if (d === 'cue') {
          bigTxt = cue;
          subTxt = `count ${n} · ` + subTxt;
        } else if (d === 'number') {
          bigTxt = n;
          if (cue) subTxt += ' · ' + cue;
        } else {
          bigTxt = n;
          cueTxt = cue;
        }
      }
    } else {
      bigTxt = s.mode === 'tap' ? X.tap : rep + 1;
      subTxt = `of ${s.reps}`;
    }
    big.textContent = bigTxt;
    cueLine.textContent = cueTxt;
    sub.textContent = subTxt;
    fitBig();
    fitCue();
    [...pips.children].forEach((p, k) => {
      p.className =
        k < rep || (k === rep && s.mode === 'tap' && X.tap >= s.reps * s.counts) ? 'done' : k === rep ? 'now' : '';
    });
  }
  ring.style.strokeDashoffset = s.type === 'wait' ? 0 : 289.03 * (1 - Math.min(1, frac));
  // overall progress
  const tot = X.steps.length;
  rBar.style.width = ((X.i + Math.min(1, frac)) / tot) * 100 + '%';
  if (MINI) miniTx();
}
// for the modules that replace these
function setOFF(v) {
  OFF = v;
}
function setLAST(v) {
  LAST = v;
}
export {
  X,
  DEV,
  NOW,
  mine,
  LASTDOC,
  LAST,
  pushRun,
  MINI,
  liveIn,
  liveCard,
  minRun,
  maxRun,
  miniTx,
  startRun,
  adopt,
  restoreRun,
  closeRun,
  stopRun,
  stopShared,
  leaveRun,
  ppIcon,
  togglePause,
  jump,
  setStep,
  stepUI,
  catchUp,
  finish,
  showDone,
  logLate,
  liveUI,
  liveTap,
  nextCombo,
  showCall,
  callGap,
  boxRate,
  tap,
  render,
  initSoundUnlock,
  setOFF,
  setLAST,
};
