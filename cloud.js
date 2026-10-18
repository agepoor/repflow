/* Workout Pacer v2: account (Google / GitHub sign-in via Firebase Auth) and sync (Firebase Realtime Database).
   Paste the web-app config from the Firebase console (Project settings → Your apps) below. These values are public
   identifiers, not secrets: access is limited by database.rules.json (each account can only read/write users/<its uid>). */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBcskek0bCUDnG8xDArFPbUxzpFQsMjdUs',
  authDomain: 'workout-pacer.firebaseapp.com',
  databaseURL: 'https://workout-pacer-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'workout-pacer',
  storageBucket: 'workout-pacer.firebasestorage.app',
  messagingSenderId: '149446370348',
  appId: '1:149446370348:web:8d306c4ae95d3572e35d89'
};
// For local testing only, e.g. {auth: 'http://127.0.0.1:9099', db: ['127.0.0.1', 9000]} (Firebase Emulator Suite)
const EMULATOR = null;

const SDK = 'https://www.gstatic.com/firebasejs/13.0.0/firebase-';
let fa, fd, A, D, me = null, hooks = {}, off = 0, subs = [], pending = null;
/* ready: settles once this account's stored data has been checked; nothing is uploaded before that.
   gone: the account is being (or was) deleted, so nothing may be written for it any more */
let ready = Promise.resolve(), settle = null, gone = false;

export const now = () => Date.now() + off;
const info = u => ({uid: u.uid, email: u.email || (u.providerData.find(p => p.email) || {}).email || '', name: u.displayName || '',
  providers: u.providerData.map(p => p.providerId),
  methods: u.providerData.map(p => ({id: p.providerId, label: p.email || p.displayName || ''}))});
const PID = p => p === 'github' ? 'github.com' : 'google.com';
const P = p => p === 'github' ? fa.GithubAuthProvider : fa.GoogleAuthProvider;
const provider = p => { const x = new (P(p))(); if (p === 'google') x.setCustomParameters({prompt: 'select_account'}); return x; };

/* hooks: user(info|null), doc(json string|null), run(object|null), conn(bool), offset(ms), error(err), gone() = account deleted elsewhere */
export async function start(h) {
  if (!FIREBASE_CONFIG) return false;
  hooks = h;
  const [app, auth, db] = await Promise.all(['app', 'auth', 'database'].map(m => import(SDK + m + '.js')));
  fa = auth; fd = db;
  const ap = app.initializeApp(FIREBASE_CONFIG);
  A = auth.getAuth(ap);
  D = db.getDatabase(ap);
  if (EMULATOR) { auth.connectAuthEmulator(A, EMULATOR.auth, {disableWarnings: true}); db.connectDatabaseEmulator(D, ...EMULATOR.db); }
  db.onValue(db.ref(D, '.info/serverTimeOffset'), s => { off = +s.val() || 0; hooks.offset && hooks.offset(off); });
  db.onValue(db.ref(D, '.info/connected'), s => hooks.conn && hooks.conn(!!s.val()));
  auth.onAuthStateChanged(A, u => {
    const same = me && u && me.uid === u.uid;
    me = u;
    if (same) { hooks.user(info(u)); return; }
    stop(); gone = false;
    hooks.user(u ? info(u) : null);
    if (u) watch(u);
  });
  return true;
}
const stop = () => { subs.forEach(f => f()); subs = []; if (settle) settle.no(Object.assign(new Error('signed out'), {code: 'signed-out'})); settle = null; };
const gate = () => { ready = new Promise((res, no) => { settle = {res, no}; }); ready.catch(() => {}); };
const open = () => { if (settle) settle.res(); settle = null; };
function watch(u) {
  const at = k => fd.ref(D, `users/${u.uid}/${k}`), fail = e => hooks.error && hooks.error(e);
  gate();
  subs.push(fd.onValue(at('doc'), s => {
    const v = s.val();
    if (v !== null) { open(); hooks.doc(v); return; }
    // nothing stored: a new account, or one just deleted on another device. Check the account before uploading anything
    gate();
    fa.reload(u).then(() => { if (me !== u) return; open(); hooks.doc(null); }, e => {
      if (me !== u) return;
      if (/user-not-found|user-disabled|user-token-expired/.test(e.code || '')) { gone = true; stop(); hooks.gone && hooks.gone(); fa.signOut(A); }
      else { open(); hooks.doc(null); }
    });
  }, e => { if (settle) settle.no(e); settle = null; fail(e); }));
  subs.push(fd.onValue(at('run'), s => hooks.run(s.val()), fail));
}

/* Called straight from a click so the browser allows the pop-up. If the email already has an account with the other
   provider, the new provider is remembered and linked after signing in with that one. */
export function signIn(p) {
  return fa.signInWithPopup(A, provider(p)).then(async r => {
    if (pending) { const c = pending; pending = null; try { await fa.linkWithCredential(r.user, c); } catch (e) { hooks.error && hooks.error(e); } hooks.user(info(r.user)); }
    return info(r.user);
  }, e => {
    if (e.code === 'auth/account-exists-with-different-credential') {
      pending = P(p).credentialFromError(e);
      throw Object.assign(new Error('exists'), {code: 'exists', email: (e.customData || {}).email || '', other: p === 'github' ? 'google' : 'github'});
    }
    throw e;
  });
}
export const link = p => fa.linkWithPopup(me, provider(p)).then(r => { hooks.user(info(r.user)); return info(r.user); });
/* Removes a sign-in method from the account (the app only offers this while another one is linked) */
export const unlink = p => fa.unlink(me, PID(p)).then(u => { hooks.user(info(u)); return info(u); });

/* Deletes the account and everything stored for it. Firebase wants a fresh sign-in first, so call this straight from a
   click (pop-up). Listening stops before the data is removed, so this device doesn't upload its copy again; other
   devices find the data gone, check the account and sign out (see watch). */
export function deleteAccount(p) {
  const u = me;
  return fa.reauthenticateWithPopup(u, provider(p)).then(async () => {
    gone = true; stop();
    try { await fd.remove(fd.ref(D, `users/${u.uid}`)); }
    catch (e) { gone = false; watch(u); throw e; }
    try { await fa.deleteUser(u); }
    catch (e) { await fa.signOut(A).catch(() => {}); throw Object.assign(e, {dataGone: true}); }
  });
}
export const signOut = () => { pending = null; return fa.signOut(A); };

/* Data: one JSON document per account, merged on every device (fn gets the stored string, returns a new one or undefined) */
export const update = fn => ready.then(() => {
  if (gone || !me) throw Object.assign(new Error('signed out'), {code: 'signed-out'});
  return fd.runTransaction(fd.ref(D, `users/${me.uid}/doc`), fn, {applyLocally: false});
});
/* The running workout: a single small node per account; the last write wins */
export const setRun = v => {
  if (!me || gone) return Promise.resolve();
  const u = me, val = JSON.parse(JSON.stringify(v));
  // after a tick, so a removal that arrived together with this change is seen first
  return new Promise(r => setTimeout(r, 0)).then(() => ready).then(() => me === u && !gone ? fd.set(fd.ref(D, `users/${u.uid}/run`), val) : null);
};
