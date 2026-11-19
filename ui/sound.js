/* Sound & voice: beeps, move tones, the voice coach and its diagnostics, background beeps, and the Sound & voice form. */
import { countdownOf, cuePlan } from '../core/engine.js';
import { DEF_SET } from '../core/routine.js';
import { TICK, TONES, moveTones } from '../core/steps.js';
import {
  fitVoice,
  learnVoice,
  lnorm,
  measuredAt,
  phraseBody,
  phraseIn,
  planCounts,
  rateToFit,
  sayDurIn,
  voiceSecOf,
  waitText,
} from '../core/voice.js';
import { cur, queueAutosave, renderSnd, vfAll } from './editor.js';
import { esc, info, svgi, toast } from './html.js';
import { DEV, NOW, X, callGap, mine, nextCombo, showCall } from './runner.js';
import { openSettings } from './settings.js';
import { S, persist } from './storage.js';
const sndOf = (r) => (r && r.snd ? { ...S, ...r.snd } : S);
let SNDR; // whose apply: undefined = the running workout's routine, null = Settings, a routine = that one (editor)
function SV() {
  return sndOf(SNDR === undefined ? X && X.r : SNDR);
}
function withSnd(r, f) {
  const p = SNDR;
  SNDR = r;
  try {
    return f();
  } finally {
    SNDR = p;
  }
}
let VFIT = {};
try {
  VFIT = JSON.parse(localStorage.getItem('rf2_vfit') || '{}') || {};
} catch (e) {} // how fast this device's voices really speak (vLearn)
let VFR = {};
try {
  VFR = JSON.parse(localStorage.getItem('rf2_vfr') || '{}') || {};
} catch (e) {} // per phrase: its time at each voice speed it was said at

let AC = null,
  muted = false;
function ac() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
const silentHere = () => !!(X && X.steps && X.by !== DEV.id); // another device plays this workout's sound
function beep(f = 880, d = 0.08, type = 'sine', vol = 1, at) {
  if (!SV().beeps || muted || silentHere()) return;
  const c = ac(),
    t = at ?? c.currentTime,
    o = c.createOscillator(),
    g = c.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(SV().volume * vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + d + 0.02);
  return o;
}
function bell() {
  if (silentHere()) return;
  [0, 0.18, 0.36].forEach((t) => setTimeout(() => beep(1320, 0.35, 'triangle'), t * 1000));
}
/* In the background (another app, screen off) the browser stops the timer loop. So the beeps of what comes next are queued
   on the audio clock, which keeps playing on Android and computers (an iPhone pauses web apps). Speech can't be queued; Tones only
   combo calls can: they are drawn ahead (X.bq) and the loop goes on from them back in view.
   A near-silent tone (until the last queued beep) keeps the page counted as playing sound, so it isn't put to sleep.
   Back in view, the queue is dropped and the loop takes over. BGT: when it was dropped (beeps before it already played). */
let BG = [],
  BGT = 0;
