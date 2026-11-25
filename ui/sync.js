/* Account & sync: Google / GitHub sign-in (Firebase, in cloud.js) for routines, history and the running workout. */
import { does } from './actions.js';
import { runDevice, runLive, unbox } from '../core/engine.js';
import { changed, docOf, itemsOf, merge, norm, print } from '../core/merge.js';
import { PRESETS, iconKey } from '../core/routine.js';
import { WIPE_KEY, appKeys, storageChange } from '../core/windows.js';
import { renderHist, streaks, updHistBtn } from './history.js';
import { COLORS, esc, svgi, tint, toast } from './html.js';
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
  leaveRun,
  stopShared,
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
  reloadData,
  reloadSY,
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
  PEND, // the account's first data while a choice is pending: {raw, legacy, empty}
  PENDRUN,
  DELNOTE = ''; // another account signed in than this device last synced with: wait for a choice before merging
let CR = null,
  CR1 = false; // the workout stored online; whether its first value has arrived since signing in
function saveSY() {
  store(localStorage, 'rf2_sync', JSON.stringify(SY));
}
/* what the account stores, as far as this device knows: per item a fingerprint (core/merge.js print), and the newest
   written time seen, so the next start asks only for items written since. Only valid for that account and this device's data */
let SYN = { uid: '', seen: 0, items: {} };
try {
  SYN = { ...SYN, ...JSON.parse(localStorage.getItem('rf2_synced') || 'null') };
} catch (e) {}
const saveSYN = () => store(localStorage, 'rf2_synced', JSON.stringify(SYN));
function reloadSYN() {
  try {
    SYN = { uid: '', seen: 0, items: {}, ...JSON.parse(localStorage.getItem('rf2_synced') || 'null') };
  } catch (e) {}
}
const resetSYN = (uid = '') => {
  SYN = { uid, seen: 0, items: {} };
  saveSYN();
};
/* while connected and listening, this device has everything the account had a moment ago: remember when, so the next
   start asks only for items written since then (cloud.js subtracts a margin for writes still on their way) */
let LISTENING = false;
function markSeen() {
  if (!CU || !CLOUD || !online || !LISTENING || SYN.uid !== CU.uid) return;
  SYN.seen = Math.max(SYN.seen, CLOUD.now());
  saveSYN();
}
document.addEventListener('visibilitychange', () => document.hidden && markSeen());
addEventListener('pagehide', markSeen);
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
          items: (raw, first) => onRemote(raw, first, false),
          legacy: onLegacy,
          seen: (uid) => (SYN.uid === uid ? SYN.seen : 0),
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
    LISTENING = false;
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
/* merges items from the account into this device's data. stored: they are what the account holds (not the old document
   being moved), so they count as synced. Returns whether this device now has something to upload */
function applyRemote(raw, stored = true) {
  if (!CU) return false;
  if (SYN.uid !== CU.uid) resetSYN(CU.uid);
  const got = {};
  Object.entries(raw || {}).forEach(([k, v]) => {
    const n = norm(k, v);
    if (!n) return;
    if (stored) {
      if (v && v.m > SYN.seen) SYN.seen = v.m;
      const p = print(n);
      if (SYN.items[k] === p) return; // nothing new (e.g. this device's own write coming back)
      SYN.items[k] = p;
    }
    got[k] = n;
  });
  if (stored) saveSYN();
  if (Object.keys(got).length) {
    const ids = Object.keys(SYN.items)
      .filter((k) => k.startsWith('r/'))
      .map((k) => k.slice(2));
    const m = merge(localDoc(), docOf(got), ids);
    setR(m.routines);
    META.deleted = m.deleted;
    META.orderTs = m.order.ts;
    if (m.parts) META.parts = m.parts;
    setH(m.history);
    setHDEL(m.hdel);
    saveH();
    setSNAP(snapOf());
    saveRaw();
    redraw();
    if (LAST && LAST.ask && H.some((h) => h.id === LAST.entry.id)) {
      LAST.ask = false;
      LAST.L = { ...streaks(), newBest: false };
      updHistBtn();
      if (run.classList.contains('fin')) showDone();
    } // already logged on another device
  }
  return changed(itemsOf(localDoc()), SYN.items).length > 0;
}
/* the screens that show routines and history, after the data changed underneath them */
function redraw() {
  renderList();
  if (document.getElementById('set').classList.contains('on') && !document.activeElement.closest('#partForm'))
    renderParts();
  if (document.getElementById('hist').classList.contains('on')) renderHist();
  if (run.classList.contains('fin')) showDone(); // Again and Next follow the routines: one deleted elsewhere drops Again (issue 120)
}
/* another window of the app on this device (a tab or the installed app) changed what's stored (core/windows.js).
   Without this, a window holding an old copy writes deleted routines back, or uploads them to the next account.
   After a wipe it starts over: its editor draft is dropped so a deleted routine can't come back from there. A burst of
   writes is read once. An open editor stays open (saving merges into the new data); a workout keeps running */
