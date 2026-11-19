/* The routine editor. */
import {
  ROUTINE_ICONS,
  bDur,
  holdMode,
  iconKey,
  inRound,
  logMode,
  mig,
  norm,
  seqSteps,
  sndCopy,
  uid,
} from '../core/routine.js';
import { DN, DOW, PARTS, WHEN, partOf, rDays } from '../core/schedule.js';
import { TONES, build, callTxt, mkey, moves, movesOf, spoken, toneMap } from '../core/steps.js';
import { durStepSize, durWords, fmt, fmtDur, mmss, parseDur } from '../core/time.js';
import { rk, vSlow } from '../core/voice.js';
import { openWeek } from './history.js';
import { COLORS, esc, info, svgi } from './html.js';
import { boxRate, startRun } from './runner.js';
import {
  SAYB,
  SV,
  ac,
  beep,
  comboTones,
  countPlan,
  fitRate,
  muted,
  say,
  silentHere,
  sndForm,
  sndOf,
  vAt,
  vEd,
  vKey,
  voiceSec,
  withSnd,
} from './sound.js';
import { R, persist, setR } from './storage.js';
import { ROUTING, partTxt, partsOn, renderList, show } from './views.js';
/* editor autosave: every change is written to the library shortly after you stop typing (and right away when the app is hidden) */
let autoT = null;
const editOn = () => document.getElementById('edit').classList.contains('on');
function queueAutosave() {
  if (!cur || !editOn()) return;
  clearTimeout(autoT);
  autoT = setTimeout(autosave, 600);
}
function autosave() {
  clearTimeout(autoT);
  autoT = null;
  if (!cur || !editOn()) return;
  readHead();
  const c = JSON.parse(JSON.stringify(cur));
  delete c._new;
  putR(c);
  persist();
  cur.upd = c.upd;
}
/* the editor copy replaces the library routine but keeps its newest change time, so a sync can't bring back the older version */
function putR(x) {
  const i = R.findIndex((r) => r.id === x.id);
  if (i >= 0) {
    x.upd = Math.max(x.upd || 0, R[i].upd || 0);
    R[i] = x;
  } else R.push(x);
}
function durHint(el, txt, bad) {
  const h = (el.closest('.durw') || el).parentNode.querySelector('.dh');
  if (h) {
    h.textContent = txt;
    h.classList.toggle('bad', !!bad);
  }
  el.classList.toggle('bad', !!bad);
}
function durSet(el, s) {
  el.dataset.v = Math.max(0, Math.round(+s || 0));
  el.value = fmtDur(el.dataset.v);
  durHint(el, '');
}
function durIn(el, set) {
  const min = +el.dataset.min || 0;
  let s = parseDur(el.value);
  if (s === null && min === 0) s = 0;
  if (s === null || isNaN(s) || s < min) {
    durHint(el, s === null || isNaN(s) ? '· try 1:30' : `· min ${durWords(min)}`, true);
    return;
  }
  el.dataset.v = s;
  durHint(el, '· ' + durWords(s));
  if (set) set(s);
}
function durOut(el) {
  durSet(el, el.dataset.v);
}
function durStep(btn) {
  const el = btn.parentNode.querySelector('input');
  const min = +el.dataset.min || 0;
  let s = parseDur(el.value);
  if (s === null || isNaN(s)) s = +el.dataset.v || 0;
  const d = +btn.dataset.d;
  let n;
  if (d > 0) {
    const st = durStepSize(s);
    n = Math.floor(s / st) * st + st;
  } else {
    const st = durStepSize(Math.max(0, s - 1));
    n = Math.ceil(s / st) * st - st;
  }
  n = Math.max(min, n);
  el.value = String(n);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  durSet(el, el.dataset.v);
  try {
    navigator.vibrate && navigator.vibrate(8);
  } catch (e) {}
}
function dur(id, k, v, lbl, min = 0) {
  v = Math.max(min, Math.round(+v || 0));
  return `<div><label>${lbl} <span class="dh"></span></label><div class="durw"><input class="dur" inputmode="decimal" autocomplete="off" placeholder="0:00" data-min="${min}" data-v="${v}" value="${fmtDur(v)}" oninput="durIn(this,s=>setB('${id}','${k}',s))" onblur="durOut(this)"><button type="button" class="ds" tabindex="-1" data-d="-1" aria-label="Less">−</button><button type="button" class="ds" tabindex="-1" data-d="1" aria-label="More">+</button></div></div>`;
}
function toggleArchiveCur() {
  readHead();
  if (cur.archived) delete cur.archived;
  else cur.archived = true;
  saveRoutine(false);
}