function bgOff() {
  if (!BG.length) return;
  BG.forEach((o) => {
    try {
      o.stop();
    } catch (e) {}
  });
  BG = [];
  BGT = NOW();
}
function bgOn() {
  bgOff();
  if (!document.hidden || !X || !X.steps || X.p != null || !mine() || !AC || AC.state !== 'running' || muted) return; // Beeps off: only Tones only calls are queued
  const c = AC,
    now = NOW(),
    base = c.currentTime;
  let end = 0;
  const add = (ms, f, d, type = 'sine', vol = 1) => {
    if (ms < now || BG.length >= 3000) return;
    const o = beep(f, d, type, vol, base + (ms - now) / 1000);
    if (o) {
      BG.push(o);
      end = Math.max(end, ms);
    }
  };
  const addT = (ms, i, d) => {
    if (ms < now || BG.length >= 3000) return;
    const o = tone(i, d, base + (ms - now) / 1000);
    if (o) {
      BG.push(o);
      end = Math.max(end, ms);
    }
  };
  const keep = () => {
    if (!BG.length) return;
    const o = c.createOscillator(),
      g = c.createGain();
    o.frequency.value = 50;
    g.gain.value = 0.001;
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(base + (end - now) / 1000 + 1);
    BG.push(o);
  };
  for (const e of cuePlan(X.steps, X.i, X.s0, now, cdn)) {
    if (!e.box) {
      add(e.ms, e.f, e.d, e.type, e.vol);
      continue;
    }
    const { i, s0 } = e,
      s = X.steps[i]; // Tones only combo calls
    const q = X.bq || (X.bq = []),
      cl = s.cl || 1,
      put = (e) => {
        e.a = s0 + e.t * 1000;
        moveTones(e.c, s.tm).forEach((k, j) => addT(e.a + j * cl * 1000, k, cl * 0.85));
      };
    let t = i === X.i ? Math.max(X.nc, (now - s0) / 1000 + 0.1) : 1.5;
    q.forEach((e) => {
      if (e.i === i) {
        put(e);
        t = e.n;
      }
    }); // queued before: again, then more
    while (s.dur - t > 1.5 && BG.length < 3000) {
      const c = nextCombo(s),
        e = { i, t, c, n: t + callGap(s, c), u: X.box[s.bid].num };
      q.push(e);
      put(e);
      t = e.n;
    }
  } // same timing as boxCall
  keep();
}
// back in view: Tones only calls that played in the background count as done (before catchUp, which may finish the workout); the one
// still playing is shown and the rest of its tones queued again (bgOff stopped them); the loop goes on from the plan
function bqPlayed(now) {
  const q = X.bq,
    p = [];
  while (q && q.length && q[0].a <= now) p.push(q.shift());
  X.calls = (X.calls || 0) + p.length;
  return p;
}
function bqBack(p, now) {
  const s = X.steps[X.i],
    h = p.filter((e) => e.i === X.i),
    e = h[h.length - 1],
    q = X.bq;
  if (e) {
    X.sc = (X.sc || 0) + h.length;
    X.ct = e.c;
    showCall(e.c, false);
    if (X.box[s.bid]) X.box[s.bid].num = e.u;
    comboTones(e.c, s.cl || 1, s.tm, ac().currentTime + (e.a - now) / 1000);
    X.nc = e.n;
  }
  if (q && q.length && q[0].i === X.i) X.nc = q[0].t;
}
let UTT = null,
  SAYT = 0,
  SAYN = 0,
  SAYI = 0,
  SAYC = -1e9,
  SAW = false,
  SAYB = 0; // SAYB: until then a phrase just handed over counts as speaking · UTT: current utterance, kept referenced (Chrome can drop it mid-sentence otherwise) · SAYN: newest phrase · SAYI: newest phrase that interrupts · SAYC: last cancel() · SAW: this device reports speech starts