let otherT = null,
  otherData = false;
function fromOtherWindow(key) {
  const kind = storageChange(key);
  if (!kind) return;
  if (kind === 'wipe') {
    document.getElementById('edit').classList.remove('on'); // or leaving the page saves the editor's draft again (saveDraft)
    sessionStorage.removeItem('rf2_draft');
    history.replaceState(null, '', '#/');
    location.reload();
    return;
  }
  if (kind === 'data') otherData = true;
  clearTimeout(otherT);
  otherT = setTimeout(() => {
    reloadSYN();
    if (!otherData) return reloadSY();
    otherData = false;
    if (!reloadData()) return;
    redraw();
    updHistBtn();
    banner();
  }, 50);
}
/* items from the account: on start (first) the changes since this device last looked, then each change */
function onRemote(raw, first, legacy, empty) {
  if (!CU) return;
  if (SWITCH) {
    if (PEND === undefined) {
      PEND = { raw, legacy, empty };
      askSwitch();
    } else if (!legacy) PEND.raw = { ...PEND.raw, ...raw };
    return;
  }
  if (first && !DOC1) {
    DOC1 = true;
    saveAcct();
    if (empty) {
      NEWACCT = true;
      refreshAcct();
    }
  }
  if (!legacy) LISTENING = true;
  if (applyRemote(raw, !legacy) || legacy) scheduleSync(300);
  else if (first) {
    SY.last = Date.now();
    saveSY();
    syncFails = 0;
    setSync('ok');
  }
}
/* an account that hasn't moved to items yet: its old single document (null: a new account), read once. The next sync
   uploads everything as items */
