/* Starts the app: wires the page to the modules, in the order the app always started. */
import { sndCopy } from '../core/routine.js';
import {
  addBlock,
  closeEditor,
  cur,
  deleteRoutine,
  dup,
  durIn,
  durOut,
  durStep,
  editOn,
  mv,
  newRoutine,
  openEditor,
  pickColor,
  pickIcon,
  playCombo,
  pvUpd,
  queueAutosave,
  readHead,
  renderSnd,
  rm,
  saveRoutine,
  setB,
  setRun,
  setWhen,
  summary,
  toggleArchiveCur,
  toggleDay,
  vMeasure,
  vfAll,
} from './editor.js';
import { delHist, exportAll, importAll, openHist, openWeek, wkMode } from './history.js';
import { infoToggle, svgi } from './html.js';
import {
  NOW,
  X,
  catchUp,
  initSoundUnlock,
  jump,
  liveTap,
  logLate,
  maxRun,
  minRun,
  restoreRun,
  startRun,
  stopRun,
  tap,
  togglePause,
} from './runner.js';
import { addPresets, openSettings, resetAll, setOpt } from './settings.js';
import {
  BG,
  bgOff,
  bgOn,
  bqBack,
  bqPlayed,
  resetAudio,
  sndOf,
  sndSet,
  sndVal,
  testAudio,
  testVoice,
  toggleMute,
  vdHide,
  vdShow,
} from './sound.js';
import { S } from './storage.js';
import {
  CR,
  askSwitch,
  banner,
  cloud,
  cloudP,
  deleteAcct,
  keepNewAcct,
  linkProv,
  openLive,
  removeProv,
  scheduleSync,
  setSync,
  signIn,
  signOutNow,
  syncNow,
} from './sync.js';
import {
  addToday,
  initDrag,
  initHistoryNav,
  partNow,
  renderList,
  route,
  saveDraft,
  setArchived,
  setGuide,
  setPart,
  setSort,
  show,
  skipToday,
  toggleArch,
} from './views.js';
// the page's inline handlers (onclick="…") run in global scope: these are the functions they call
Object.assign(window, {
  addBlock,
  addPresets,
  addToday,
  askSwitch,
  closeEditor,
  cloud,
  delHist,
  deleteAcct,
  deleteRoutine,
  dup,
  durIn,
  durOut,
  exportAll,
  importAll,
  infoToggle,
  jump,
  keepNewAcct,
  linkProv,
  liveTap,
  logLate,
  maxRun,
  minRun,
  mv,
  newRoutine,
  openEditor,
  openHist,
  openLive,
  openSettings,
  openWeek,
  pickColor,
  pickIcon,
  playCombo,
  pvUpd,
  removeProv,
  resetAll,
  resetAudio,
  rm,
  saveRoutine,
  setArchived,
  setB,
  setGuide,
  setOpt,
  setPart,
  setRun,
  setSort,
  setWhen,
  show,
  signIn,
  signOutNow,
  skipToday,
  sndSet,
  sndVal,
  startRun,
  stopRun,
  syncNow,
  tap,
  testAudio,
  testVoice,
  toggleArch,
  toggleArchiveCur,
  toggleDay,
  toggleMute,
  togglePause,
  vMeasure,
  vdHide,
  wkMode,
});

