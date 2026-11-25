/* Problem reports: the text of a report (version, browser, recent errors) and the email and GitHub issue links that
   carry it. Nothing here sends anything: the user's mail app or GitHub opens with the report and they decide.
   Never put routines, history or account details in a report. */

export const REPORT_EMAIL = 'hello@punchpace.app';
export const ISSUE_NEW = 'https://github.com/agepoor/repflow/issues/new';
export const MAX_ERRORS = 5;
// some mail apps cut off longer mailto: links, and GitHub refuses very long issue links
export const MAX_URL = 1800;
const MAX_MSG = 200;

/* "Chrome 131 on Android 14" from a user agent; the full user agent goes in the report too, so a wrong guess is harmless */
export function shortBrowser(ua = '') {
  const v = (re) => (ua.match(re) || [])[1];
  // order matters: Edge, Samsung Internet and Opera also say Chrome; Chrome on iOS says Safari
  const browser =
    (v(/EdgA?\/(\d+)/) && 'Edge ' + v(/EdgA?\/(\d+)/)) ||
    (v(/SamsungBrowser\/(\d+)/) && 'Samsung Internet ' + v(/SamsungBrowser\/(\d+)/)) ||
    (v(/OPR\/(\d+)/) && 'Opera ' + v(/OPR\/(\d+)/)) ||
    (v(/CriOS\/(\d+)/) && 'Chrome ' + v(/CriOS\/(\d+)/)) ||
    (v(/FxiOS\/(\d+)/) && 'Firefox ' + v(/FxiOS\/(\d+)/)) ||
    (v(/Firefox\/(\d+)/) && 'Firefox ' + v(/Firefox\/(\d+)/)) ||
    (v(/Chrome\/(\d+)/) && 'Chrome ' + v(/Chrome\/(\d+)/)) ||
    (/Safari\//.test(ua) && v(/Version\/(\d+(?:\.\d+)?)/) && 'Safari ' + v(/Version\/(\d+(?:\.\d+)?)/)) ||
    'Unknown browser';
  const ios = v(/(?:iPhone|iPad|iPod).*? OS (\d+(?:_\d+)?)/);
  const os =
    (v(/Android (\d+(?:\.\d+)?)/) && 'Android ' + v(/Android (\d+(?:\.\d+)?)/)) ||
    (ios && (/iPad/.test(ua) ? 'iPadOS ' : 'iOS ') + ios.replace('_', '.')) ||
    (/Windows/.test(ua) && 'Windows') ||
    (/CrOS/.test(ua) && 'ChromeOS') ||
    (/Mac OS X/.test(ua) && 'macOS') ||
    (/Linux/.test(ua) && 'Linux') ||
    '';
  return os ? `${browser} on ${os}` : browser;
}

/* an error as the report shows it: the message cut to MAX_MSG characters, and addresses cut down to the file name, so
   nothing from the page's address (e.g. the #… that carries a device's data to punchpace.app) gets in */
export function errorLine({ message = '', file = '', line = 0, at = 0 }, now) {
  const strip = (s) => String(s).replace(/\b(?:https?|blob|chrome-extension):\/\/[^\s)'"]*/g, (u) => fileName(u));
  let m = strip(message).replace(/\s+/g, ' ').trim() || 'Unknown error';
  if (m.length > MAX_MSG) m = m.slice(0, MAX_MSG - 1) + '…';
  const where = file ? ` (${fileName(file)}${line ? ':' + line : ''})` : '';
  return `${m}${where}, ${ago(now - at)}`;
}
const fileName = (u) => String(u).split(/[?#]/)[0].split('/').pop() || 'page';
function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

/* the details of a report, as lines; errors newest first */
export function details({ version, ua, installed, screen, lang, errors = [], now }) {
  const errs = errors.slice(-MAX_ERRORS).reverse();
  return {
    version: version || 'unknown',
    browser: `${shortBrowser(ua)} · ${installed ? 'installed app' : 'browser tab'}`,
    lines: [
      `Version: ${version || 'unknown'}`,
      `Browser: ${shortBrowser(ua)}`,
      `Opened as: ${installed ? 'installed app' : 'browser tab'}`,
      `Screen: ${screen || 'unknown'} · language: ${lang || 'unknown'}`,
      `User agent: ${ua || 'unknown'}`,
    ],
    errors: errs.map((e) => errorLine(e, now)),
  };
}

const errorBlock = (errs) =>
  errs.length ? ['Recent errors:', ...errs.map((e) => '- ' + e)] : ['Recent errors: none since the app opened'];

/* the report as plain text, for the "What's in it" preview and the email */
export const reportText = (d) => [...d.lines, '', ...errorBlock(d.errors)].join('\n');

/* drops the oldest errors until the link fits in MAX_URL; the rest of the report always fits */
function fit(build, d) {
  let errs = d.errors;
  for (;;) {
    const url = build({ ...d, errors: errs });
    if (url.length <= MAX_URL || !errs.length) return url;
    errs = errs.slice(0, -1);
  }
}

export function mailtoUrl(d) {
  return fit((x) => {
    const body = ['What happened?', '', '', '', '---', reportText(x)].join('\n');
    return (
      `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent('PunchPace problem report')}` +
      `&body=${encodeURIComponent(body)}`
    );
  }, d);
}

/* the "Something's wrong" issue form (.github/ISSUE_TEMPLATE/problem.yml), with its text fields filled in by id */
export function issueUrl(d) {
  return fit((x) => {
    const q = new URLSearchParams({
      template: 'problem.yml',
      version: x.version,
      browser: x.browser,
      more: [...errorBlock(x.errors), '', ...x.lines.slice(3)].join('\n'),
    });
    return `${ISSUE_NEW}?${q}`;
  }, d);
}
