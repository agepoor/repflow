/* What a change to this device's storage, made by another window of the app (a browser tab or the installed app),
   means for this window. Each window keeps the data in memory and saves it whole, so one that holds an old copy
   would write deleted routines back or upload them to the next account that signs in. No DOM: runs in Node. */

/* written when this device's data is cleared (Delete account with its box ticked, Sign out and clear, switching to
   another account's data only), so the other windows start over from what's stored now */
const WIPE_KEY = 'rf2_wipe';
const DATA_KEYS = ['rf2_routines', 'rf2_set', 'rf2_meta', 'rf2_hist', 'rf2_hdel'];
const SYNC_KEYS = ['rf2_sync', 'rf2_synced'];

/* 'wipe': start over (reload); 'data': read routines, settings and history again; 'sync': read what's known to be
   synced again; null: nothing this window keeps in memory. key is null when another window cleared all storage */
function storageChange(key) {
  if (key === null || key === WIPE_KEY) return 'wipe';
  if (DATA_KEYS.includes(key)) return 'data';
  if (SYNC_KEYS.includes(key)) return 'sync';
  return null;
}

export { WIPE_KEY, storageChange };
