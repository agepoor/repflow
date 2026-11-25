/* Settings. */
import { does } from './actions.js';
import { details, issueUrl, mailtoUrl, reportText } from '../core/report.js';
import { PRESETS } from '../core/routine.js';
import { toast } from './html.js';
import { recentErrors } from './errors.js';
import { sndForm, vdShow, volCtl, volShow } from './sound.js';
import { R, S, persist, setR } from './storage.js';
import { cloud, resetDevice, setSync, syncCard, syncState } from './sync.js';
import { renderList, renderParts, show } from './views.js';
// Reset all: the whole device starts over, signed out first if signed in (ui/sync.js resetDevice)
const resetAll = () => resetDevice();
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
  devForm.innerHTML = `<div class="span-all"><label>Volume</label>${volCtl('inline')}</div>
  <div class="tg"><label class="chk"><input type="checkbox" ${S.vibrate ? 'checked' : ''} ${does('change:setOptChk', 'vibrate')}> Vibrate (Android)</label>
  <label class="chk"><input type="checkbox" ${S.wake ? 'checked' : ''} ${does('change:setOptChk', 'wake')}> Keep screen on</label></div>`;
  setForm.innerHTML = sndForm(S, 'S');
  volShow();
  renderParts();
  cloud();
  document.getElementById('syncCard').innerHTML = syncCard();
  setSync(syncState);
  show('set');
}
/* a problem report from what this device knows right now: no routines, history or account (core/report.js) */
const reportDetails = () =>
  details({
    version: appVersion.textContent.replace(/^Version /, ''),
    ua: navigator.userAgent,
    installed: matchMedia('(display-mode: standalone)').matches,
    screen: `${screen.width}×${screen.height}`,
    lang: navigator.language,
    errors: recentErrors(),
    now: Date.now(),
  });
/* fills in a report link as it's tapped (it then opens as usual), or the "What's in it" preview as it opens */
function fillReport(el, kind) {
  const d = reportDetails();
  if (kind === 'email') el.href = mailtoUrl(d);
  else if (kind === 'issue') el.href = issueUrl(d);
  else if (el.open) reportPreview.textContent = reportText(d);
}
/* for a device where the email link opens nothing (no email app set up): the report on the clipboard, or shown and
   selected so it can be copied by hand where the clipboard isn't allowed */
async function copyReport() {
  const text = reportText(reportDetails());
  try {
    await navigator.clipboard.writeText(text);
    toast('Report copied. Paste it in an email to hello@punchpace.app.');
  } catch (e) {
    reportInfo.open = true;
    reportPreview.textContent = text;
    getSelection().selectAllChildren(reportPreview);
    toast('Copy the selected report and send it to hello@punchpace.app.');
  }
}
export { resetAll, addPresets, setOpt, openSettings, fillReport, copyReport };