function say(t, interrupt = true, cue = false, o) {
  if (!t) return;
  const so = SV(); // o: {rate, call: a boxing call, force: also with the voice coach off (Test)} · so: sound & voice now
  const why = !window.speechSynthesis
    ? 'no speechSynthesis in this browser'
    : !so.voice && !(o && o.force)
      ? 'voice coach off'
      : muted
        ? 'muted'
        : silentHere()
          ? 'sound on another device'
          : '';
  if (why) {
    vd('skipped: ' + why);
    if (!window.speechSynthesis && so.voice) vdFail();
    return;
  }
  const n = ++SAYN;
  if (interrupt) SAYI = n;
  SAYB = performance.now() + 150;
  // phrases said in the same moment (an exercise name, then its first count): only the newest reaches the engine
  queueMicrotask(() => {
    if (SAYI > n) return;
    try {
      const ss = speechSynthesis,
        t0 = performance.now(),
        busy = ss.speaking || ss.pending,
        p = UTT;
      // Chrome sometimes drops a phrase spoken shortly after cancel(). A cue that is already playing is nearly done,
      // so the next cue waits behind it (up to 0.2 s) instead of cutting it off
      const soft = cue && p && p.cue && p.on && !ss.pending && t0 - p.on < 1500,
        cut = interrupt && busy && !soft;
      const stop = () => {
        clearTimeout(SAYT);
        SAYC = performance.now();
        if (UTT) UTT.cut = true;
        if (p) p.cut = true;
        ss.cancel();
      };
      if (cut) stop();
      const go = (re) => {
        if (SAYI > n) return;
        try {
          const u = new SpeechSynthesisUtterance(t);
          u.lang = so.lang;
          const v = pickVoice(so.lang, so);
          if (v) {
            u.voice = v;
            u.lang = v.lang;
          }
          u.rate = (o && o.rate) || so.rate;
          u.pitch = so.pitch || 1;
          u.volume = so.volume;
          u.cue = cue;
          u.call = !!(o && o.call);
          // ended without ever starting while still the newest phrase: the engine dropped it, so say it once more while still on time
          const lost = (c) => {
            if (
              re ||
              u.on ||
              u.dead ||
              n !== SAYN ||
              performance.now() - t0 > 700 ||
              !(c === 'interrupted' || c === 'canceled' || (c === 'end' && SAW))
            )
              return false;
            vd('dropped (' + c + '), retrying');
            clearTimeout(SAYT);
            SAYT = setTimeout(() => {
              if (n === SAYN) go(true);
            }, 100);
            return true;
          };
          u.onstart = () => {
            u.on = performance.now();
            SAW = true;
            clearTimeout(VDWD);
            VDBAD = false;
            vd('started');
          };
          u.onend = () => {
            u.done = true;
            if (UTT === u) UTT = null;
            if (!lost('end')) {
              vd('ended');
              if (u.q && u.on && !u.cut) vLearn(u, (performance.now() - u.q) / 1000);
            }
          };
          u.onerror = (e) => {
            u.done = true;
            if (UTT === u) UTT = null;
            clearTimeout(VDWD);
            const c = e.error || 'unknown';
            if (lost(c)) return;
            if (c !== 'interrupted' && c !== 'canceled') vdFail();
            vd('error: ' + c);
          };
          const idle = !ss.speaking && !ss.pending;
          UTT = u;
          if (ss.paused) ss.resume();
          u.q = idle ? performance.now() : 0;
          ss.speak(u);
          if (idle) {
            clearTimeout(VDWD);
            VDWD = setTimeout(() => {
              if (UTT === u && !ss.speaking) {
                vdFail();
                vd('did not start within 4 s');
              }
            }, 4000);
          }
          // the cue it waits for is still busy after 0.2 s: cut it after all
          if (soft && !re)
            setTimeout(() => {
              if (n === SAYN && !u.on && !p.done) {
                u.dead = true;
                vd('previous cue still busy, cutting');
                stop();
                SAYT = setTimeout(() => {
                  if (n === SAYN) go(true);
                }, 60);
              }
            }, 200);
          vd('queued "' + t.slice(0, 24) + '"');
        } catch (e) {
          vdFail();
          vd('exception on speak: ' + e.message);
        }
      };
      // after cancel(), wait a moment before speaking
      const wait = SAYC + 60 - performance.now();
      if (wait > 0) SAYT = setTimeout(() => go(false), wait);
      else go(false);
    } catch (e) {
      vdFail();
      vd('exception: ' + e.message);
    }
  });
}
/* voice diagnostics, shown under Settings → Test sound & voice */
const VDL = [];
let VDBAD = false,
  VDTOAST = false,
  VDWD = 0;
