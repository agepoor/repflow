/* Workout Pacer v2: account (Google / GitHub sign-in via Firebase Auth) and sync (Firebase Realtime Database).
   Paste the web-app config from the Firebase console (Project settings → Your apps) below. These values are public
   identifiers, not secrets: access is limited by database.rules.json (each account can only read/write users/<its uid>). */
import { newer } from './core/merge.js';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBcskek0bCUDnG8xDArFPbUxzpFQsMjdUs',
  // Sign-in runs on our own domain (Firebase Hosting serves /__/auth there), so the Google and GitHub screens show it
  authDomain: 'punchpace.app',
  databaseURL: 'https://workout-pacer-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'workout-pacer',
  storageBucket: 'workout-pacer.firebasestorage.app',
  messagingSenderId: '149446370348',
  appId: '1:149446370348:web:8d306c4ae95d3572e35d89',
};
// For local testing only, e.g. {auth: 'http://127.0.0.1:9099', db: ['127.0.0.1', 9000]} (Firebase Emulator Suite)
const EMULATOR = null;

const SDK = 'https://www.gstatic.com/firebasejs/13.0.0/firebase-';
let fa,
  fd,
  A,
  D,
  me = null,
  hooks = {},
  off = 0,
  subs = [],
  pending = null;
/* ready: settles once this account's stored data has been checked; nothing is uploaded before that.
   gone: the account is being (or was) deleted, so nothing may be written for it any more */
let ready = Promise.resolve(),
  settle = null,
  gone = false;

export const now = () => Date.now() + off;
const info = (u) => ({
  uid: u.uid,
  email: u.email || (u.providerData.find((p) => p.email) || {}).email || '',
  name: u.displayName || '',
  providers: u.providerData.map((p) => p.providerId),
  methods: u.providerData.map((p) => ({ id: p.providerId, label: p.email || p.displayName || '' })),
});
const PID = (p) => (p === 'github' ? 'github.com' : 'google.com');
const P = (p) => (p === 'github' ? fa.GithubAuthProvider : fa.GoogleAuthProvider);
const provider = (p) => {
  const x = new (P(p))();
  if (p === 'google') x.setCustomParameters({ prompt: 'select_account' });
  return x;
};

/* hooks: user(info|null), items(key → value, first?) changed items, legacy(json string|null) the old document of an account
   that hasn't moved yet, seen(uid) newest m this device has, run(object|null), conn(bool), offset(ms), error(err), gone() = account deleted elsewhere */
export async function start(h) {
  if (!FIREBASE_CONFIG) return false;
  hooks = h;
  const [app, auth, db] = await Promise.all(['app', 'auth', 'database'].map((m) => import(SDK + m + '.js')));
  fa = auth;
  fd = db;
  const ap = app.initializeApp(FIREBASE_CONFIG);
  A = auth.getAuth(ap);
  D = db.getDatabase(ap);
  if (EMULATOR) {
    auth.connectAuthEmulator(A, EMULATOR.auth, { disableWarnings: true });
    db.connectDatabaseEmulator(D, ...EMULATOR.db);
  }
  db.onValue(db.ref(D, '.info/serverTimeOffset'), (s) => {
    off = +s.val() || 0;
    hooks.offset && hooks.offset(off);
  });
  db.onValue(db.ref(D, '.info/connected'), (s) => hooks.conn && hooks.conn(!!s.val()));
  auth.onAuthStateChanged(A, (u) => {
    const same = me && u && me.uid === u.uid;
    me = u;
    if (same) {
      hooks.user(info(u));
      return;
    }
    stop();
    gone = false;
    hooks.user(u ? info(u) : null);
    if (u) watch(u);
  });
  return true;
}
const stop = () => {
  subs.forEach((f) => f());
  subs = [];
  if (settle) settle.no(Object.assign(new Error('signed out'), { code: 'signed-out' }));
  settle = null;
};
const gate = () => {
  ready = new Promise((res, no) => {
    settle = { res, no };
  });
  ready.catch(() => {});
};
const open = () => {
  if (settle) settle.res();
  settle = null;
};
/* The account's data is one item per routine and workout under users/<uid>/v2 (see core/merge.js), each with m: when it
   was written. A device asks only for items written since it last looked (minus a margin for clocks), so opening the app
   with nothing changed downloads almost nothing. v2/since marks an account as moved; before that, its data is the old
   single document at users/<uid>/doc, read once to move it. */
