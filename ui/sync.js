/* Account & sync: Google / GitHub sign-in (Firebase, in cloud.js) for routines, history and the running workout. */
import { runLive, unbox } from '../core/engine.js';
import { merge } from '../core/merge.js';
import { PRESETS, iconKey } from '../core/routine.js';
import { renderHist, streaks, updHistBtn } from './history.js';
import { COLORS, esc, svgi, toast } from './html.js';
import {
  DEV,
  LAST,
  LASTDOC,
  MINI,
  NOW,
  X,
  adopt,
  closeRun,
  finish,
  liveCard,
  liveIn,
  liveUI,
  mine,
  miniTx,
  ppIcon,
  pushRun,
  render,
  setLAST,
  setOFF,
  setStep,
  showCall,
  showDone,
  stepUI,
} from './runner.js';
import { bgOn, hush } from './sound.js';
import {
  H,
  HDEL,
  META,
  R,
  SY,
  saveH,
  saveRaw,
  setH,
  setHDEL,
  setMETA,
  setR,
  setSNAP,
  snapOf,
  store,
} from './storage.js';
import { SORT, renderList, renderParts, show } from './views.js';
let syncState = '',
  syncBusy = false,
  syncAgain = false,
  syncTimer = null,
  syncFails = 0,
  retryIn = 0;

let CLOUD = null,
  CS = '',
  CU = null,
  cloudP = null,
  authMsg = '',
  online = false,
  offT = null,
  syncErr = '';
let NEWACCT = false,
  DOC1 = false; // signed in to an account that had no data yet (maybe a second account by mistake)
let SWITCH = null,
  PEND,
  PENDRUN,
  DELNOTE = ''; // another account signed in than this device last synced with: wait for a choice before merging
let CR = null,
  CR1 = false; // the workout stored online; whether its first value has arrived since signing in
