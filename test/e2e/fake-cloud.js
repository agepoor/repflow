/* Stand-in for cloud.js in the browser tests, so they can sync without Firebase: signed in to a test account that
   stores nothing, with the running workout (users/<uid>/run) kept by the test and shared by every browser context, each
   one a device (test/e2e/devices.test.js). The test serves this file in place of cloud.js and adds ppGetRun, ppSetRun. */
let hooks = null;
export const now = () => Date.now();
export async function start(h) {
  hooks = h;
  window.ppRun = (v) => hooks.run(v); // the shared run changed (on this or another device)
  setTimeout(async () => {
    const email = 'test@example.com';
    h.user({ uid: 'test', email, name: '', providers: ['google.com'], methods: [{ id: 'google.com', label: email }] });
    h.conn(true);
    h.items({}, true);
    h.run(await window.ppGetRun());
  });
  return true;
}
export const put = async (list) => list;
export const setRun = (v) => window.ppSetRun(v);
export const signOut = async () => hooks.user(null);