addEventListener('pagehide', saveDraft);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveDraft();
});
initHistoryNav();
(() => {
  let tm = null;
  const stop = () => {
    clearTimeout(tm);
    tm = null;
  };
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.durw .ds');
    if (!b) return;
    e.preventDefault();
    stop();
    durStep(b);
    const rep = (ms) => {
      tm = setTimeout(() => {
        durStep(b);
        rep(Math.max(60, ms * 0.85));
      }, ms);
    };
    rep(450);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach((ev) =>
    (ev === 'blur' ? window : document).addEventListener(ev, stop, true),
  );
})();
['input', 'change'].forEach((t) => document.getElementById('edit').addEventListener(t, queueAutosave));
['eRounds', 'eRest', 'ePrep', 'eSec', 'eHold'].forEach((id) =>
  document.getElementById(id).addEventListener('input', () => {
    readHead();
    summary();
  }),
);
// blocks with an empty count length follow the routine's: keep their hint and combo preview in step
eSec.addEventListener('input', () => {
  document.querySelectorAll('#edit [data-rsec]').forEach((e) => (e.placeholder = `Routine (${cur.sec} s)`));
  cur.blocks.forEach((b) => pvUpd(b.id));
});
eSnd.addEventListener('change', () => {
  if (eSnd.value !== 'own') delete cur.snd;
  else if (!cur.snd) cur.snd = sndCopy(sndOf(cur));
  renderSnd();
  readHead();
  vfAll();
}); // Own: starts as a copy of Settings
speechSynthesis.onvoiceschanged = () => {
  vdShow();
  if (editOn() && cur) {
    renderSnd();
    vfAll();
  }
  if (document.getElementById('set').classList.contains('on')) openSettings();
};
initSoundUnlock();
document.addEventListener('keydown', (e) => {
  if (!run.classList.contains('on')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    const s = X && X.steps && X.steps[X.i];
    if (s && (s.mode === 'tap' || s.type === 'wait')) tap();
    else togglePause();
  }
  if (e.code === 'ArrowRight') jump(1);
  if (e.code === 'ArrowLeft') jump(-1);
  if (e.code === 'Escape') stopRun();
});
setInterval(() => {
  if (CR) banner();
}, 5000);
let PNOW = partNow();
setInterval(() => {
  const p = partNow();
  if (p === PNOW) return;
  PNOW = p;
  if (document.getElementById('lib').classList.contains('on')) renderList();
}, 60000); // a new part of the day: Up next moves along
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    scheduleSync(300);
    banner();
    if (document.getElementById('lib').classList.contains('on')) renderList();
  }
});
addEventListener('online', () => {
  if (!cloudP && localStorage.getItem('rf2_acct')) cloud();
});
initDrag();

gearIc.outerHTML = svgi('sliders', 20);
weekIc.outerHTML = svgi('cal', 20);
document.querySelectorAll('i[data-ic]').forEach((e) => (e.outerHTML = svgi(e.dataset.ic, 18)));
document.querySelector('.ctrl .sm').innerHTML = svgi('x', 22, 2.5);
document.querySelectorAll('.ctrl .md')[0].innerHTML = svgi('prev', 24);
document.querySelectorAll('.ctrl .md')[1].innerHTML = svgi('next', 24);
muteBtn.innerHTML = svgi('vol', 22);
pp.innerHTML = svgi('pause', 30);
minBtn.innerHTML = svgi('down', 22, 2.5);
renderList();
route();
setSync('');
restoreRun();
banner();
if (localStorage.getItem('rf2_acct')) cloud();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
// re-acquire wake lock after switching apps mid-workout
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && X && X.steps && S.wake && navigator.wakeLock)
    try {
      X.wl = await navigator.wakeLock.request('screen');
    } catch (e) {}
});
// background beeps: queue them when hidden; when back, drop the queue and catch up without repeating what already played
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    bgOn();
    return;
  }
  const had = BG.length > 0;
  bgOff();
  if (!had || !X || !X.steps || X.p != null) return;
  const now = NOW(),
    bq = bqPlayed(now);
  catchUp(now);
  if (!X || !X.steps) return;
  bqBack(bq, now);
  const s = X.steps[X.i],
    t = (NOW() - X.s0) / 1000;
  if (s.type === 'time') X.lastSec = Math.ceil(s.dur - t);
  else if (s.mode === 'guided') {
    const per = s.counts * s.tempo + s.repPause,
      rep = Math.floor(t / per),
      k = Math.floor((t - rep * per) / s.tempo);
    if (k < s.counts) X.lastCount = rep * 1000 + k;
  }
});