function saveSY() {
  store(localStorage, 'rf2_sync', JSON.stringify(SY));
}
const pname = (p) => ({ google: 'Google', github: 'GitHub', 'google.com': 'Google', 'github.com': 'GitHub' })[p] || p;
/* the sign-in code (and Firebase) only loads once you open Settings or have signed in on this device */
function cloud() {
  if (cloudP) return cloudP;
  CS = 'loading';
  return (cloudP = import('../cloud.js')
    .then(async (m) => {
      if (
        !(await m.start({
          user: onUser,
          doc: onDoc,
          run: onRemoteRun,
          conn: onConn,
          offset: onOffset,
          error: onCloudErr,
          gone: onGone,
        }))
      ) {
        CS = 'off';
        return null;
      }
      CLOUD = m;
      CS = 'ready';
      return m;
    })
    .catch((e) => {
      CS = 'fail';
      syncErr = (e && (e.code || e.message)) || '';
      cloudP = null;
      return null;
    })
    .finally(refreshAcct));
}
function onOffset(o) {
  setOFF(o);
  if (Math.abs((+DEV.off || 0) - o) > 50) {
    DEV.off = o;
    store(localStorage, 'rf2_dev', JSON.stringify(DEV));
  }
}
function onUser(u) {
  const was = CU && CU.uid;
  CU = u;
  if (u) store(localStorage, 'rf2_acct', '1');
  else localStorage.removeItem('rf2_acct');
  if (!u || u.uid !== was) {
    CR = null;
    CR1 = false;
    NEWACCT = false;
    DOC1 = false;
    clearTimeout(syncTimer);
    if (!u && X && X.steps && !mine()) {
      closeRun();
      show('lib');
    }
    const last = lastAcct();
    SWITCH = u && last && last.uid !== u.uid ? last : null;
    PEND = undefined;
    PENDRUN = undefined;
    if (u) DELNOTE = '';
  }
  setSync(u ? (u.uid === was ? syncState : online ? 'busy' : 'offline') : '');
  banner();
  refreshAcct();
}
function onConn(c) {
  online = c;
  clearTimeout(offT);
  if (c) {
    if (CU) scheduleSync(300);
  } else
    offT = setTimeout(() => {
      if (!online && CU) setSync('offline');
    }, 3000);
}
function onCloudErr(e) {
  syncErr = (e && (e.code || e.message)) || '';
  if (CU) setSync('err');
  refreshAcct();
}
function setSync(st) {
  syncState = st;
  const el = document.getElementById('syncDot'),
    sb = document.getElementById('setBtn');
  let lbl = '';
  if (CU) {
    const t = SY.last ? new Date(SY.last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    lbl =
      {
        busy: 'Syncing…',
        ok: 'Synced ' + t,
        offline: 'Offline — syncs when back online',
        err: 'Sync failed — will retry',
      }[st] || 'Signed in';
  }
  const show = !!CU && ['busy', 'offline', 'err'].includes(st);
  if (el) {
    el.hidden = !show;
    el.className = 's-' + st;
  }
  if (sb) {
    const t = show ? 'Settings · ' + lbl : 'Settings';
    sb.title = t;
    sb.setAttribute('aria-label', t);
  }
  const sl = document.getElementById('syncStatus');
  if (sl) sl.textContent = st === 'err' ? 'Sync failed' + (syncErr ? ` — ${syncWhy(syncErr)}` : '') : lbl;
  const rb = document.getElementById('syncRetry');
  if (rb) rb.hidden = st !== 'err';
}
function localDoc() {
  return {
    app: 'repflow',
    v: 1,
    routines: R,
    deleted: META.deleted,
    order: { ids: R.map((r) => r.id), ts: META.orderTs },
    history: H,
    hdel: HDEL,
    parts: META.parts,
  };
}
function applyRemote(txt) {
  let remote = {};
  try {
    remote = JSON.parse(txt || '{}') || {};
  } catch (e) {}
  const m = merge(localDoc(), remote);
  setR(m.routines);
  META.deleted = m.deleted;
  META.orderTs = m.order.ts;
  if (m.parts) META.parts = m.parts;
  setH(m.history);
  setHDEL(m.hdel);
  saveH();
  setSNAP(snapOf());
  saveRaw();
  renderList();
  if (document.getElementById('set').classList.contains('on') && !document.activeElement.closest('#partForm'))
    renderParts();
  if (document.getElementById('hist').classList.contains('on')) renderHist();
  if (LAST && LAST.ask && H.some((h) => h.id === LAST.entry.id)) {
    LAST.ask = false;
    LAST.L = { ...streaks(), newBest: false };
    updHistBtn();
    if (run.classList.contains('fin')) showDone();
  } // already logged on another device
  return JSON.stringify(m);
}
function onDoc(txt) {
  if (!CU) return;
  if (SWITCH) {
    const first = PEND === undefined;
    PEND = txt;
    if (first) askSwitch();
    return;
  }
  if (!DOC1) {
    DOC1 = true;
    saveAcct();
    if (txt == null) {
      NEWACCT = true;
      refreshAcct();
    }
  }
  const out = applyRemote(txt);
  if (out !== txt) scheduleSync(300);
  else {
    SY.last = Date.now();
    saveSY();
    syncFails = 0;
    setSync('ok');
  }
}
async function syncNow() {
  if (!CU || !CLOUD || SWITCH) return;
  if (syncBusy) {
    syncAgain = true;
    return;
  }
  syncBusy = true;
  if (online) setSync('busy');
  try {
    await CLOUD.update((txt) => {
      const out = applyRemote(txt);
      return out === txt ? undefined : out;
    });
    SY.last = Date.now();
    saveSY();
    syncFails = 0;
    syncErr = '';
    setSync(online ? 'ok' : 'offline');
  } catch (e) {
    if (e && e.code === 'signed-out') return;
    syncErr = (e && (e.code || e.message)) || '';
    setSync(online ? 'err' : 'offline');
    if (CU) retryIn = Math.min(300000, 5000 * 2 ** Math.min(6, syncFails++));
  } finally {
    syncBusy = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync(300);
    } else if (retryIn) {
      scheduleSync(retryIn);
    }
    retryIn = 0;
  }
}
function scheduleSync(ms = 1500) {
  if (!CU) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, ms);
}
function signIn(p) {
  if (!CLOUD) return;
  authMsg = '';
  CLOUD.signIn(p).then(
    () => {
      authMsg = '';
      refreshAcct();
    },
    (e) => {
      authMsg = authErr(e, p);
      refreshAcct();
    },
  );
}
function linkProv(p) {
  if (!CLOUD) return;
  authMsg = '';
  CLOUD.link(p).then(
    () => {
      authMsg = '';
      NEWACCT = false;
      refreshAcct();
    },
    (e) => {
      authMsg = authErr(e, p);
      refreshAcct();
    },
  );
}
/* small in-page dialog; a button's action runs straight from its click, so sign-in pop-ups are allowed */
function ask({ title, text, check, buttons, locked }) {
  let d = document.getElementById('ask');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'ask';
    d.className = 'ask';
    document.body.appendChild(d);
  }
  if (d.open) d.close();
  d.innerHTML = `<h2>${esc(title)}</h2>${text || ''}${check ? `<label class="chk"><input type="checkbox" id="askChk">${esc(check)}</label>` : ''}<div class="btns">${buttons.map((b, i) => `<button class="${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`;
  d.oncancel = (e) => {
    if (locked) e.preventDefault();
  };
  d.onclick = (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const it = buttons[+b.dataset.i],
      c = !!(d.querySelector('#askChk') || {}).checked;
    d.close();
    if (it.run) it.run(c);
  };
  d.showModal();
  if (!locked) d.querySelector('.btns button:last-child').focus();
} // Cancel has focus: Enter never confirms by accident
/* which account this device last synced with, so a different one isn't silently mixed in */
function lastAcct() {
  try {
    return JSON.parse(localStorage.getItem('rf2_uid') || 'null');
  } catch (e) {
    return null;
  }
}
function saveAcct() {
  if (CU) store(localStorage, 'rf2_uid', JSON.stringify({ uid: CU.uid, email: CU.email || CU.name || '' }));
}
/* back to the 5 default routines (or none) and an empty history, on this device only (no sync: signed out or about to merge) */
function clearLocal(none) {
  setR(none ? [] : PRESETS().map((r) => ({ ...r, upd: 0 })));
  setMETA({ deleted: {}, orderTs: 0 });
  setH([]);
  setHDEL({});
  setLAST(null);
  SY.last = 0;
  saveSY();
  saveH();
  setSNAP(snapOf());
  saveRaw();
  renderList();
  updHistBtn();
}
function signOutNow() {
  if (!CLOUD || !CU) return;
  ask({
    title: 'Sign out on this device?',
    text: '<p>Your routines and history stay in your account.</p>',
    check: 'Also remove them from this device (e.g. a shared device)',
    buttons: [
      {
        label: 'Sign out',
        cls: 'danger',
        run: (wipe) => {
          authMsg = '';
          CLOUD.signOut()
            .then(() => {
              if (wipe) {
                clearLocal();
                localStorage.removeItem('rf2_uid');
              }
            })
            .finally(refreshAcct);
        },
      },
      { label: 'Cancel', cls: 'ghost' },
    ],
  });
}
function removeProv(p) {
  const other = CU.providers.map(pname).find((n) => n !== pname(p)) || '';
  ask({
    title: `Remove ${pname(p)} sign-in?`,
    text: `<p>You’ll sign in with ${esc(other)} only. Your account and data stay.</p>`,
    buttons: [
      {
        label: 'Remove',
        cls: 'danger',
        run: () => {
          authMsg = '';
          CLOUD.unlink(p).then(
            () => refreshAcct(),
            (e) => {
              authMsg = authErr(e, p);
              refreshAcct();
            },
          );
        },
      },
      { label: 'Cancel', cls: 'ghost' },
    ],
  });
}
function deleteAcct() {
  if (!CLOUD || !CU) return;
  const p = CU.providers.includes('google.com') ? 'google' : 'github',
    was = CU.providers.slice();
  ask({
    title: 'Delete account?',
    text: `<p>This deletes <b>${esc(CU.email || CU.name || 'your account')}</b> and all routines and history synced to it, on every device. It can’t be undone.</p><p>To confirm, ${pname(p)} asks you to sign in once more.</p>`,
    check: 'Also remove routines and history from this device',
    buttons: [
      {
        label: 'Delete account',
        cls: 'danger',
        run: (wipe) => {
          authMsg = 'Deleting your account…';
          refreshAcct();
          CLOUD.deleteAccount(p).then(
            () => {
              if (wipe) clearLocal();
              localStorage.removeItem('rf2_uid');
              authMsg = '';
              DELNOTE = delNote(was);
              refreshAcct();
            },
            (e) => {
              authMsg =
                e && e.dataGone
                  ? 'Your synced data was deleted, but the account itself couldn’t be. Sign in and try again.'
                  : authErr(e, p);
              refreshAcct();
            },
          );
        },
      },
      { label: 'Cancel', cls: 'ghost' },
    ],
  });
}
const delNote = (ps) =>
  'Account deleted. PunchPace may still be listed in ' +
  [
    ps.includes('google.com') &&
      '<a href="https://myaccount.google.com/connections" target="_blank" rel="noopener">your Google connections</a>',
    ps.includes('github.com') &&
      '<a href="https://github.com/settings/applications" target="_blank" rel="noopener">your GitHub apps</a>',
  ]
    .filter(Boolean)
    .join(' and ') +
  '; you can remove it there.';
