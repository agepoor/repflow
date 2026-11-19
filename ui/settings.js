/* Settings. */
import { PRESETS } from '../core/routine.js';
import { sndForm, vdShow } from './sound.js';
import { R, S, persist, setR } from './storage.js';
import { cloud, setSync, syncCard, syncState } from './sync.js';
import { renderList, renderParts, show } from './views.js';
function resetAll() {
  if (
    !confirm(
      'Delete ALL routines, including your own, and go back to the 5 default routines?\n\nTip: Export JSON first if you want a backup.',
    )
  )
    return;
  setR(PRESETS());
  persist();
  renderList();
}
function addPresets() {
  PRESETS().forEach((p) => {
    const i = R.findIndex((r) => r.name === p.name);
    setR(R.filter((r, k) => k === i || r.name !== p.name));
    const j = R.findIndex((r) => r.name === p.name);
    if (j >= 0) R[j] = p;
    else R.push(p);
  });
  persist();
  renderList();
}

function setOpt(k, v) {
  S[k] = v;
  persist();
} // a device setting from its checkbox
function openSettings() {
  setTimeout(vdShow);
  setForm.innerHTML = sndForm(
    S,
    'S',
    `
  <label class="chk"><input type="checkbox" ${S.vibrate ? 'checked' : ''} onchange="setOpt('vibrate',this.checked)"> Vibrate (Android)</label>
  <label class="chk"><input type="checkbox" ${S.wake ? 'checked' : ''} onchange="setOpt('wake',this.checked)"> Keep screen on</label>`,
  );
  renderParts();
  cloud();
  document.getElementById('syncCard').innerHTML = syncCard();
  setSync(syncState);
  show('set');
}
export { resetAll, addPresets, setOpt, openSettings };
