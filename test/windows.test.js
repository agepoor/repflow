import { describe, expect, it } from 'vitest';
import { WIPE_KEY, storageChange } from '../core/windows.js';

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
