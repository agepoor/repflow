/* How long the voice takes to say a phrase (learned per device, passed in as two stores), what fits in the time a cue has,
   and the built-in spoken words per language. No DOM or browser UI: runs in any JavaScript engine. */
/* how long the voice takes to say a phrase, in s (handed over until it ends). Learned on this device while it speaks: per phrase
   (combos and counts come back every workout), and per voice for phrases it hasn't said yet: a start-up time plus a time per
   letter, fitted to the phrases it has said (vFit), so short ones (counts) don't make a long new one look slow */
const numLen = (n) => (n < 10 ? 4 : n < 20 ? 6 : n < 100 ? 9 : n < 1000 ? 14 : 18); // a number: about as many letters as it has spoken
function vUnits(t) {
  return String(t || '')
    .replace(/_/g, ' ')
    .replace(/\d+/g, (m) => ' ' + 'x'.repeat(numLen(+m)) + ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .reduce((n, w) => n + w.length + 1.5, 0);
}
const VLAT = 0.15; // s until the voice starts, about
const rk = (r) => String(+(+r || 1).toFixed(2)); // a voice speed, as a key
/* the timing model works on two stores (VFIT: per voice and per phrase at rate 1; VFR: per phrase per voice speed), passed in */
function measuredAt(VFR, k, t, rate) {
  const R = VFR[k + '|' + t];
  return R ? R[rk(rate)] : undefined;
} // measured at this voice speed?
function phraseBody(VFIT, VFR, k, t, rate, fitOf) {
  const r = measuredAt(VFR, k, t, rate);
  if (r != null) return r;
  const m = VFIT[k + '|' + t];
  if (m != null) return m;
  const f = fitOf(k);
  return f.a + f.s * vUnits(t);
} // s to say t at rate 1, once started
function fitVoice(VFIT, k) {
  const p = k + '|',
    P = [];
  for (const q in VFIT) if (q.startsWith(p)) P.push([vUnits(q.slice(p.length)), VFIT[q]]);
  const n = P.length;
  let f = null;
  if (n >= 5) {
    const mx = P.reduce((a, x) => a + x[0], 0) / n,
      my = P.reduce((a, x) => a + x[1], 0) / n;
    let sxx = 0,
      sxy = 0;
    P.forEach(([x, y]) => {
      sxx += (x - mx) ** 2;
      sxy += (x - mx) * (y - my);
    });
    const s = sxy / sxx,
      a = my - s * mx;
    if (sxx > n * 16 && s >= 0.02 && s <= 0.2 && a >= 0 && a <= 1.5) f = { a, s, fit: true };
  } // enough phrases of different lengths, and a sensible line
  return { ...(f || { a: 0, s: 0.062 * (VFIT[k] || 1) }), n };
} // else: its average speed · n: phrases heard
const voiceSecOf = (t, rate, body) => (vUnits(t) ? VLAT + body(t, rate) / Math.max(0.1, rate || 1) : 0); // body(t, rate): s to say t at rate 1
/* the voice k said phrase t at this rate in sec s: learn from it (false: too short or implausible, nothing learned) */
function learnVoice(VFIT, VFR, k, t, sec, rate) {
  const n = vUnits(t);
  if (n < 4 || !(sec > 0.1 && sec < 20)) return false;
  const b = Math.max(0.05, sec - VLAT) * (rate || 1),
    pk = k + '|' + t,
    o = VFIT[pk];
  delete VFIT[pk];
  VFIT[pk] = +(o != null ? (o + b) / 2 : b).toFixed(3); // this phrase (newest last)
  const r = Math.min(2.5, Math.max(0.4, b / (0.062 * n)));
  VFIT[k] = +(VFIT[k] ? VFIT[k] * 0.8 + r * 0.2 : r).toFixed(3); // this voice
  const R = VFR[pk] || {},
    q = rk(rate),
    w = R[q];
  delete R[q];
  R[q] = +(w != null ? (w + b) / 2 : b).toFixed(3);
  const rs = Object.keys(R);
  if (rs.length > 4) delete R[rs[0]];
  VFR[pk] = R; // this phrase at this voice speed
  const ps = Object.keys(VFIT).filter((x) => x.includes('|'));
  if (ps.length > 400) {
    delete VFIT[ps[0]];
    delete VFR[ps[0]];
  }
  return true;
}
// Voice, tones when too fast: the voice rate r that fits a phrase that takes b s (at rate 1) in the time it has (s): r, faster (up to 1.5×), or 0 = too long to say
function rateToFit(b, r, avail) {
  const room = avail - VLAT - 0.05;
  if (!b) return r;
  if (room <= 0) return 0;
  const need = b / room;
  return need <= r ? r : need <= r * 1.5 ? Math.min(r * 1.5, need * 1.03) : 0;
}
const vSlow = (v, time) => v > time + 0.2; // noticeably longer to say than the time it gets
const lnorm = (l) => (l || '').toLowerCase().replace('_', '-');
/* built-in spoken words in the voice language (exercise names, cues and combos are spoken as you typed them) */
const VPH = {
  en: {
    'Get ready': 'Get ready',
    'Next round': 'Next round',
    'Next block': 'Next block',
    tapgo: 'Tap when ready',
    Rest: 'Rest',
    'Round rest': 'Round rest',
    reps: 'reps',
    fight: 'Fight!',
    halfway: 'Halfway',
    ten: 'Ten seconds',
    done: 'Done. Great work!',
    sec: 'seconds',
    min1: 'minute',
    min: 'minutes',
  },
  nl: {
    'Get ready': 'Maak je klaar',
    'Next round': 'Volgende ronde',
    'Next block': 'Volgend blok',
    tapgo: 'Tik als je klaar bent',
    Rest: 'Rust',
    'Round rest': 'Rust tussen rondes',
    reps: 'herhalingen',
    fight: 'Vecht!',
    halfway: 'Halverwege',
    ten: 'Nog tien seconden',
    done: 'Klaar. Goed gedaan!',
    sec: 'seconden',
    min1: 'minuut',
    min: 'minuten',
  },
  es: {
    'Get ready': 'Prepárate',
    'Next round': 'Siguiente ronda',
    'Next block': 'Siguiente bloque',
    tapgo: 'Toca cuando estés listo',
    Rest: 'Descanso',
    'Round rest': 'Descanso entre rondas',
    reps: 'repeticiones',
    fight: '¡A pelear!',
    halfway: 'Mitad',
    ten: 'Diez segundos',
    done: 'Terminado. ¡Buen trabajo!',
    sec: 'segundos',
    min1: 'minuto',
    min: 'minutos',
  },
  de: {
    'Get ready': 'Mach dich bereit',
    'Next round': 'Nächste Runde',
    'Next block': 'Nächster Block',
    tapgo: 'Tippe, wenn du bereit bist',
    Rest: 'Pause',
    'Round rest': 'Rundenpause',
    reps: 'Wiederholungen',
    fight: 'Kämpfen!',
    halfway: 'Halbzeit',
    ten: 'Zehn Sekunden',
    done: 'Fertig. Gut gemacht!',
    sec: 'Sekunden',
    min1: 'Minute',
    min: 'Minuten',
  },
  fr: {
    'Get ready': 'Prépare-toi',
    'Next round': 'Round suivant',
    'Next block': 'Bloc suivant',
    tapgo: 'Touche quand tu es prêt',
    Rest: 'Repos',
    'Round rest': 'Repos entre les rounds',
    reps: 'répétitions',
    fight: 'Combat !',
    halfway: 'Mi-parcours',
    ten: 'Dix secondes',
    done: 'Terminé. Bon travail !',
    sec: 'secondes',
    min1: 'minute',
    min: 'minutes',
  },
};
function phraseIn(lang, k) {
  const t = VPH[lnorm(lang).split('-')[0]] || VPH.en;
  return t[k] ?? VPH.en[k] ?? k;
}
function sayDurIn(d, lang) {
  d = Math.max(0, Math.round(d));
  const m = Math.floor(d / 60),
    x = d % 60;
  return m ? `${m} ${phraseIn(lang, m === 1 ? 'min1' : 'min')}${x ? ' ' + x : ''}` : `${x} ${phraseIn(lang, 'sec')}`;
}
const waitText = (s, lang) =>
  s.seq
    ? (s.label ? s.label + '. ' : '') + phraseIn(lang, 'tapgo')
    : `${phraseIn(lang, s.label)}. ${phraseIn(lang, 'tapgo')}`;
/* speakCounts: as set; secOf(t): s the voice needs to say t */
function planCounts(s, speakCounts, secOf) {
  const per = s.counts * s.tempo + s.repPause;
  let say = speakCounts,
    w = null;
  const fits = (t, slot) => {
    const v = secOf(t);
    if (v <= slot + 0.05) return true;
    if (!w || v - slot > w.v - w.slot) w = { t, v, slot };
    return false;
  };
  if (say === 'every') {
    let ok = true;
    if (s.counts > 1) {
      for (let k = 0; k < s.counts; k++)
        if (!fits(s.cues[k] || String(k + 1), s.tempo + (k === s.counts - 1 ? s.repPause : 0))) ok = false;
    } else ok = fits(String(s.reps), s.tempo + s.repPause);
    if (!ok) say = s.counts > 1 ? 'reps' : 'off';
  }
  if (say === 'reps' && !fits(String(s.reps), per)) say = 'off';
  return { say, w };
}
export {
  rk,
  measuredAt,
  phraseBody,
  fitVoice,
  voiceSecOf,
  learnVoice,
  rateToFit,
  vSlow,
  lnorm,
  phraseIn,
  sayDurIn,
  waitText,
  planCounts,
};
