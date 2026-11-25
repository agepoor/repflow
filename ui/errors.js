/* Keeps the last few errors of this page, for a problem report (Settings → About, core/report.js). In memory only:
   nothing is stored or sent, and they're gone when the app closes. Imported first by ui/main.js, so it listens before
   the other modules run. */
import { MAX_ERRORS } from '../core/report.js';

const ERRORS = [];
const keep = (e) => {
  ERRORS.push({ ...e, at: Date.now() });
  if (ERRORS.length > MAX_ERRORS) ERRORS.shift();
};
addEventListener(
  'error',
  (e) => {
    // an element that failed to load (an image, a script) has no message; its address says which
    if (!e.message && e.target && e.target !== window)
      return keep({ message: 'Failed to load ' + (e.target.src || e.target.href || e.target.tagName) });
    keep({ message: e.message || String(e.error), file: e.filename, line: e.lineno });
  },
  true,
);
addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  keep({ message: 'Unhandled: ' + (r && r.message ? r.message : String(r)) });
});

export const recentErrors = () => ERRORS.slice();