function onLegacy(txt) {
  let doc = {};
  try {
    doc = JSON.parse(txt || '{}') || {};
  } catch (e) {}
  if (CU) resetSYN(CU.uid); // nothing of this account is stored as items yet
  onRemote(itemsOf(doc), true, true, txt == null);
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
    if (SYN.uid !== CU.uid) resetSYN(CU.uid);
    const it = itemsOf(localDoc());
    const list = Object.fromEntries(changed(it, SYN.items).map((k) => [k, it[k]]));
    if (Object.keys(list).length) {
      // what the account now stores: ours, or its own if that was newer
      applyRemote(await CLOUD.put(list));
      // the account kept an equally new copy that differs only in form (e.g. migrated here, not there): don't send it
      // again on every sync. Only for items not edited again meanwhile
      const now = itemsOf(localDoc());
      changed(now, SYN.items)
        .filter((k) => list[k] && print(now[k]) === print(list[k]))
        .forEach((k) => (SYN.items[k] = print(now[k])));
      saveSYN();
    }
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
/* small in-page dialog; a button's action runs straight from its click, so sign-in pop-ups are allowed.
   A button with a `lead` (the situation it fits) and a `note` (what it does) is shown as a choice block,
   so people pick by situation instead of decoding what each option does */
function askBtn(b, i) {
  const btn = `<button class="${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`;
  if (!b.lead) return btn;
  return `<div class="choice"><h3>${esc(b.lead)}</h3>${btn}${b.note ? `<p>${esc(b.note)}</p>` : ''}</div>`;
}
function ask({ title, text, check, buttons, locked }) {
  let d = document.getElementById('ask');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'ask';
    d.className = 'ask';
    document.body.appendChild(d);
  }
  if (d.open) d.close();
  d.innerHTML = `<h2>${esc(title)}</h2>${text || ''}${check ? `<label class="chk"><input type="checkbox" id="askChk">${esc(check)}</label>` : ''}<div class="btns">${buttons.map(askBtn).join('')}</div>`;
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
/* back to the 5 default routines (or none) and an empty history, on this device only (no sync: signed out or about to merge).
   An unfinished workout goes too, so the next person can't resume it; the other windows start over (fromOtherWindow) */
function clearLocal(none) {
  if (X && X.steps) {
    closeRun();
    show('lib');
  }
  localStorage.removeItem('rf2_run');
  setR(none ? [] : PRESETS().map((r) => ({ ...r, upd: 0 })));
  setMETA({ deleted: {}, orderTs: 0 });
  setH([]);
  setHDEL({});
  setLAST(null);
  SY.last = 0;
  saveSY();
  resetSYN(); // nothing is synced any more: the next start downloads the account's data in full
  saveH();
  setSNAP(snapOf());
  saveRaw();
  store(localStorage, WIPE_KEY, String(Date.now()));
  renderList();
  updHistBtn();
}
function signOutNow() {
  if (!CLOUD || !CU) return;
  ask({
    title: 'Sign out?',
    text: '<p>Your routines and history are safe in your account either way.</p>',
    buttons: [
      {
        lead: 'Your own phone?',
        label: 'Sign out',
        note: 'Your routines stay in the app, so you can keep training. Sign in again to sync.',
        run: () => signOutAnd(false),
      },
      {
        lead: 'Someone else’s phone or computer?',
        label: 'Sign out and clear',
        cls: 'danger',
        note: 'Removes your routines from the app, so the next person can’t see or change them.',
        run: () => signOutAnd(true),
      },
      { label: 'Cancel', cls: 'ghost' },
    ],
  });
}
function signOutAnd(wipe) {
  authMsg = '';
  leaveRun()
    .then(() => CLOUD.signOut())
    .then(() => {
      if (wipe) {
        clearLocal();
        localStorage.removeItem('rf2_uid');
      }
    })
    .finally(refreshAcct);
}
/* Reset all (#74): this device starts over like a fresh install. Every key the app owns goes (core/windows.js appKeys):
   routines, history, settings, what the voice learned, the device code and the last account. Signed in, it signs out
   first, so nothing is deleted from the account (that's Delete account). Other windows start over (fromOtherWindow) */
function resetDevice() {
  const signedIn = !!CU || !!localStorage.getItem('rf2_acct');
  ask({
    title: 'Reset this device?',
    text:
      '<p>Removes all routines, history and settings from this device and starts over with the 5 default routines. Export JSON first if you want a backup.</p>' +
      (signedIn
        ? '<p>You’ll be signed out first. Your account keeps its routines and history; to delete those, use Delete account.</p>'
        : ''),
    buttons: [
      { label: 'Reset this device', cls: 'danger', run: () => (signedIn ? signOutThenWipe() : wipeDevice()) },
      { label: 'Cancel', cls: 'ghost' },
    ],
  });
}
/* signed in: the account must be signed out before the device forgets it, or the next start would sign in again and
   sync. Firebase's signOut waits for the saved sign-in to load, so it works right after opening Settings too */
function signOutThenWipe() {
  authMsg = '';
  (CLOUD ? Promise.resolve(CLOUD) : cloud())
    .then((m) => {
      if (m) return leaveRun().then(() => m.signOut());
      if (CS !== 'off') throw new Error('sign-in code not loaded');
    })
    .then(wipeDevice, () => {
      toast('Couldn’t sign out, so nothing was reset. Check your connection and try again.');
      refreshAcct();
    });
}
function wipeDevice() {
  if (X && X.steps) closeRun();
  document.getElementById('edit').classList.remove('on'); // or leaving the page saves an editor draft again (saveDraft)
  try {
    appKeys(Object.keys(localStorage)).forEach((k) => localStorage.removeItem(k));
    appKeys(Object.keys(sessionStorage)).forEach((k) => sessionStorage.removeItem(k));
    localStorage.setItem(WIPE_KEY, String(Date.now())); // tells the other windows; then gone, as on a fresh install
    localStorage.removeItem(WIPE_KEY);
  } catch (e) {}
  history.replaceState(null, '', '#/');
  location.reload();
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
/* is this sign-in method on the account: an exact match on Firebase's provider id ('google.com', 'github.com'), not a URL */
const hasProvider = (ids, p) => ids.some((id) => id === `${p}.com`);
function deleteAcct() {
  if (!CLOUD || !CU) return;
  const p = hasProvider(CU.providers, 'google') ? 'google' : 'github',
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
    hasProvider(ps, 'google') &&
      '<a href="https://myaccount.google.com/connections" target="_blank" rel="noopener">your Google connections</a>',
    hasProvider(ps, 'github') &&
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
  const fresh = !!(PEND && PEND.empty),
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
  const p = PEND || { raw: {} },
    run = PENDRUN;
  SWITCH = null;
  PEND = undefined;
  PENDRUN = undefined;
  if (only) clearLocal(!p.empty); // the account's own data only (defaults if it has none)
  resetSYN(CU.uid);
  onRemote(p.raw, true, p.legacy, p.empty);
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
  const h = `<h2 class="mb-2">Account & sync</h2>`,
    msg = authMsg ? `<p class="amsg">${esc(authMsg)}</p>` : '';
  if (CS === 'off') return h + `<p class="muted m-0">Sign-in isn’t set up yet.</p>`;
  if (CS === 'fail')
    return (
      h +
      `<p class="muted m-0 mb-3">Couldn’t load sign-in${syncErr ? ` (${esc(syncErr)})` : ''}. Check your connection.</p><button class="ib" ${does('click:cloud')}>${svgi('refresh', 16)}Try again</button>`
    );
  if (!CLOUD) return h + `<p class="muted m-0">Loading…</p>`;
  if (!CU)
    return (
      h +
      (DELNOTE ? `<p class="anote">${DELNOTE}</p>` : '') +
      `<p class="muted m-0 mb-3">Sign in to sync your routines, history and a running workout across your devices. Use the same sign-in on every device. Audio settings stay per device.</p>${msg}
    <div class="row"><button class="ib" ${does('click:signIn', 'google')}>Continue with Google</button><button class="ib" ${does('click:signIn', 'github')}>Continue with GitHub</button></div>
    <div class="links mt-3 fs-sm"><a href="privacy.html">How your data is handled</a></div>`
    );
  const ms = CU.methods || CU.providers.map((id) => ({ id, label: '' })),
    two = ms.length > 1,
    miss = ['google', 'github'].filter((p) => !hasProvider(CU.providers, p));
  return (
    h +
    `<p style="margin:0;overflow-wrap:anywhere">${esc(CU.email || CU.name || 'Signed in')}</p>
    <div class="sstat muted"><span id="syncStatus"></span><button class="ghost" title="Sync now" aria-label="Sync now" ${does('click:syncNow')}>${svgi('refresh', 16)}</button><button class="ghost" id="syncRetry" hidden ${does('click:syncNow')}>Retry</button></div>${msg}${SWITCH ? `<p class="amsg">Waiting for your choice about the routines and history from ${esc(SWITCH.email || 'another account')}. <button class="ghost link" ${does('click:askSwitch')}>Choose</button></p>` : ''}${NEWACCT && !SWITCH ? `<p class="amsg">This is a new account. Already use PunchPace with ${ms.length === 1 && miss.length ? pname(miss[0]) : 'another sign-in'}? Sign out and continue with that, so everything stays in one account. <button class="ghost link" ${does('click:keepNewAcct')}>I’m new, keep this</button></p>` : ''}
    <div class="acct-k">Sign-in methods</div>
    ${ms
      .map((m) => {
        const p = m.id.replace('.com', '');
        return `<div class="meth"><span><b>${pname(m.id)}</b>${m.label ? ` · ${esc(m.label)}` : ''}</span>${two ? `<button class="ghost" ${does('click:removeProv', p)}>Remove</button>` : ''}</div>`;
      })
      .join('')}
    ${miss.map((p) => `<div class="meth"><span class="muted">Optional backup for this account</span><button class="ghost" ${does('click:linkProv', p)}>+ Add ${pname(p)}</button></div>`).join('')}
    <div class="acct-row"><button ${does('click:signOutNow')}>Sign out</button><button class="ghost danger" ${does('click:deleteAcct')}>Delete account</button></div>
    <p class="muted" style="margin:var(--space-3) 0 0">Routines, history and a running workout sync automatically. Audio settings stay per device.</p>`
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
      toast(`${runName(CR)} started on ${runDevice(CR, DEV)}`, true);
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
    toast(`Workout stopped on ${runDevice(v, DEV)}`, true);
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
    h = `<div class="card rcard livebar"><div class="dot" style="background:${tint(c, 13)};color:${c}">${svgi(iconKey(r), 22)}</div><div class="info"><b>${esc(r.name || 'Workout')}</b><div class="muted">${v.p != null ? 'Paused' : 'Live'} on ${esc(runDevice(v, DEV))}</div></div><button class="ghost skip" ${does('click:endLive')} title="Stop this workout" aria-label="Stop this workout">${svgi('x', 16)}</button><button class="primary" ${does('click:openLive')}>Open</button></div>`;
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
/* × on the banner: stop the workout on every device without opening it, also one whose device is gone (issue 114) */
function endLive() {
  const v = CR;
  if (!v || !runActive(v)) return;
  const where = runDevice(v, DEV);
  ask({
    title: 'Stop this workout?',
    text: `<p>It’s ${v.p != null ? 'paused' : 'playing'} on <b>${esc(where)}</b>. Stopping it ends it on every device.</p>`,
    buttons: [
      { label: 'Stop everywhere', cls: 'danger', run: () => CR && CR.sid === v.sid && stopShared(CR) },
      { label: 'Cancel', cls: 'ghost' },
    ],
  });
}
export {
  endLive,
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
  resetDevice,
  removeProv,
  deleteAcct,
  askSwitch,
  keepNewAcct,
  syncCard,
  banner,
  openLive,
  ask,
  localDoc,
  fromOtherWindow,
};