// shown only when speech fails: a real error, an exception, no speech support, or a phrase that never starts
function vdFail() {
  VDBAD = true;
  if (!VDTOAST) {
    VDTOAST = true;
    toast('Voice coach is not working on this device. Details: Settings → Test sound & voice.');
  }
}
function vd(m) {
  const d = new Date();
  VDL.unshift(d.toTimeString().slice(0, 8) + ' ' + m);
  VDL.length = Math.min(VDL.length, 5);
  vdShow();
}
function vdShow() {
  const el = document.getElementById('vdiag');
  if (!el) return;
  el.hidden = !VDBAD;
  if (!VDBAD) return;
  let h = '<b>Voice problem</b> · <a href="#" onclick="vdHide();return false">Hide</a><br>';
  try {
    const ss = window.speechSynthesis,
      all = ss ? ss.getVoices() : [],
      v = ss ? pickVoice() : null,
      cv = (navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1];
    h += `Voices: ${all.length} · for ${esc(S.lang)}: ${ss ? langVoices().length : 0} · using: ${v ? esc(v.name) + ' (' + esc(v.lang) + (v.localService ? '' : ', online') + ')' : 'browser default'}<br>rate ${esc(String(S.rate))} · pitch ${esc(String(S.pitch))} · volume ${esc(String(S.volume))} · voice coach ${S.voice ? 'on' : 'off'}${muted ? ' · muted' : ''}<br>state: ${ss ? (ss.speaking ? 'speaking ' : '') + (ss.pending ? 'pending ' : '') + (ss.paused ? 'paused ' : '') || 'idle' : 'n/a'} · Chrome ${cv || '?'}${matchMedia('(display-mode: standalone)').matches ? ' · installed app' : ' · browser tab'}<br>${VDL.map(esc).join('<br>') || 'Tap Test sound & voice'}`;
  } catch (e) {
    h = 'diagnostics error: ' + esc(e.message);
  }
  el.innerHTML = h;
}
function vdHide() {
  VDBAD = false;
  vdShow();
}
function hush() {
  SAYI = ++SAYN;
  clearTimeout(SAYT);
  SAYC = performance.now();
  if (UTT) UTT.cut = true;
  speechSynthesis.cancel();
} // stop speech, including a phrase waiting to start
function vKey(lang) {
  const v = window.speechSynthesis && pickVoice(lang || undefined);
  return v ? v.name : 'default';
}
function vAt(k, t, rate) {
  return measuredAt(VFR, k, t, rate);
}
function vBody(t, lang, rate = SV().rate) {
  return phraseBody(VFIT, VFR, vKey(lang), t, rate, vFit);
}
let VFC = {}; // vFit per voice, until it learns more
function vFit(k) {
  return VFC[k] || (VFC[k] = fitVoice(VFIT, k));
}
function voiceSec(t, rate = SV().rate, lang) {
  return voiceSecOf(t, rate, (x, r) => vBody(x, lang, r));
}
function vLearn(u, sec) {
  if (document.hidden || !learnVoice(VFIT, VFR, u.voice ? u.voice.name : 'default', u.text, sec, u.rate)) return;
  VFC = {};
  try {
    localStorage.setItem('rf2_vfit', JSON.stringify(VFIT));
    localStorage.setItem('rf2_vfr', JSON.stringify(VFR));
  } catch (e) {}
}
function fitRate(t, avail, lang) {
  const r = SV().rate || 1;
  return rateToFit(vBody(t, lang, r), r, avail);
}
const vEd = () => SV().voice && !!window.speechSynthesis; // the editor checks the voice only when it is on
function langVoices(lang = S.lang) {
  const L = lnorm(lang);
  return speechSynthesis
    .getVoices()
    .filter((v) => lnorm(v.lang) === L)
    .sort((a, b) => b.localService - a.localService || a.name.localeCompare(b.name));
}
/* voice language and voice: from Settings, or the routine's own sound & voice (SV) */
function voiceLang() {
  return SV().lang;
}
function pickVoice(L, o = SV()) {
  L = L || o.lang;
  const all = speechSynthesis.getVoices(),
    own = lnorm(L) === lnorm(o.lang);
  return (
    (own && o.voiceURI && all.find((v) => v.voiceURI === o.voiceURI)) ||
    langVoices(L)[0] || // chosen voice (for its language only), else best voice for the language
    all
      .filter((v) => lnorm(v.lang).split('-')[0] === lnorm(L).split('-')[0])
      .sort((a, b) => b.localService - a.localService)[0] ||
    null
  );
} // else any voice for that language (nl-BE for nl-NL)
function voiceLangs() {
  const v = speechSynthesis
    .getVoices()
    .map((v) => v.lang)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();
  return v.length ? v : ['en-US', 'en-GB', 'nl-NL', 'es-ES', 'de-DE', 'fr-FR'];
}
/* sound & voice form: Settings (k 'S': S) or a routine's own (k 'R': cur.snd) */
function sndForm(o, k, extra = '') {
  const ls = voiceLangs();
  if (!ls.includes(o.lang)) ls.unshift(o.lang);
  const chk = (c, l) =>
      `<label class="chk"><input type="checkbox" ${o[c] ? 'checked' : ''} onchange="sndSet('${k}','${c}',this.checked)"> ${l}</label>`,
    rng = (c, l, a, b, tst) =>
      `<div><label>${l} <span class="dh">${sndVal(c, o[c])}</span></label><input type="range" min="${a}" max="${b}" step="0.05" value="${o[c]}" oninput="sndSet('${k}','${c}',+this.value);this.previousElementSibling.lastChild.textContent=sndVal('${c}',this.value)"${tst ? ` onchange="testVoice('${k}')"` : ''}></div>`;
  return (
    `<div class="tg">${chk('beeps', 'Beeps') + chk('voice', 'Voice coach') + extra}</div>` +
    `
  <div><label>Voice language</label><select onchange="sndSet('${k}','lang',this.value)">${ls.map((l) => `<option ${l === o.lang ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
  <div><label>Voice</label><div style="display:flex;gap:var(--space-2)"><select style="flex:1;min-width:0" onchange="sndSet('${k}','voiceURI',this.value);testVoice('${k}')"><option value="">Default for ${esc(o.lang)}</option>${langVoices(
    o.lang,
  )
    .map(
      (v) =>
        `<option value="${esc(v.voiceURI)}" ${v.voiceURI === o.voiceURI ? 'selected' : ''}>${esc(v.name)}${v.localService ? '' : ' · online'}</option>`,
    )
    .join(
      '',
    )}</select><button type="button" class="ib" style="padding:var(--space-1) var(--space-3)" onclick="testVoice('${k}')" title="Test voice">${svgi('play', 14)}Test</button></div></div>
  <div style="grid-column:1/-1;margin-top:-8px">${vTimeInfo(o, k)}</div>
  <div><label>Speak counts</label><select onchange="sndSet('${k}','speakCounts',this.value)">
    ${[
      ['every', 'Every count'],
      ['reps', 'Rep numbers only'],
      ['off', 'Off'],
    ]
      .map(([v, l]) => `<option value="${v}" ${o.speakCounts === v ? 'selected' : ''}>${l}</option>`)
      .join('')}</select></div>
  <div><label>Countdown beeps (last s)</label><input type="number" min="0" max="10" value="${o.countdown}" oninput="sndSet('${k}','countdown',+this.value)"></div>
  ${rng('volume', 'Volume', '0', '1')}${rng('rate', 'Voice speed', '0.7', '1.8', 1)}${rng('pitch', 'Voice pitch', '0.5', '1.5', 1)}`
  );
}
/* how well this device knows the chosen voice's timing, in plain words */
function vTimeInfo(o, k) {
  const v = window.speechSynthesis && pickVoice(o.lang, o),
    f = vFit(v ? v.name : 'default'),
    n = f.n;
  const st = !n ? 'not learned yet' : f.fit ? `learned (${n} phrases)` : `learning (${n} phrase${n > 1 ? 's' : ''})`;
  const tip = !n
    ? 'To start, do a test run, or press Measure under a voice warning in the editor.'
    : f.fit
      ? 'Nothing to do: it keeps learning as you train.'
      : 'A few more workouts or test runs, with phrases of different lengths, make it precise.';
  return info(
    'vtime' + k,
    `Voice timing on this device: ${st}`,
    `<p style="margin:0 0 var(--space-2)">While the voice speaks in a workout or test, the app times it. That's how the editor knows when a step, count or combo is too short to say. Phrases it has said are measured; new ones are estimated from how fast this voice speaks, more precisely the more it has heard. Measured is per voice speed: after a change, phrases are estimated again until the voice has said them at the new speed.</p><p class="m-0">${tip} Kept on this device, per voice.</p>`,
  );
}
const sndVal = (c, v) =>
  '· ' +
  (c === 'volume' ? Math.round(v * 100) + '%' : (+v).toFixed(2).replace(/\.?0+$/, '') + (c === 'rate' ? '×' : '')); // a slider's value next to its name
function sndSet(k, c, v) {
  const o = k === 'R' ? cur && cur.snd : S;
  if (!o) return;
  o[c] = v;
  if (c === 'lang') o.voiceURI = ''; // another language: its best voice
  if (k === 'S') {
    persist();
    if (c === 'lang') openSettings();
    return;
  }
  queueAutosave();
  if (c === 'lang') renderSnd();
  vfAll();
}
function ph(k) {
  return phraseIn(voiceLang(), k);
}
function sayDur(d) {
  return sayDurIn(d, voiceLang());
}
function testVoice(k) {
  withSnd(k === 'R' ? cur : null, () => {
    const L = SV().lang,
      nl = L.startsWith('nl'),
      es = L.startsWith('es');
    say(
      nl
        ? 'Klaar? Jab, cross, hoek. Rust.'
        : es
          ? '¿Listo? Jab, cross, gancho. Descanso.'
          : 'Ready? Jab, cross, hook. Rest.',
      true,
      false,
      { force: true },
    );
  });
} // k 'R': this routine's own
function buzz(p) {
  if (S.vibrate && navigator.vibrate && !silentHere()) navigator.vibrate(p);
}
function resetAudio() {
  if (!confirm('Reset all sound & voice settings to their defaults?')) return;
  ['beeps', 'voice', 'lang', 'voiceURI', 'pitch', 'rate', 'volume', 'speakCounts', 'countdown'].forEach(
    (k) => (S[k] = DEF_SET[k]),
  );
  persist();
  openSettings();
  testAudio();
}
function testAudio() {
  const st = (f) => () => withSnd(null, f);
  ac();
  st(() => beep(660))();
  setTimeout(
    st(() => beep(990)),
    200,
  );
  setTimeout(
    st(() => say(S.lang.startsWith('nl') ? 'Klaar? Gaan!' : 'Ready? Go!')),
    400,
  );
} // Settings, also during a workout
function toggleMute() {
  muted = !muted;
  muteBtn.innerHTML = svgi(muted ? 'mute' : 'vol', 22);
  if (muted) hush();
}
const waitTx = (s) => waitText(s, voiceLang());
const cdn = (s) => countdownOf(s, SV().countdown);
let NOISE = null;
function tone(i, d, at, force) {
  if (!force && (muted || silentHere())) return;
  /* move tones are calls: they play with Beeps off too */ const c = ac(),
    [w, f0, f1, len, vol] = TONES[i] || TICK,
    t = at ?? c.currentTime,
    e = Math.max(0.03, Math.min(len, d || len)),
    g = c.createGain();
  let o;
  if (w === 'noise') {
    if (!NOISE) {
      NOISE = c.createBuffer(1, (c.sampleRate / 2) | 0, c.sampleRate);
      const a = NOISE.getChannelData(0);
      let r = 1;
      for (let k = 0; k < a.length; k++) a[k] = (r = (r * 16807) % 2147483647) / 1073741823.5 - 1;
    } // the same noise every time
    o = c.createBufferSource();
    o.buffer = NOISE;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + e);
    o.connect(bp).connect(g);
  } else {
    o = c.createOscillator();
    o.type = w;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + e);
    o.connect(g);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, SV().volume * vol), t + (w === 'noise' ? e * 0.4 : 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + e);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + e + 0.02);
  return o;
}
// a combo as tones from audio time at (s): one per move, cl s apart; moves already past are skipped
function comboTones(c, cl, tm, at, force) {
  const a = ac(),
    t0 = at ?? a.currentTime;
  moveTones(c, tm).forEach((i, j) => {
    const t = t0 + j * cl;
    if (t >= a.currentTime - 0.01) tone(i, cl * 0.85, t, force);
  });
}
/* guided counts are only spoken when each fits its count (said before the next one starts); otherwise only the rep number (at the
   first count), otherwise beeps only. s: a reps step, or the editor's view of a block. w: the phrase that fits worst */
function countPlan(s, lang) {
  return planCounts(s, SV().speakCounts, (t) => voiceSec(t, SV().rate, lang));
}
function cSay(s) {
  if (!SV().voice) return SV().speakCounts;
  const k = SV().speakCounts + '|' + SV().rate;
  if (s.vpk !== k) {
    s.vpk = k;
    s.vp = countPlan(s).say;
  }
  return s.vp;
} // decided once per step
export {
  sndOf,
  SV,
  withSnd,
  muted,
  ac,
  silentHere,
  beep,
  bell,
  BG,
  BGT,
  bgOff,
  bgOn,
  bqPlayed,
  bqBack,
  UTT,
  SAYB,
  say,
  vdShow,
  vdHide,
  hush,
  vKey,
  vAt,
  voiceSec,
  fitRate,
  vEd,
  sndForm,
  sndVal,
  sndSet,
  ph,
  sayDur,
  testVoice,
  buzz,
  resetAudio,
  testAudio,
  toggleMute,
  waitTx,
  cdn,
  comboTones,
  countPlan,
  cSay,
};