function onGone() {
  DELNOTE = 'This account was deleted on another device. Your routines and history stay on this device.';
  refreshAcct();
}
/* a different account than last time: add this device's data to it, use only its data, or sign out (wrong account) */
function askSwitch() {
  const fresh = PEND == null,
    me = CU.email || CU.name || 'this account';
  ask({
    title: 'Data from another account',
    locked: true,
    text: `<p>This device has routines and history from <b>${esc(SWITCH.email || 'another account')}</b>.${fresh ? ` <b>${esc(me)}</b> is a new account.` : ''}</p><p>Either way, ${esc(SWITCH.email || 'that account')} keeps its own synced copy.</p>`,
    buttons: [
      { label: 'Add them to this account', cls: 'primary', run: () => switchTo(false) },
      { label: 'Use this account’s data only', run: () => switchTo(true) },
      {
        label: 'Sign out',
        cls: 'ghost',
        run: () => {
          SWITCH = null;
          CLOUD.signOut().finally(refreshAcct);
        },
      },
    ],
  });
}
function switchTo(only) {
  const txt = PEND,
    run = PENDRUN;
  SWITCH = null;
  PEND = undefined;
  PENDRUN = undefined;
  if (only) clearLocal(txt != null); // the account's own data only (defaults if it has none)

  onDoc(txt);
  NEWACCT = false;
  if (run !== undefined) onRemoteRun(run);
  refreshAcct();
}
const syncWhy = (c) =>
  /permission/i.test(c) ? 'no access to your data' : /network|offline|disconnect/i.test(c) ? 'no connection' : c;
