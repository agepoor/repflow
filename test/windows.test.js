import { describe, expect, it } from 'vitest';
import { WIPE_KEY, appKeys, storageChange } from '../core/windows.js';

describe('storageChange: what another window changed', () => {
  it('a wipe, or all storage cleared, means start over', () => {
    expect(storageChange(WIPE_KEY)).toBe('wipe');
    expect(storageChange(null)).toBe('wipe');
  });
  it.each(['rf2_routines', 'rf2_set', 'rf2_meta', 'rf2_hist', 'rf2_hdel'])('%s is data to read again', (k) =>
    expect(storageChange(k)).toBe('data'),
  );
  it.each(['rf2_sync', 'rf2_synced'])('%s is sync state to read again', (k) => expect(storageChange(k)).toBe('sync'));
  it.each(['rf2_run', 'rf2_dev', 'rf2_uid', 'rf2_acct', 'rf2_wkm', 'rf2_vfit', 'rf_routines', 'other'])(
    '%s is nothing this window keeps',
    (k) => expect(storageChange(k)).toBeNull(),
  );
});

describe('appKeys: what Reset all removes', () => {
  it('keeps the rf2_ and old rf_ keys, nothing else', () =>
    expect(
      appKeys([
        'rf2_routines',
        'rf2_vfit',
        'rf2_uid',
        'rf_routines',
        'rf_gist',
        'rf',
        'rf2',
        'other',
        'firebase:x',
        'RF2_set',
      ]),
    ).toEqual(['rf2_routines', 'rf2_vfit', 'rf2_uid', 'rf_routines', 'rf_gist']));
  it('skips missing keys', () => expect(appKeys([null, undefined, 'rf2_set'])).toEqual(['rf2_set']));
});
