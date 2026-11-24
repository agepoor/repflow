/* Week view: this week (Mon–Sun) at a glance, or the usual week from the days set in each routine (Schedule). */
import { does } from './actions.js';
import { iconKey, logMode } from '../core/routine.js';
import { DN, onDay, rDays } from '../core/schedule.js';
import { build } from '../core/steps.js';
import { dayAdd, dk, kd, weekStart } from '../core/time.js';
import { COLORS, esc, plural, svgi } from './html.js';
// The shared data keeps its short names for now (H: history, R: routines): they are renamed in storage.js and every
// module that uses them at once, in a later step of #71.
import { H, R } from './storage.js';
import { show } from './views.js';

/* This week: what is planned each day, one-time additions (dashed), done (✓) and skipped (struck through), with the
   planned time per day. Tap a routine to edit it; its Back returns here. */
let weekMode = localStorage.getItem('rf2_wkm') || 'week'; // on this device: 'week' (this week) or 'plan' (Schedule)
function wkMode(mode) {
  weekMode = mode;
  try {
    localStorage.setItem('rf2_wkm', mode);
  } catch (e) {}
  renderWeek();
}
function openWeek() {
  renderWeek();
  show('week');
}
function renderWeek() {
  const today = dk(Date.now()),
    active = R.filter((r) => !r.archived),
    planMode = weekMode === 'plan',
    anytime = anytimeSection(
      active.filter((r) => !rDays(r).length),
      planMode,
    );
  weekBody.innerHTML =
    modeSwitch(planMode) + (planMode ? usualWeek(active, today, anytime) : thisWeek(active, today, anytime));
}

