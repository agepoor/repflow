/* History & streaks, import/export. */
import { does } from './actions.js';
import { mig, norm, uid } from '../core/routine.js';
import { streakOf } from '../core/schedule.js';
import { dayAdd, dk, kd, mmss, weekStart } from '../core/time.js';
import { COLORS, esc, nsTag, plural, svgi, tint } from './html.js';
// The shared data keeps its short names for now (H: history, HDEL: removed workouts, R: routines, S: settings):
// they are renamed in storage.js and every module that uses them at once, in a later step of #71.
import { H, HDEL, R, S, persist, saveH, setH, setS } from './storage.js';
import { scheduleSync } from './sync.js';
import { renderList, show } from './views.js';

function streaks(list = H) {
  return streakOf(list);
}
function logWorkout(e) {
  const before = streaks().best;
  if (!H.some((h) => h.id === e.id) && !HDEL[e.id]) {
    H.push(e);
    saveH();
    scheduleSync();
  }
  const st = streaks();
  return { ...st, newBest: st.cur > 1 && st.cur > before };
}
function updHistBtn() {
  const b = document.getElementById('histBtn');
  if (!b) return;
  const st = streaks();
  b.classList.toggle('on', st.today);
  b.innerHTML = svgi('flame', 20) + (st.cur ? `<b>${st.cur}</b>` : '');
  b.title = st.cur ? `${st.cur}-day streak · History` : 'History';
}
function openHist() {
  renderHist();
  show('hist');
}
function delHist(id) {
  if (!confirm('Remove this workout from your history?')) return;
  HDEL[id] = Date.now();
  setH(H.filter((h) => h.id !== id));
  saveH();
  scheduleSync();
  renderHist();
  updHistBtn();
}

/* history: streaks and counts, the last weeks as a heatmap, and the workouts, newest first */
function renderHist() {
  const today = dk(Date.now());
  histBody.innerHTML =
    histStats(today) +
    heatmap(today) +
    (H.length
      ? ''
      : '<p class="muted" style="text-align:center;margin-top:var(--space-6)">' +
        'No workouts yet. Finish a routine and it shows up here.</p>') +
    workoutList(today);
}
function histStats(today) {
  const streak = streaks(),
    thisWeek = H.filter((h) => dk(h.ts) >= weekStart(today)).length,
    stat = (value, label, classes = '') => `<div class="hstat${classes}"><b>${value}</b><span>${label}</span></div>`;
  return (
    '<div class="hstats">' +
    stat(svgi('flame', 20) + streak.cur, 'day streak', ' fire') +
    stat(streak.best, 'best streak') +
    stat(thisWeek, 'this week') +
    stat(H.length, 'workouts') +
    '</div>'
  );
}
const HEAT_WEEKS = 17;
// a square per day, darker with more workouts; days with only Log only workouts (not counted for streaks) apart
function heatmap(today) {
  const perDay = {},
    countsForStreak = {};
  H.forEach((h) => {
    const key = dk(h.ts);
    perDay[key] = (perDay[key] || 0) + 1;
    if (h.streak !== false) countsForStreak[key] = true;
  });
  const start = dayAdd(weekStart(today), -(HEAT_WEEKS - 1) * 7);
  let cells = '',
    logOnlyDays = 0;
  for (let i = 0; i < HEAT_WEEKS * 7; i++) {
    const key = dayAdd(start, i),
      count = perDay[key] || 0,
      logOnly = count > 0 && !countsForStreak[key];
    if (logOnly) logOnlyDays++;
    cells += heatCell(key, today, count, logOnly);
  }
  const minutes = Math.round(H.reduce((sum, h) => sum + (h.dur || 0), 0) / 60),
    weekdays = ['M', '', 'W', '', 'F', '', 'S'].map((d) => `<span>${d}</span>`).join(''),
    levels = '<i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i>';
  return (
    '<div class="card">' +
    '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--space-3)">' +
    `<b>Last ${HEAT_WEEKS} weeks</b><span class="muted fs-sm">${minutes} min total</span>` +
    '</div>' +
    `<div class="heatwrap"><div class="heatdays">${weekdays}</div><div class="heat">${cells}</div></div>` +
    `<div class="legend">Less ${levels} More${logOnlyDays ? '<i class="lo"></i> Log only' : ''}</div>` +
    '</div>'
  );
}
function heatCell(key, today, count, logOnly) {
  const level = key > today ? 'fut' : logOnly ? 'lo' : count >= 3 ? 'l3' : count === 2 ? 'l2' : count ? 'l1' : '';
  const title = `${key}: ${plural(count, 'workout')}${logOnly ? ' (log only)' : ''}`;
  return `<i class="${level}${key === today ? ' today' : ''}" title="${title}"></i>`;
}
// the last 100 workouts, under a heading per day
function workoutList(today) {
  const yesterday = dayAdd(today, -1),
    dayName = (key) =>
      key === today
        ? 'Today'
        : key === yesterday
          ? 'Yesterday'
          : kd(key).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
  let html = '',
    lastDay = '';
  [...H]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 100)
    .forEach((h) => {
      const key = dk(h.ts);
      if (key !== lastDay) {
        lastDay = key;
        html += `<div class="hday">${dayName(key)}</div>`;
      }
      html += workoutRow(h);
    });
  return html;
}
function workoutRow(h) {
  const color = COLORS[h.color] || COLORS.blue,
    bits = [
      new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mmss(h.dur),
      plural(h.rounds, 'round'),
    ];
  if (h.reps) bits.push(`${h.reps} reps`);
  if (h.calls) bits.push(`${h.calls} combos`);
  if (h.streak === false) bits.push(nsTag('log only', 'Logged, not counted for streak', 12));
  return (
    '<div class="hitem">' +
    `<div class="dot" style="background:${tint(color, 15)};color:${color}">${svgi(h.icon || 'activity', 18)}</div>` +
    `<div class="info"><b>${esc(h.name)}</b><span>${bits.join(' · ')}</span></div>` +
    `<button class="ghost icon" ${does('click:delHist', h.id)} title="Remove"` +
    ' style="padding:var(--space-2);color:var(--text-muted)">' +
    svgi('trash', 16) +
    '</button>' +
    '</div>'
  );
}

function exportAll() {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(
    new Blob([JSON.stringify({ routines: R, settings: S, history: H }, null, 2)], { type: 'application/json' }),
  );
  link.download = 'punchpace-routines.json';
  link.click();
}
function importAll(input) {
  const file = input.files[0];
  if (!file) return;
  file.text().then((text) => {
    try {
      const data = JSON.parse(text);
      const list = data.routines || data;
      (Array.isArray(list) ? list : [list]).forEach((r) => {
        if (!r || typeof r !== 'object') return;
        r = mig(r);
        r.id = uid();
        r = norm({ ...r, blocks: (r.blocks || []).map((b) => ({ ...b, id: uid() })) });
        delete r.upd;
        R.push(r);
      });
      if (data.settings) setS({ ...S, ...data.settings });
      if (Array.isArray(data.history)) {
        const ids = new Set(H.map((h) => h.id));
        data.history.forEach((h) => {
          if (h && h.id && !ids.has(h.id) && !HDEL[h.id]) H.push(h);
        });
        H.sort((a, b) => a.ts - b.ts);
        saveH();
      }
      persist();
      renderList();
    } catch (e) {
      alert('Invalid file');
    }
  });
  input.value = '';
}
export { streaks, logWorkout, updHistBtn, openHist, delHist, renderHist, exportAll, importAll };