let cur = null;
const BT = {
  reps: [svgi('hash', 18), 'Reps / counts', 'orange'],
  timed: [svgi('timer', 18), 'Timed', 'red'],
  seq: [svgi('steps', 18), 'Sequence', 'purple'],
  boxing: [svgi('glove', 18), 'Boxing combos', 'blue'],
  rest: [svgi('moon', 18), 'Rest', 'green'],
};
let EDBACK = 'lib'; // where the editor's Back goes: home, or the week it was opened from
function newRoutine() {
  EDBACK = 'lib';
  cur = {
    id: uid(),
    name: 'New routine',
    icon: 'activity',
    color: 'orange',
    rounds: 1,
    rest: 60,
    prep: 10,
    notes: '',
    blocks: [],
    _new: true,
  };
  fillEditor();
  show('edit');
}
function openEditor(id, from) {
  EDBACK = from || 'lib';
  cur = JSON.parse(JSON.stringify(R.find((r) => r.id === id)));
  fillEditor();
  show('edit');
}
function renderSwatches() {
  eColorPick.innerHTML = Object.entries(COLORS)
    .map(
      ([n, c]) =>
        `<button role="radio" aria-checked="${n === eColor.value}" aria-label="${n}" title="${n}" class="${n === eColor.value ? 'on' : ''}" style="--c:${c}" onclick="pickColor('${n}')">${n === eColor.value ? svgi('check', 16, 3) : ''}</button>`,
    )
    .join('');
}
function pickColor(n) {
  eColor.value = n;
  cur.color = n;
  renderSwatches();
  renderIconPick();
  renderDays();
}
function renderDays() {
  const d = rDays(cur);
  eDays.style.setProperty('--c', COLORS[cur.color] || COLORS.orange);
  eDays.innerHTML = DOW.map(
    (x) =>
      `<button type="button" class="${d.includes(x) ? 'on' : ''}" aria-pressed="${d.includes(x)}" title="${DN[x]}" onclick="toggleDay(${x})">${DN[x][0]}</button>`,
  ).join('');
  eDaysHint.textContent = d.length
    ? '· in Today on ' + (d.length === 7 ? 'every day' : d.length === 1 ? DN[d[0]] : d.length + ' days')
    : '· none = anytime';
  renderWhen();
}
function renderWhen() {
  const w = partOf(cur);
  eWhen.parentNode.hidden = !partsOn();
  eWhen.style.setProperty('--c', COLORS[cur.color] || COLORS.orange);
  eWhen.innerHTML = ['', ...PARTS]
    .map(
      (x) =>
        `<button type="button" class="${w === x ? 'on' : ''}" aria-pressed="${w === x}" title="${x ? WHEN[x] + ' · ' + partTxt(x) : 'Anytime · no fixed moment'}" onclick="setWhen('${x}')">${x ? WHEN[x] : 'Anytime'}</button>`,
    )
    .join('');
  eWhenHint.textContent = w ? '· ' + partTxt(w) : '· no fixed moment';
}
function setWhen(x) {
  if (x && partOf(cur) !== x) cur.when = x;
  else delete cur.when;
  renderWhen();
  queueAutosave();
}
function toggleDay(x) {
  const d = rDays(cur);
  const n = d.includes(x) ? d.filter((y) => y !== x) : [...d, x];
  if (n.length) cur.days = DOW.filter((y) => n.includes(y));
  else delete cur.days;
  renderDays();
  queueAutosave();
}
function renderIconPick() {
  queueAutosave();
  const k = iconKey(cur),
    c = COLORS[cur.color] || COLORS.orange;
  eIconBtn.innerHTML = svgi(k, 24);
  eIconBtn.style.color = c;
  iconGrid.innerHTML = ROUTINE_ICONS.map(
    (n) =>
      `<button class="${n === k ? 'on' : ''}" style="${n === k ? `color:${c};border-color:${c}` : ''}" onclick="pickIcon('${n}')">${svgi(n, 22)}</button>`,
  ).join('');
}
function pickIcon(n) {
  cur.icon = n;
  iconGrid.hidden = true;
  renderIconPick();
}
function fillEditor() {
  cur = norm(mig(cur));
  renderIconPick();
  eName.value = cur.name;
  eRounds.value = cur.rounds;
  durSet(eRest, cur.rest);
  durSet(ePrep, cur.prep);
  eNotes.value = cur.notes || '';
  archBtn.innerHTML =
    svgi(cur.archived ? 'unarchive' : 'archive', 18) +
    `<span class="lbl">${cur.archived ? 'Unarchive' : 'Archive'}</span>`;
  archBtn.title = cur.archived ? 'Unarchive' : 'Archive';
  archBtn.style.display = cur._new ? 'none' : '';
  eSec.value = cur.sec || 1;
  eLog.value = logMode(cur);
  eHold.value = holdMode(cur);
  eColor.value = cur.color in COLORS ? cur.color : 'orange';
  renderSwatches();
  renderDays();
  if (cur.lang) {
    cur.snd = sndCopy(sndOf(cur));
    delete cur.lang;
  }
  renderSnd(); // an older routine's voice language: its own sound & voice
  renderBlocks();
}
function num(id, k, v, lbl, step = 1, min = 0) {
  return `<div><label>${lbl}</label><input type="number" step="${step}" min="${min}" value="${v}" oninput="setB('${id}','${k}',+this.value)"></div>`;
}
function renderBlocks() {
  blocks.innerHTML = cur.blocks
    .map((b, i) => {
      const [ic, , col] = BT[b.type];
      let f = '';
      if (b.type === 'reps')
        f = `<div class="grid">${num(b.id, 'reps', b.reps, 'Reps')}${num(b.id, 'counts', b.counts, 'Counts per rep', 1, 1)}
     <div><label>Mode</label><select onchange="setB('${b.id}','mode',this.value)"><option value="guided" ${b.mode === 'guided' ? 'selected' : ''}>Guided tempo</option><option value="tap" ${b.mode === 'tap' ? 'selected' : ''}>Tap to count</option></select></div>
     <div><label>Count length (s)</label><input type="number" step="0.05" min="0.05" value="${b.tempo > 0 ? b.tempo : ''}" data-rsec placeholder="Routine (${cur.sec || 1} s)" oninput="setB('${b.id}','tempo',+this.value||0)"></div>${num(b.id, 'repPause', b.repPause, 'Breather (s)', 0.5)}${dur(b.id, 'restAfter', b.restAfter, 'Rest after block')}</div>
     <div class="grid" style="margin-top:12px"><div><label>Display</label><select onchange="setB('${b.id}','display',this.value)">${[
       ['both', 'Cue + number'],
       ['cue', 'Cue only'],
       ['number', 'Number only'],
     ]
       .map(([v, l]) => `<option value="${v}" ${(b.display || 'both') === v ? 'selected' : ''}>${l}</option>`)
       .join('')}</select></div></div>
     <label style="margin-top:12px">Count cues (optional, comma-separated — spoken/shown instead of numbers)</label><input value="${esc(b.cues)}" placeholder="down, plank, push, up, jump…" oninput="setB('${b.id}','cues',this.value)"><div class="cuecount" id="cc_${b.id}">${cueInfo(b)}</div><div id="vf-${b.id}">${vfNote(b)}</div>`;
      if (b.type === 'timed')
        f = `<div class="grid">${dur(b.id, 'work', b.work, 'Work', 1)}${dur(b.id, 'restAfter', b.restAfter, 'Rest after block')}</div>
     <label style="margin-top:12px">Spoken cue at start</label><input value="${esc(b.cue)}" oninput="setB('${b.id}','cue',this.value)">`;
      if (b.type === 'boxing')
        f = `<div class="grid">${dur(b.id, 'work', b.work, 'Duration', 1)}<div><label>Count length (s)</label><input type="number" step="0.05" min="0.05" value="${b.tempo > 0 ? b.tempo : ''}" data-rsec placeholder="Routine (${cur.sec || 1} s)" oninput="setB('${b.id}','tempo',+this.value||0);pvUpd('${b.id}')"></div>${num(b.id, 'minGap', b.minGap, 'Extra s (min)', 0.5, 0)}${num(b.id, 'maxGap', b.maxGap, 'Extra s (max)', 0.5, 0)}<div><label>Order</label><select onchange="setB('${b.id}','order',this.value)">${[
          ['random', 'Random'],
          ['shuffle', 'Shuffle (each once)'],
          ['sequence', 'In order'],
        ]
          .map(([v, l]) => `<option value="${v}" ${(b.order || 'random') === v ? 'selected' : ''}>${l}</option>`)
          .join(
            '',
          )}</select></div>${num(b.id, 'repeat', b.repeat || 1, 'Repeat each call ×', 1, 1)}${num(b.id, 'poolPause', b.poolPause || 0, 'Pause after full pool (s)', 0.5)}${dur(b.id, 'restAfter', b.restAfter, 'Rest after block')}</div>
     <label style="margin-top:12px">Combo pool — one per line</label><textarea rows="5" oninput="setB('${b.id}','combos',this.value);pvUpd('${b.id}')">${esc(b.combos)}</textarea><div id="vf-${b.id}">${vfNote(b)}</div>
     <div class="grid" style="margin-top:12px"><div style="grid-column:1/-1"><label for="vs-${b.id}">Calls</label><select id="vs-${b.id}" style="width:auto;max-width:100%;align-self:flex-start" onchange="setB('${b.id}','vfit',this.value)">${[
       ['wait', 'Voice'],
       ['pace', 'Voice, tones when too fast'],
       ['tones', 'Tones only'],
     ]
       .map(
         ([v, l]) =>
           `<option value="${v}" ${(b.vfit === 'pace' || b.vfit === 'tones' ? b.vfit : 'wait') === v ? 'selected' : ''}>${l}</option>`,
       )
       .join('')}</select></div></div>
     ${info(b.id + '-pv', 'Show moves per combo', `<div id="pv-${b.id}">${poolPreview(b.id)}</div>`)}
     ${info(b.id + '-how', 'How timing works', `<p><b style="color:var(--tx)">Moves:</b> each line is split at spaces, dashes (-) and commas. Join words with _ to count them as one move (e.g. <code>Roll_Step</code>, spoken as "Roll Step").</p><p><b style="color:var(--tx)">Time per call</b> = moves × count length + a random extra between min and max. When the voice needs longer to say a combo (this device learns how long it takes), a note under the combo pool shows it.</p><p><b style="color:var(--tx)">Calls:</b> <b style="color:var(--tx)">Voice</b> says every call in full (when it's too slow, calls wait for it). <b style="color:var(--tx)">Voice, tones when too fast</b> keeps calls on time: said faster (up to 1.5×), or played as tones when even that doesn't fit. <b style="color:var(--tx)">Tones only</b>: exact timing, and on Android they keep playing with the screen off.</p><p><b style="color:var(--tx)">Tones:</b> one per move, in rhythm at the count length, the same in every routine. Jab (1) and cross (2) steady, hooks (3, 4) fall, uppercuts (5, 6) rise; lead hand low, rear hand high. Slip, duck and roll: a soft whoosh. Other moves get the next free tone (up to 8 different sounds per routine), then a tick. They are calls, so they play with Beeps off too. ▶ under <i>Show moves per combo</i> plays a combo.</p><p><b style="color:var(--tx)">Pause after full pool:</b> extra break once every combo has been called at least once (in Random order that can take more calls than the pool size).</p><p style="margin:0"><b style="color:var(--tx)">Rest after block:</b> starts after the full Duration.</p>`)}`;
      if (b.type === 'seq')
        f = `<div class="grid"><div><label>Time per step (s)</label><input type="number" step="0.5" min="0.1" value="${+b.work > 0 ? b.work : ''}" placeholder="3" oninput="setB('${b.id}','work',+this.value||0)"></div>${dur(b.id, 'restAfter', b.restAfter, 'Rest after block')}</div>
     <label style="margin-top:12px">Steps — one per line</label><textarea rows="6" placeholder="Ready @tap&#10;Step one&#10;Hold @10" oninput="setB('${b.id}','steps',this.value)">${esc(b.steps)}</textarea><div class="cuecount" id="sq-${b.id}">${seqInfo(b)}</div><div id="vf-${b.id}">${vfNote(b)}</div>
     ${info(b.id + '-how', 'How it works', `<p><b style="color:var(--tx)">Steps</b> run once, top to bottom; each is spoken and shown as you type it. The block lasts as long as its steps together.</p><p><b style="color:var(--tx)">Own time:</b> end a line with <code>@6</code> (6 s), <code>@1.5</code> (1.5 s), <code>@1:30</code> (1 min 30 s) or <code>@tap</code> (waits for a tap). Other lines get the Time per step. A line with only a time (<code>@2</code>) is a silent pause.</p><p><b style="color:var(--tx)">Beeps:</b> one at the start of each step; countdown beeps only on steps of 10 s or longer.</p><p style="margin:0"><b style="color:var(--tx)">Rest after block:</b> starts after the last step.</p>`)}`;
      if (b.type === 'rest') f = `<div class="grid">${dur(b.id, 'work', b.work, 'Rest', 1)}</div>`;
      return `<div class="card block" style="border-left-color:${COLORS[col]}"><div class="head"><span style="color:${COLORS[col]};display:flex">${ic}</span>
    <input value="${esc(b.name)}" oninput="setB('${b.id}','name',this.value)">
    <button class="icon ghost" onclick="mv(${i},-1)" title="Move up">${svgi('up', 18)}</button><button class="icon ghost" onclick="mv(${i},1)" title="Move down">${svgi('down', 18)}</button>
    <button class="icon ghost" onclick="dup(${i})" title="Duplicate">${svgi('copy', 17)}</button><button class="icon ghost danger" onclick="rm(${i})" title="Remove">${svgi('x', 18)}</button></div>
    ${f}<div class="grid" style="margin-top:12px"><div style="grid-column:1/-1"><label>Runs in</label><select style="width:auto;max-width:100%;align-self:flex-start" onchange="setRun('${b.id}',this.value)">${[
      ['all', 'Every round'],
      ['first', 'First round only (warm-up)'],
      ['last', 'Last round only (finisher)'],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${(b.firstOnly ? 'first' : b.lastOnly ? 'last' : 'all') === v ? 'selected' : ''}>${l}</option>`,
      )
      .join('')}</select></div></div></div>`;
    })
    .join('');
  summary();
}
/* editor: the voice can't keep up with this block (estimated for this device's voice): what happens instead; for combos, as chosen under Calls */
function repsVoice(b) {
  if (!vEd() || b.mode === 'tap' || SV().speakCounts === 'off') return null;
  const p = countPlan(
    {
      counts: Math.max(1, b.counts | 0),
      reps: Math.max(1, b.reps | 0),
      tempo: b.tempo > 0 ? b.tempo : cur.sec || 1,
      repPause: +b.repPause || 0,
      cues: (b.cues || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    },
    SV().lang,
  );
  return p.say === SV().speakCounts ? null : p;
}
function vfNote(b) {
  return withSnd(cur, () => vfNote0(b));
} // with this routine's sound & voice
function vfNote0(b) {
  const f = (x) => +x.toFixed(1),
    f2 = (x) => +x.toFixed(2),
    warn = (t) => `<span class="vw">${svgi('alert', 14, 2.5)}<span>${t}</span></span>`;
  if (b.type === 'reps') {
    const p = repsVoice(b);
    if (!p || !p.w) return '';
    return `<div class="vnote">${warn(`${SV().speakCounts === 'reps' ? 'Rep numbers' : 'Counts'} too fast to speak · “${esc(p.w.t)}” needs ~${f(p.w.v)} s, gets ${f2(p.w.slot)} s`)}<span class="muted">${p.say === 'reps' ? 'Counts beep; the rep number is spoken at the start of each rep.' : 'Beeps only, no voice.'} A longer count length or a faster voice (${cur.snd ? 'Sound &amp; voice' : 'Settings'}) brings it back.</span>${vState(b.id, [p.w.t], SV().lang)}</div>`;
  }
  if (b.type === 'seq') {
    if (!vEd()) return '';
    const lang = SV().lang,
      F = [];
    let n = 0,
      w = null; // the next step cuts a phrase off
    seqSteps(b).forEach((x) => {
      if (x.tap || x.q) return;
      const v = voiceSec(x.t, SV().rate, lang);
      if (!vSlow(v, x.dur)) return;
      n++;
      F.push(x.t);
      if (!w || v - x.dur > w.v - w.d) w = { v, d: x.dur, t: x.t };
    });
    return n
      ? `<div class="vnote">${warn(`Voice too slow for ${n === 1 ? '1 step' : `${n} steps`} · “${esc(w.t)}” needs ~${f(w.v)} s, gets ${f2(w.d)} s`)}<span class="muted">The next step cuts it off. Give it more time with @, or a shorter name.</span>${vState(b.id, F, lang)}</div>`
      : '';
  }
  if (b.type !== 'boxing' || !vEd() || b.vfit === 'tones') return ''; // Tones only: the voice doesn't say the calls
  const cl = b.tempo > 0 ? b.tempo : cur.sec || 1,
    g = Math.max(0, +b.minGap || 0),
    G = Math.max(g, +b.maxGap || 0),
    lang = SV().lang,
    pace = b.vfit === 'pace';
  const L = (b.combos || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean),
    F = [];
  let n = 0,
    fast = 0,
    beep = 0,
    w = null;
  L.forEach((l) => {
    const tx = callTxt(l),
      m = moves(l) * cl,
      v = voiceSec(tx, SV().rate, lang);
    if (!vSlow(v, m + g)) return;
    n++;
    F.push(tx);
    if (!w || v - m > w.v - w.m) w = { v, m };
    if (fitRate(tx, m + g, lang)) fast++;
    else beep++;
  });
  if (!n) return '';
  const tm = G > g ? `${f2(w.m + g)}–${f2(w.m + G)} s` : `${f2(w.m + g)} s`;
  const body = !pace
    ? `Calls wait for the voice: up to ~${f(w.v)} s apart instead of ${tm}.`
    : beep && fast
      ? `Calls stay on time: ${fast} said faster, ${beep} as tones (shown on screen).`
      : beep
        ? `Calls stay on time: ${n === L.length ? 'as tones, each call shown on screen' : `${beep} as tones (shown on screen), the others are said`}.`
        : 'Calls stay on time: the voice speaks faster (up to 1.5×).';
  return `<div class="vnote">${warn(`Voice too slow for ${n === L.length ? (n === 1 ? 'this combo' : `all ${n} combos`) : `${n} of ${L.length} combos`} · needs ~${f(w.v)} s, time per call ${tm}`)}<span class="muted">${body}</span>${vState(b.id, F, lang)}</div>`;
}
/* in a voice note: are these times measured (said on this device) or estimated? Estimated: Measure lets the voice say them once */
let VFLAG = {},
  VMS = 0; // per block: its slow phrases not heard yet · VMS: measuring
function vState(id, ts, lang) {
  const k = vKey(lang),
    r = SV().rate,
    x = rk(r) + '×';
  ts = [...new Set(ts)].filter((t) => vAt(k, t, r) == null);
  VFLAG[id] = ts;
  const one = ts.length === 1;
  return `<span class="vst">${!ts.length ? `Measured with this voice at ${x} on this device.` : `Estimated: the voice hasn't said ${one ? 'this' : 'these'} at ${x} on this device yet. ${VMS ? 'Listening…' : `<button type="button" class="ghost" onclick="vMeasure('${id}')" title="The voice says ${one ? 'it' : 'them'} once, so the app can time ${one ? 'it' : 'them'}">${svgi('play', 12)}Measure</button>`}`}</span>`;
}
function vMeasure(id) {
  const L = (VFLAG[id] || []).slice(0, 8);
  if (!L.length || VMS) return;
  ac();
  VMS = 1;
  const t0 = performance.now();
  let i = 0;
  vfAll();
  const next = () => {
    const ss = speechSynthesis,
      end = () => {
        VMS = 0;
        vfAll();
        if (cur && cur.snd) renderSnd();
      };
    if (!editOn() || performance.now() - t0 > 40000) return end();
    if (ss.speaking || ss.pending || performance.now() < SAYB + 200) return setTimeout(next, 150);
    if (i >= L.length) return end();
    withSnd(cur, () => say(L[i++], true, false, { force: true }));
    setTimeout(next, 400);
  }; // one at a time, each from silence (vLearn times it)
  next();
}
function seqInfo(b) {
  const L = seqSteps(b);
  if (!L.length) return '';
  const tp = L.filter((x) => x.tap).length,
    bad = L.filter((x) => x.bad);
  return `<span class="muted">${L.length} step${L.length !== 1 ? 's' : ''} · ${mmss(bDur(b))}${tp ? ` + ${tp} tap${tp > 1 ? 's' : ''}` : ''}</span>${bad.length ? `<br><span style="color:var(--orange)">${svgi('alert', 14, 2.5)} Not understood: ${bad.map((x) => `“@${esc(x.v)}”`).join(', ')} · use @6, @1.5, @1:30 or @tap</span>` : ''}`;
}
function cueInfo(b) {
  const n = (b.cues || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean).length,
    c = Math.max(1, b.counts | 0);
  if (!n) return '';
  const ok = n === c;
  const col = ok ? 'var(--green)' : 'var(--orange)';
  const msg = ok
    ? 'matches counts per rep'
    : n < c
      ? `${c - n} short — counts ${n + 1}–${c} show numbers`
      : `${n - c} extra — cue${n - c > 1 ? 's' : ''} after count ${c} ignored`;
  return `<span style="color:${col}">${svgi(ok ? 'check' : 'alert', 14, 2.5)} ${n} cue${n > 1 ? 's' : ''} / ${c} counts per rep · ${msg}</span>`;
}
function setB(id, k, v) {
  const b = cur.blocks.find((b) => b.id === id);
  if (!b) {
    renderBlocks();
    return;
  }
  b[k] = v;
  if (k === 'cues' || k === 'counts') {
    const el = document.getElementById('cc_' + id);
    if (el) el.innerHTML = cueInfo(b);
  }
  if (k === 'mode') renderBlocks();
  else if (k !== 'name') pvUpd(id);
  summary();
}
function setRun(id, v) {
  const b = cur.blocks.find((b) => b.id === id);
  if (!b) {
    renderBlocks();
    return;
  }
  if (v === 'first') b.firstOnly = true;
  else delete b.firstOnly;
  b.lastOnly = v === 'last';
  summary();
}
function addBlock(t) {
  const base = { id: uid(), type: t, lastOnly: false, restAfter: 0 };
  const d = {
    reps: { name: 'Burpees', reps: 10, counts: 12, mode: 'guided', repPause: 0, cues: '', display: 'both' },
    timed: { name: 'Work', work: 30, cue: '' },
    boxing: { name: 'Shadow boxing', work: 120, combos: '1-2\n1-2-3\n1-1-2\n2-3-2', minGap: 1, maxGap: 2 },
    seq: { name: 'Sequence', work: 3, steps: 'Ready @tap\nStep one\nStep two\nHold @10' },
    rest: { name: 'Rest', work: 30 },
  }[t];
  cur.blocks.push({ ...base, ...d });
  renderBlocks();
}
function mv(i, d) {
  const j = i + d;
  if (j < 0 || j >= cur.blocks.length) return;
  [cur.blocks[i], cur.blocks[j]] = [cur.blocks[j], cur.blocks[i]];
  renderBlocks();
}
function dup(i) {
  cur.blocks.splice(i + 1, 0, { ...cur.blocks[i], id: uid() });
  renderBlocks();
}
function rm(i) {
  cur.blocks.splice(i, 1);
  renderBlocks();
}
function readHead() {
  cur.icon = iconKey(cur);
  cur.name = eName.value || 'Routine';
  cur.rounds = Math.max(1, +eRounds.value || 1);
  cur.rest = +eRest.dataset.v || 0;
  cur.prep = +ePrep.dataset.v || 0;
  cur.color = eColor.value;
  if (window.eIconBtn) eIconBtn.style.color = COLORS[cur.color];
  cur.notes = eNotes.value;
  cur.sec = Math.min(10, Math.max(0.05, +eSec.value || 1));
  const lg = eLog.value;
  if (lg === 'off') cur.nolog = true;
  else delete cur.nolog;
  if (lg === 'log') cur.streak = false;
  else if (cur.streak === false) delete cur.streak;
  if (eSnd.value !== 'own') delete cur.snd;
  delete cur.lang;
  if (eHold.value) cur.hold = eHold.value;
  else delete cur.hold;
  cur.cv = 2;
}
function renderStruct() {
  const el = document.getElementById('eStruct');
  if (!el || !cur) return;
  const r = cur,
    bl = r.blocks || [];
  if (!bl.length) {
    el.innerHTML = `<b>Structure</b><p class="muted" style="margin:6px 0 0;font-size:13px">Add a block below. One round = all blocks once, top to bottom.</p>`;
    return;
  }
  const chip = (txt, kind, ic, c) =>
      `<span class="sc ${kind || ''}"${c ? ` style="--c:${c}"` : ''}>${ic ? svgi(ic, 14) : ''}${txt}</span>`,
    ar = '<span class="sa">→</span>';
  const warm = bl.filter((b) => b.firstOnly),
    fin = bl.filter((b) => b.lastOnly && !b.firstOnly);
  const hm = holdMode(r),
    tap1 = chip('Tap', 'wait', 'play') + ar;
  const one = (list, isLast) =>
    list
      .map((b, i) => {
        const d = bDur(b, r),
          bt = BT[b.type] || [];
        let h =
          (hm === 'blocks' && i > 0 && b.type !== 'rest' ? tap1 : '') +
          (b.type === 'rest'
            ? chip(`${esc(b.name || 'Rest')} ${mmss(d)}`, 'rest', null)
            : chip(
                `${esc(b.name)} ${d == null ? '· tap' : mmss(d)}${b.type === 'seq' && seqSteps(b).some((x) => x.tap) ? ' + tap' : ''}`,
                '',
                b.type === 'reps' ? 'hash' : b.type === 'timed' ? 'timer' : b.type === 'seq' ? 'steps' : 'glove',
                COLORS[bt[2]],
              ));
        const lastInRound = i === list.length - 1;
        if (b.restAfter > 0 && b.type !== 'rest' && !(isLast && lastInRound))
          h += ar + chip(`Rest ${mmss(b.restAfter)}`, 'rest');
        return h;
      })
      .join(ar);
  const n = Math.max(1, r.rounds | 0);
  let html = `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><b>Structure</b><span class="muted" style="font-size:13px">one round = all blocks, top to bottom</span></div><div class="sflow">`;
  if (r.prep > 0) html += chip(`Get ready ${mmss(r.prep)}`, 'prep');
  const at = (k) => bl.filter((b) => inRound(b, k === 1, k === n)),
    box = (lbl, k) =>
      `<div class="sround"><div class="sl">${lbl}</div><div class="sflow">${one(at(k), false) || '<span class="muted">(no blocks)</span>'}${r.rest > 0 ? ar + chip(`Rest between rounds ${mmss(r.rest)}`, 'rrest') : ''}${hm ? ar + chip('Tap to start next round', 'wait', 'play') : ''}</div></div>`;
  if (n > 1 && warm.length) {
    html += box('Round 1 (first)', 1);
    if (n > 2) html += box(n > 3 ? `Rounds 2–${n - 1}` : 'Round 2', 2);
  } else if (n > 1) html += box(n > 2 ? `Rounds 1–${n - 1}` : 'Round 1', 1);
  html += `<div class="sround last"><div class="sl">${n > 1 ? `Round ${n} (last)` : 'Round 1 (only)'}</div><div class="sflow">${one(at(n), true)}${chip('Done', 'done', 'check')}</div></div></div>`;
  html += `<p class="muted" style="margin:8px 0 0;font-size:13px">${n} round${n !== 1 ? 's' : ''}${warm.length ? ` · ${warm.map((b) => esc(b.name)).join(', ')} only in the first round` : ''}${fin.length ? ` · ${fin.map((b) => esc(b.name)).join(', ')} only in the last round` : ''}${r.rest > 0 && n > 1 ? ` · no round rest after the last round` : ''}${hm === 'blocks' ? ` · each next block starts when you tap` : hm && n > 1 ? ` · each next round starts when you tap` : ''}</p>`;
  html += `<p id="eSummary" style="margin:10px 0 0;font-size:14px;font-weight:600;color:var(--tx)"></p>`;
  el.innerHTML = html;
}
function summary() {
  readHead();
  renderStruct();
  queueAutosave();
  const st = build(cur);
  const t = st.reduce((a, s) => a + (s.dur || 0), 0);
  const reps = st.filter((s) => s.type === 'reps').reduce((a, s) => a + s.reps, 0);
  const sm = document.getElementById('eSummary');
  if (sm) sm.textContent = `Total ≈ ${fmt(t)}${reps ? ` · ${reps} reps` : ''} · ${st.length} steps`;
}
function saveRoutine(start) {
  clearTimeout(autoT);
  autoT = null;
  readHead();
  delete cur._new;
  putR(cur);
  persist();
  renderList();
  if (start) startRun(cur.id, start === 'test');
  else if (EDBACK === 'week' && !ROUTING) openWeek();
  else show('lib');
}
function closeEditor() {
  saveRoutine(false);
}
function deleteRoutine() {
  if (!confirm('Delete this routine?')) return;
  clearTimeout(autoT);
  autoT = null;
  setR(R.filter((r) => r.id !== cur.id));
  persist();
  renderList();
  show('lib');
}
function renderSnd() {
  if (!cur) return;
  const o = cur.snd;
  eSnd.value = o ? 'own' : '';
  eSndBox.hidden = !o;
  eSndBox.innerHTML = o
    ? `<div class="muted" style="grid-column:1/-1;font-size:13px">This routine uses these instead of Settings. Vibrate and Keep screen on follow Settings.</div>` +
      sndForm(o, 'R')
    : '';
}
function playCombo(id, n) {
  const b = cur && cur.blocks.find((x) => x.id === id),
    l =
      b &&
      (b.combos || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)[n];
  if (l)
    withSnd(cur, () => {
      const cl = b.tempo > 0 ? b.tempo : cur.sec || 1,
        tx = callTxt(l),
        m = b.vfit;
      let r = 0;
      if (vEd() && !muted && !silentHere() && m !== 'tones') {
        r = SV().rate || 1;
        if (m === 'pace') {
          const s = {
              combos: (b.combos || '')
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean),
              cl,
              minGap: b.minGap,
            },
            k = fitRate(tx, moves(l) * cl + Math.max(0, +b.minGap || 0));
          r = k && Math.max(k, boxRate(s));
        }
      }
      if (r) {
        say(tx, true, false, { call: true, rate: r, force: true });
        beep(1500, 0.05, 'square', 0.4);
      } else comboTones(l, cl, toneMap(cur.blocks), ac().currentTime + 0.05, true);
    });
} // editor ▶: as set under Calls (voice, faster voice or tones; plays even when muted)
function poolPreview(id) {
  return withSnd(cur, () => poolPreview0(id));
} // with this routine's sound & voice
function poolPreview0(id) {
  const b = cur && cur.blocks.find((x) => x.id === id);
  if (!b) return '';
  const cl = b.tempo > 0 ? b.tempo : cur.sec || 1,
    vo = vEd() && b.vfit !== 'tones',
    g = Math.max(0, +b.minGap || 0),
    tm = toneMap(cur.blocks);
  const L = (b.combos || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!L.length) return '';
  return L.map((l, n) => {
    const m = movesOf(l),
      v = vo ? voiceSec(callTxt(l), SV().rate, SV().lang) : 0,
      sl = vo && vSlow(v, moves(l) * cl + g);
    return `<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:3px 0;font-size:13px"><button class="ghost pvp" onclick="playCombo('${id}',${n})" title="${vo ? 'Play as in the workout' : 'Play as tones'}" aria-label="${vo ? 'Play as in the workout' : 'Play as tones'}">${svgi('play', 14)}</button>${m
      .map((t) => {
        const T = TONES[tm.get(mkey(t))];
        return `<span class="tag"${T ? ` style="background:${T[0]}2e;color:${T[0]}"` : ''}>${esc(spoken(t))}</span>`;
      })
      .join(
        '',
      )}<span class="muted" style="font-size:13px">= ${m.length} move${m.length !== 1 ? 's' : ''} · ${+(m.length * cl).toFixed(2)} s + extra${vo ? ` · <span style="color:${sl ? 'var(--orange)' : 'inherit'}">voice ~${+v.toFixed(1)} s</span>` : ''}</span></div>`;
  }).join('');
}
function pvUpd(id) {
  if (cur)
    cur.blocks.forEach((x) => {
      const e = x.type === 'boxing' && document.getElementById('pv-' + x.id);
      if (e) e.innerHTML = poolPreview(x.id);
    }); // all: a routine's moves share their tones
  const n = document.getElementById('vf-' + id),
    b = cur && cur.blocks.find((x) => x.id === id);
  if (n && b) n.innerHTML = vfNote(b);
  const q = b && b.type === 'seq' && document.getElementById('sq-' + id);
  if (q) q.innerHTML = seqInfo(b);
}
function vfAll() {
  if (!cur) return;
  pvUpd();
  cur.blocks.forEach((b) => {
    const n = document.getElementById('vf-' + b.id);
    if (n) n.innerHTML = vfNote(b);
  });
} // every block's voice note and combo preview
// for the modules that replace these
function setCur(v) {
  cur = v;
}
export {
  autoT,
  editOn,
  queueAutosave,
  autosave,
  durIn,
  durOut,
  durStep,
  toggleArchiveCur,
  cur,
  newRoutine,
  openEditor,
  pickColor,
  setWhen,
  toggleDay,
  pickIcon,
  fillEditor,
  vMeasure,
  setB,
  setRun,
  addBlock,
  mv,
  dup,
  rm,
  readHead,
  summary,
  saveRoutine,
  closeEditor,
  deleteRoutine,
  renderSnd,
  playCombo,
  pvUpd,
  vfAll,
  setCur,
};