const MARGIN = 10 * 60 * 1000;
const PATH = { 'r/': 'routines', 'h/': 'history' };
// item ids become database keys, which can't contain . # $ [ ] /
const keyOf = (id) => id.replace(/[.#$[\]/%]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const pathOf = (k) => (PATH[k.slice(0, 2)] ? `v2/${PATH[k.slice(0, 2)]}/${keyOf(k.slice(2))}` : `v2/${k}`);
let moved = false; // this account's data is in v2
function watch(u) {
  const at = (k) => fd.ref(D, `users/${u.uid}/${k}`),
    fail = (e) => hooks.error && hooks.error(e),
    failed = (e) => {
      if (settle) settle.no(e);
      settle = null;
      fail(e);
    };
  let items = [];
  moved = false;
  gate();
  // nothing stored: a new account, or one just deleted on another device. Check the account before uploading anything
  const check = (then) =>
    fa.reload(u).then(
      () => me === u && then(),
      (e) => {
        if (me !== u) return;
        if (/user-not-found|user-disabled|user-token-expired/.test(e.code || '')) {
          gone = true;
          stop();
          hooks.gone && hooks.gone();
          fa.signOut(A);
        } else then();
      },
    );
  const listen = () => {
    const seen = Math.max(0, (hooks.seen ? hooks.seen(u.uid) : 0) - MARGIN);
    const parts = [
      ['r/', fd.query(at('v2/routines'), fd.orderByChild('m'), fd.startAt(seen))],
      ['h/', fd.query(at('v2/history'), fd.orderByChild('m'), fd.startAt(seen))],
      ['order', at('v2/order')],
      ['parts', at('v2/parts')],
    ];
    // the first answers of all parts go up together, so the account's changes are applied in one go; after that each change
    const first = {};
    let waiting = parts.length;
    parts.forEach(([k, q]) =>
      items.push(
        fd.onValue(
          q,
          (s) => {
            const out = {};
            if (k.endsWith('/')) s.forEach((c) => void (out[k + decodeURIComponent(c.key)] = c.val()));
            else if (s.val() !== null) out[k] = s.val();
            if (!waiting) return hooks.items(out, false);
            if (!(k in first)) waiting--;
            first[k] = out;
            if (!waiting) hooks.items(Object.assign({}, ...Object.values(first)), true);
          },
          fail,
        ),
      ),
    );
  };
  subs.push(
    fd.onValue(
      at('v2/since'),
      (s) => {
        if (s.val() !== null) {
          moved = true;
          if (items.length) return;
          open();
          listen();
          return;
        }
        if (items.length) {
          // the data was there and is gone: deleted on another device
          moved = false;
          items.forEach((f) => f());
          items = [];
          gate();
          check(open);
          return;
        }
        // not moved yet: read the old document once (null for a new account)
        check(() =>
          fd.get(at('doc')).then((d) => {
            if (me !== u) return;
            open();
            hooks.legacy(d.val());
          }, failed),
        );
      },
      failed,
    ),
  );
  subs.push(() => items.forEach((f) => f()));
  subs.push(fd.onValue(at('run'), (s) => hooks.run(s.val()), fail));
}

/* Called straight from a click so the browser allows the pop-up. If the email already has an account with the other
   provider, the new provider is remembered and linked after signing in with that one. */
export function signIn(p) {
  return fa.signInWithPopup(A, provider(p)).then(
    async (r) => {
      if (pending) {
        const c = pending;
        pending = null;
        try {
          await fa.linkWithCredential(r.user, c);
        } catch (e) {
          hooks.error && hooks.error(e);
        }
        hooks.user(info(r.user));
      }
      return info(r.user);
    },
    (e) => {
      if (e.code === 'auth/account-exists-with-different-credential') {
        pending = P(p).credentialFromError(e);
        throw Object.assign(new Error('exists'), {
          code: 'exists',
          email: (e.customData || {}).email || '',
          other: p === 'github' ? 'google' : 'github',
        });
      }
      throw e;
    },
  );
}
export const link = (p) =>
  fa.linkWithPopup(me, provider(p)).then((r) => {
    hooks.user(info(r.user));
    return info(r.user);
  });
/* Removes a sign-in method from the account (the app only offers this while another one is linked) */
export const unlink = (p) =>
  fa.unlink(me, PID(p)).then((u) => {
    hooks.user(info(u));
    return info(u);
  });

/* Deletes the account and everything stored for it. Firebase wants a fresh sign-in first, so call this straight from a
   click (pop-up). Listening stops before the data is removed, so this device doesn't upload its copy again; other
   devices find the data gone, check the account and sign out (see watch). */
export function deleteAccount(p) {
  const u = me;
  return fa.reauthenticateWithPopup(u, provider(p)).then(async () => {
    gone = true;
    stop();
    try {
      await fd.remove(fd.ref(D, `users/${u.uid}`));
    } catch (e) {
      gone = false;
      watch(u);
      throw e;
    }
    try {
      await fa.deleteUser(u);
    } catch (e) {
      await fa.signOut(A).catch(() => {});
      throw Object.assign(e, { dataGone: true });
    }
  });
}
export const signOut = () => {
  pending = null;
  return fa.signOut(A);
};

/* Writes items (key → value, see core/merge.js). Each item keeps the account's version if that is newer (newer()), so
   saving one routine sends and receives only that routine. Resolves with what the account now stores for each key.
   The first write to an account that hasn't moved yet stores everything at once and marks it moved. */
export const put = (list) =>
  ready.then(async () => {
    if (gone || !me) throw Object.assign(new Error('signed out'), { code: 'signed-out' });
    const u = me,
      at = (k) => fd.ref(D, `users/${u.uid}` + (k ? '/' + k : '')),
      t = now(),
      out = {};
    list = JSON.parse(JSON.stringify(list)); // Firebase refuses undefined values
    if (!moved) {
      const all = {};
      Object.entries(list).forEach(([k, v]) => {
        all[pathOf(k)] = { ...v, m: t };
        out[k] = all[pathOf(k)];
      });
      all['v2/since'] = t;
      await fd.update(at(''), all);
      moved = true;
      return out;
    }
    await Promise.all(
      Object.entries(list).map(([k, v]) =>
        fd
          .runTransaction(at(pathOf(k)), (cur) => (newer(k, cur, v) ? { ...v, m: now() } : undefined), {
            applyLocally: false,
          })
          .then((r) => (out[k] = r.snapshot.val())),
      ),
    );
    return out;
  });
/* The running workout: a single small node per account; the last write wins */
export const setRun = (v) => {
  if (!me || gone) return Promise.resolve();
  const u = me,
    val = JSON.parse(JSON.stringify(v));
  // after a tick, so a removal that arrived together with this change is seen first
  return new Promise((r) => setTimeout(r, 0))
    .then(() => ready)
    .then(() => (me === u && !gone ? fd.set(fd.ref(D, `users/${u.uid}/run`), val) : null));
};
