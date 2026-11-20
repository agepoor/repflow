/* Buttons and fields say what they do with data-on="click:startRun" (and data-args, a JSON list of arguments)
   instead of inline onclick="…" code, because the Content Security Policy blocks inline code.
   One listener per event type on the document runs the named action.

   Listeners run in the capture phase, so an action runs before the element's own listeners, as inline handlers did
   (e.g. durIn updates a field's value before the editor's input listener reads it). Actions on the element and on its
   ancestors run from the inside out; an action that returns false stops the ones further out (instead of
   stopPropagation, which in the capture phase would also stop the element's own listeners). */
const ACTS = {};
const EVENTS = ['click', 'input', 'change', 'blur', 'toggle'];

/* register actions: fn(el, event, ...args) */
export function acts(o) {
  for (const [k, f] of Object.entries(o)) {
    if (ACTS[k]) throw new Error('Action registered twice: ' + k);
    ACTS[k] = f;
  }
}
/* register functions that only take the data-args (not the element or the event) */
export const plainActs = (o) =>
  acts(Object.fromEntries(Object.entries(o).map(([k, f]) => [k, (el, e, ...a) => f(...a)])));

/* the attributes for an element: does('click:startRun', r.id) or does('input:durInB blur:durOut', id, 'work') */
export function does(spec, ...args) {
  const a = args.length
    ? ` data-args="${JSON.stringify(args).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}"`
    : '';
  return `data-on="${spec}"${a}`;
}

function run(e) {
  for (let el = e.target; el && el.nodeType === 1; el = el.parentElement) {
    const spec = el.dataset.on;
    if (!spec) continue;
    const m = spec.split(' ').find((s) => s.startsWith(e.type + ':'));
    if (!m) continue;
    const name = m.slice(e.type.length + 1),
      f = ACTS[name];
    if (!f) {
      console.error('Unknown action: ' + name);
      continue;
    }
    if (f(el, e, ...(el.dataset.args ? JSON.parse(el.dataset.args) : [])) === false) return;
  }
}
export function initActions() {
  EVENTS.forEach((t) => document.addEventListener(t, run, true));
}