function authErr(e, p) {
  const c = (e && e.code) || '';
  if (c === 'exists')
    return `${e.email || 'This email'} already has an account with ${pname(e.other)}. Continue with ${pname(e.other)}; ${pname(p)} is then added to it.`;
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request' || c === 'auth/user-cancelled')
    return '';
  if (c === 'auth/popup-blocked') return 'The sign-in window was blocked. Allow pop-ups for this site and try again.';
  if (c === 'auth/unauthorized-domain')
    return 'This site isn’t allowed to sign in yet (Firebase → Authentication → Settings → Authorized domains).';
  if (c === 'auth/operation-not-allowed')
    return `${pname(p)} sign-in isn’t switched on yet (Firebase → Authentication → Sign-in method).`;
  if (c === 'auth/network-request-failed') return 'No connection. Try again when you’re online.';
  if (c === 'auth/credential-already-in-use')
    return `That ${pname(p)} account already has its own PunchPace account, so it can’t be added here.`;
  if (c === 'auth/user-mismatch')
    return `That’s a different ${pname(p)} account. Choose the one you’re signed in with.`;
  if (c === 'auth/requires-recent-login') return 'For your security, sign out and in again, then try again.';
  if (c === 'auth/no-such-provider') return `${pname(p)} sign-in was already removed.`;
  return 'Sign-in failed' + (c ? ` (${c})` : '') + '.';
}
function keepNewAcct() {
  NEWACCT = false;
  refreshAcct();
}
function refreshAcct() {
  if (!document.getElementById('set').classList.contains('on')) return;
  document.getElementById('syncCard').innerHTML = syncCard();
  setSync(syncState);
}
function syncCard() {
  const h = `<h2 style="margin-bottom:8px">Account & sync</h2>`,
    msg = authMsg ? `<p class="amsg">${esc(authMsg)}</p>` : '';
  if (CS === 'off') return h + `<p class="muted" style="margin:0">Sign-in isn’t set up yet.</p>`;
  if (CS === 'fail')
    return (
      h +
      `<p class="muted" style="margin:0 0 12px">Couldn’t load sign-in${syncErr ? ` (${esc(syncErr)})` : ''}. Check your connection.</p><button class="ib" onclick="cloud()">${svgi('refresh', 16)}Try again</button>`
    );
  if (!CLOUD) return h + `<p class="muted" style="margin:0">Loading…</p>`;
  if (!CU)
    return (
      h +
      (DELNOTE ? `<p class="anote">${DELNOTE}</p>` : '') +
      `<p class="muted" style="margin:0 0 12px">Sign in to sync your routines, history and a running workout across your devices. Use the same sign-in on every device. Audio settings stay per device.</p>${msg}
    <div class="row"><button class="ib" onclick="signIn('google')">Continue with Google</button><button class="ib" onclick="signIn('github')">Continue with GitHub</button></div>`
    );
  const ms = CU.methods || CU.providers.map((id) => ({ id, label: '' })),
    two = ms.length > 1,
    miss = ['google', 'github'].filter((p) => !CU.providers.includes(p + '.com'));
  return (
    h +
    `<p style="margin:0;overflow-wrap:anywhere">${esc(CU.email || CU.name || 'Signed in')}</p>
    <div class="sstat muted"><span id="syncStatus"></span><button class="ghost" title="Sync now" aria-label="Sync now" onclick="syncNow()">${svgi('refresh', 16)}</button><button class="ghost" id="syncRetry" hidden onclick="syncNow()">Retry</button></div>${msg}${SWITCH ? `<p class="amsg">Waiting for your choice about the routines and history from ${esc(SWITCH.email || 'another account')}. <button class="ghost" style="padding:0;text-decoration:underline;color:inherit" onclick="askSwitch()">Choose</button></p>` : ''}${NEWACCT && !SWITCH ? `<p class="amsg">This is a new account. Already use PunchPace with ${ms.length === 1 && miss.length ? pname(miss[0]) : 'another sign-in'}? Sign out and continue with that, so everything stays in one account. <button class="ghost" style="padding:0;text-decoration:underline;color:inherit" onclick="keepNewAcct()">I’m new, keep this</button></p>` : ''}
    <div class="acct-k">Sign-in methods</div>
    ${ms
      .map((m) => {
        const p = m.id.replace('.com', '');
        return `<div class="meth"><span><b>${pname(m.id)}</b>${m.label ? ` · ${esc(m.label)}` : ''}</span>${two ? `<button class="ghost" onclick="removeProv('${p}')">Remove</button>` : ''}</div>`;
      })
      .join('')}
    ${miss.map((p) => `<div class="meth"><span class="muted">Optional backup for this account</span><button class="ghost" onclick="linkProv('${p}')">+ Add ${pname(p)}</button></div>`).join('')}
    <div class="acct-row"><button onclick="signOutNow()">Sign out</button><button class="ghost danger" onclick="deleteAcct()">Delete account</button></div>
    <p class="muted" style="margin:12px 0 0">Routines, history and a running workout sync automatically. Audio settings stay per device.</p>`
  );
}
/* the running workout, shared live: the device you last controlled it from plays the sound and saves progress */
const runName = (v) => {
  try {
    return JSON.parse(v.r).name || 'Workout';
  } catch (e) {
    return 'Workout';
  }
};
function onRemoteRun(v) {
  if (SWITCH) {
    PENDRUN = v;
    return;
  }
  const first = !CR1;
  CR1 = true;
  CR = v && v.sid ? v : null;
  const L = X && X.steps ? X : null;
  if (L) {
    if (mine() && (!CR || (first && (L.u || 0) > (CR.u || 0))))
      pushRun(); // first contact: what this device did offline is newer
    else if (CR && CR.sid === L.sid) {
      if (CR.u !== L.u || CR.by !== L.by) {
        if (CR.end) remoteEnd(CR);
        else applySame(CR);
      }
    } else if (CR && !CR.end) {
      adopt(CR);
      toast(`${runName(CR)} started on ${CR.dn || 'another device'}`, true);
    } else if (CR) {
      if (!closeRun()) show('lib');
    }
  } else if (first && LASTDOC && LASTDOC.end && CR && CR.sid === LASTDOC.sid && !CR.end && LASTDOC.u > (CR.u || 0))
    CLOUD.setRun(LASTDOC).catch(() => {});
  banner();
  if (document.hidden) bgOn();
} // in the background: queue the beeps again for the new state
function applySame(v) {
  X.bq = null;
  const was = mine(),
    st = (v.i | 0) !== X.i || +v.s0 !== X.s0;
  X.u = +v.u || 0;
  X.by = v.by;
  X.dn = v.dn || '';
  X.t0 = +v.t0;
  X.p = v.p == null ? null : +v.p;
  if (st) {
    setStep(Math.max(0, Math.min(X.steps.length - 1, v.i | 0)), +v.s0);
    stepUI();
  }
  X.tap = v.tap | 0;
  X.nc = +v.nc || 0;
  X.calls = v.calls | 0;
  X.box = unbox(v.box);
  if ((v.ct || '') !== X.ct) {
    X.ct = v.ct || '';
    showCall(X.ct);
  }
  if (was && !mine()) {
    hush();
    localStorage.removeItem('rf2_run');
  } else if (mine()) store(localStorage, 'rf2_run', JSON.stringify(v));
  ppIcon();
  liveUI();
  render();
}
function remoteEnd(v) {
  if (v.end === 'done') {
    X.by = v.by;
    X.dn = v.dn || '';
    X.t0 = +v.t0 || X.t0;
    X.calls = v.calls | 0;
    const f = +v.fin || NOW();
    finish(f, Math.max(0, NOW() - f), true);
  } else {
    if (!closeRun()) show('lib');
    toast(`Workout stopped on ${v.dn || 'another device'}`, true);
  }
}
function runActive(v) {
  return runLive(v, NOW());
}
let BAN = '';
function banner() {
  const el = document.getElementById('liveBar');
  if (!el) return;
  const v = CR;
  let h = '';
  if (MINI && X && X.steps) {
    if (!SORT && !liveIn()) h = liveCard();
  } // the Order view shows only the order
  else if (v && !(X && X.steps && X.sid === v.sid) && runActive(v)) {
    let r = {};
    try {
      r = JSON.parse(v.r) || {};
    } catch (e) {}
    const c = COLORS[r.color] || COLORS.blue;
    h = `<div class="card rcard livebar"><div class="dot" style="background:${c}22;color:${c}">${svgi(iconKey(r), 22)}</div><div class="info"><b>${esc(r.name || 'Workout')}</b><div class="muted">${v.p != null ? 'Paused' : 'Live'} on ${v.by === DEV.id ? 'this device' : esc(v.dn || 'another device')}</div></div><button class="primary" onclick="openLive()">Open</button></div>`;
  }
  if (h !== BAN) {
    BAN = h;
    el.innerHTML = h;
    if (MINI) miniTx();
  }
}
function openLive() {
  if (CR && runActive(CR) && adopt(CR)) banner();
}
export {
  syncState,
  CLOUD,
  CU,
  cloudP,
  SWITCH,
  CR,
  CR1,
  cloud,
  setSync,
  syncNow,
  scheduleSync,
  signIn,
  linkProv,
  signOutNow,
  removeProv,
  deleteAcct,
  askSwitch,
  keepNewAcct,
  syncCard,
  banner,
  openLive,
};
