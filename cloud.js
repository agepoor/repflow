/* Workout Pacer v2: account (Google / GitHub sign-in via Firebase Auth) and sync (Firebase Realtime Database).
   Paste the web-app config from the Firebase console (Project settings → Your apps) below. These values are public
   identifiers, not secrets: access is limited by database.rules.json (each account can only read/write users/<its uid>). */
export const FIREBASE_CONFIG = null;
// For local testing only, e.g. {auth: 'http://127.0.0.1:9099', db: ['127.0.0.1', 9000]} (Firebase Emulator Suite)
const EMULATOR = null;

const SDK = 'https://www.gstatic.com/firebasejs/13.0.0/firebase-';
let fa, fd, A, D, me = null, hooks = {}, off = 0, subs = [], pending = null;

export const now = () => Date.now() + off;
const info = u => ({uid: u.uid, email: u.email || (u.providerData.find(p => p.email) || {}).email || '', name: u.displayName || '',
  providers: u.providerData.map(p => p.providerId)});
const P = p => p === 'github' ? fa.GithubAuthProvider : fa.GoogleAuthProvider;
const provider = p => { const x = new (P(p))(); if (p === 'google') x.setCustomParameters({prompt: 'select_account'}); return x; };

/* hooks: user(info|null), doc(json string|null), run(object|null), conn(bool), offset(ms), error(err) */
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
    subs.forEach(f => f()); subs = [];
    hooks.user(u ? info(u) : null);
    if (!u) return;
    const at = k => db.ref(D, `users/${u.uid}/${k}`), fail = e => hooks.error && hooks.error(e);
    subs.push(db.onValue(at('doc'), s => hooks.doc(s.val()), fail));
    subs.push(db.onValue(at('run'), s => hooks.run(s.val()), fail));
  });
  return true;
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
export const signOut = () => { pending = null; return fa.signOut(A); };

/* Data: one JSON document per account, merged on every device (fn gets the stored string, returns a new one or undefined) */
export const update = fn => fd.runTransaction(fd.ref(D, `users/${me.uid}/doc`), fn, {applyLocally: false});
/* The running workout: a single small node per account; the last write wins */
export const setRun = v => me ? fd.set(fd.ref(D, `users/${me.uid}/run`), JSON.parse(JSON.stringify(v))) : Promise.resolve();