// estimated length of a routine, in s
const routineSec = (r) => build(r).reduce((sum, step) => sum + (step.dur || 0), 0);
// a length in s as "25 min" or "1 h 5 min", at least 1 min
function hoursMinutes(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ' ' + (min % 60) + ' min' : ''}`;
}
// a routine in the week. classes: its state (done, add, sk, nl); after: what follows the name (✓, ×2, No logging icon)
function weekChip(r, classes, after) {
  return (
    `<button class="wchip ${classes}" style="--c:${COLORS[r.color]}" ${does('click:openEditor', r.id, 'week')}>` +
    svgi(iconKey(r), 14) +
    `<span>${esc(r.name)}</span>` +
    after +
    '</button>'
  );
}
const REST_DAY = '<span class="muted wrest">Rest day</span>';
const doneTime = (sec) => `<span class="wdn">${svgi('check', 12, 3)}${hoursMinutes(sec)} done</span>`;

// This week | Schedule
function modeSwitch(planMode) {
  const button = (mode, label) =>
    `<button class="${(mode === 'plan') === planMode ? 'on' : ''}" ${does('click:wkMode', mode)}>${label}</button>`;
  return `<div class="wseg">${button('week', 'This week')}${button('plan', 'Schedule')}</div>`;
}
// routines without days, under both views; This week marks the ones with No logging
function anytimeSection(anytime, planMode) {
  if (!anytime.length) return '';
  const chips = anytime.map((r) => weekChip(r, '', !planMode && logMode(r) === 'off' ? svgi('nolog', 14) : ''));
  return (
    '<div class="sech" style="margin-top:var(--space-5)">Anytime</div>' + `<div class="wl">${chips.join('')}</div>`
  );
}

/* Schedule: the usual week, only from the days set in each routine (no skips, additions or done workouts) */
function usualWeek(active, today, anytime) {
  const todayWeekday = kd(today).getDay();
  let count = 0,
    totalSec = 0,
    rows = '';
  for (let i = 0; i < 7; i++) {
    const weekday = (i + 1) % 7, // Monday first
      planned = active.filter((r) => rDays(r).includes(weekday)),
      sec = planned.reduce((sum, r) => sum + routineSec(r), 0);
    count += planned.length;
    totalSec += sec;
    rows +=
      `<div class="wday plan${weekday === todayWeekday ? ' today' : ''}">` +
      `<div class="wd"><b>${DN[weekday]}</b></div>` +
      '<div class="wl">' +
      (planned.map((r) => weekChip(r, '', '')).join('') || REST_DAY) +
      (sec ? `<span class="wt muted">~${hoursMinutes(sec)}</span>` : '') +
      '</div>' +
      '</div>';
  }
  const total = `${plural(count, 'workout')}${totalSec ? `, ~${hoursMinutes(totalSec)}` : ''}`;
  return (
    `<p class="muted wsum"><span>Usual week</span> · <span>${total}</span></p>` +
    `<div class="card wcard">${rows}</div>` +
    anytime +
    '<p class="muted wleg">Only the days set in each routine, without skips, additions or done workouts. ' +
    'Tap a routine to change its days.</p>'
  );
}

/* This week, per day: planned = scheduled on that weekday or added once, minus skipped (estimated length, done or not);
   done = workouts logged that day (actual time); a workout done on a day it wasn't planned shows as an extra (dashed)
   and counts only as done */
function thisWeek(active, today, anytime) {
  const start = weekStart(today),
    week = { planned: 0, plannedSec: 0, done: 0, doneSec: 0, skipped: 0, noLog: 0 };
  let rows = '';
  for (let i = 0; i < 7; i++) {
    const key = dayAdd(start, i),
      day = weekDay(
        active,
        key,
        H.filter((h) => dk(h.ts) === key),
      );
    for (const total in week) week[total] += day[total];
    rows += weekDayRow(key, today, day);
  }
  const date = (key) => kd(key).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  const summary = [
    `${date(start)} – ${date(dayAdd(start, 6))}`,
    `${week.planned} planned${week.plannedSec ? `, ~${hoursMinutes(week.plannedSec)}` : ''}`,
    week.done && `<span class="wdn">${svgi('check', 12, 3)}${week.done} done, ${hoursMinutes(week.doneSec)}</span>`,
    week.skipped && `${week.skipped} skipped`,
  ].filter(Boolean);
  return (
    `<p class="muted wsum">${summary.map((part) => `<span>${part}</span>`).join(' · ')}</p>` +
    `<div class="card wcard">${rows}</div>` +
    anytime +
    weekKey(week.noLog > 0) +
    '<p class="muted wleg">' +
    '<b>Planned</b>: estimated length of the scheduled and added routines, done or not. ' +
    "Skipped ones don't count.<br>" +
    '<b>Done</b>: actual time of the workouts logged that day, extras included.' +
    (week.noLog ? ' Routines with No logging are never marked done.' : '') +
    '<br>Dashed = not on its usual days: added once, or done as an extra. Tap a routine to change its days.' +
    '</p>'
  );
}
// one day of this week: a chip for each routine planned, done or skipped that day (planned first, then extras, then
// skipped), and the counts and times the week adds up
function weekDay(active, key, workouts) {
  const weekday = kd(key).getDay(),
    day = { planned: 0, plannedSec: 0, done: 0, doneSec: 0, skipped: 0, noLog: 0 },
    chips = { planned: [], extra: [], skipped: [] };
  active.forEach((r) => {
    const onItsDays = rDays(r).includes(weekday),
      done = workouts.filter((h) => h.rid === r.id),
      skipped = onItsDays && onDay(r, 'skip', key) && !done.length,
      planned = (onItsDays || onDay(r, 'add', key)) && !skipped;
    if (!planned && !skipped && !done.length) return;
    const noLog = logMode(r) === 'off';
    if (noLog) day.noLog++;
    if (planned) {
      day.planned++;
      day.plannedSec += routineSec(r);
    }
    if (skipped) day.skipped++;
    day.done += done.length;
    day.doneSec += done.reduce((sum, h) => sum + (h.dur || 0), 0);
    const classes = [done.length && 'done', !onItsDays && 'add', skipped && 'sk', noLog && !done.length && 'nl'];
    const chip = weekChip(r, classes.filter(Boolean).join(' '), chipMark(done.length, noLog));
    (skipped ? chips.skipped : planned ? chips.planned : chips.extra).push(chip);
  });
  day.chips = [...chips.planned, ...chips.extra, ...chips.skipped].join('');
  return day;
}
// after a routine's name: ✓ when done (×2 when done twice), else the No logging icon if it has that
function chipMark(doneCount, noLog) {
  if (doneCount) return svgi('check', 14, 3) + (doneCount > 1 ? `<small>×${doneCount}</small>` : '');
  return noLog ? svgi('nolog', 14) : '';
}
function weekDayRow(key, today, day) {
  const date = kd(key),
    when = key === today ? ' today' : key < today ? ' past' : '',
    times = [day.plannedSec && `~${hoursMinutes(day.plannedSec)} planned`, day.doneSec && doneTime(day.doneSec)];
  const time = times.filter(Boolean).join(' · ');
  return (
    `<div class="wday${when}">` +
    `<div class="wd"><b>${DN[date.getDay()]}</b><span>${date.getDate()}</span></div>` +
    '<div class="wl">' +
    (day.chips || REST_DAY) +
    (time ? `<span class="wt muted">${time}</span>` : '') +
    '</div>' +
    '</div>'
  );
}
// what each kind of chip means; No logging only when this week has such a routine
function weekKey(withNoLog) {
  const kinds = [
    ['', 'Scheduled'],
    ['add', 'Added once'],
    ['done', 'Done', svgi('check', 13, 3)],
    ['miss', 'Not done (past)'],
    ['sk', 'Skipped'],
  ];
  if (withNoLog) kinds.push(['nl', 'No logging', svgi('nolog', 13)]);
  const chip = ([classes, label, icon = '']) => `<span class="wchip ${classes}"><span>${label}</span>${icon}</span>`;
  return `<div class="wkey">${kinds.map(chip).join('')}</div>`;
}
export { wkMode, openWeek, renderWeek };
