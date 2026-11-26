# Design tokens and rules

PunchPace's colours, spacing, type sizes, radii and animation durations live in one file, [`tokens.json`](tokens.json), in the [W3C Design Tokens format](https://www.designtokens.org/), so the web app and a future native app can read the same values.

## How it fits together

- `tokens.json` has two layers:
  - **primitive**: the palette (`ink`, `paper`, `orange`, …) and nothing else. Only the theme uses these.
  - **theme**: what each value is _for_ (`text-muted`, `surface-raised`, `step.rest`, `routine.blue`, `tone.jab`) and the scales (`space`, `fontSize`, `radius`, `duration`, `font`). The app only uses these.
- `npm run tokens` writes `tokens.css` (one CSS custom property per theme token). Edit `tokens.json`, never `tokens.css`; a test fails if they differ.
- CSS uses them as `var(--…)`: colours by name (`--text-muted`, `--routine-blue`, `--tone-jab`), the scales with a prefix (`--space-3`, `--fs-sm`, `--radius-md`, `--duration-fast`, `--font-display`).
- JS in `ui/` refers to tokens the same way (`var(--routine-blue)`, `toneColor(i)`, `tint(colour, 13)` for a see-through version). `core/` has no colours at all.

A light theme only needs other primitives under the same theme names.

## Rules

Tests in `test/tokens.test.js` check the ones marked ✓.

**Colour**

- ✓ No colour values in `core/`, `ui/` or `styles.css`: use a theme token. Exceptions: the `theme-color` meta tag and `manifest.webmanifest` can't use CSS variables, so they repeat `--bg` (checked to match).
- ✓ Text is at least **4.5:1** against what it sits on (WCAG AA), on the page, cards and raised cards. That's why there are separate text tokens for coloured text: `--accent-text` and `--danger-text` are a little lighter than the `--accent` and `--danger` fills.
- ✓ Text and icons on a bright fill (the accent, routine colours, step colours) use `--on-accent`.
- ✓ The focus ring (`--focus`) is at least **3:1** against every background.
- Meaning isn't carried by colour alone: done, skipped and errors also have an icon or text.
- Tints of a colour (a routine's icon circle, a move tag) are made with `color-mix()`, not by adding hex alpha to a colour.
- ✓ Each token is used somewhere; remove tokens that aren't.

**Spacing, type, shape, motion**

- Spacing is on a **4px grid** (`--space-1` = 4px … `--space-16` = 64px). `--space-half` (2px) is only for fine alignment, and 1px hairlines are fine. Sizes of components (a 44px button) are not spacing and can be any value.
- Type sizes come from the **type scale** (`--fs-xs` 12px … `--fs-3xl` 28px). Body text is 16px; 12px is only for captions and small uppercase labels. The big run-screen numbers scale with the screen (`clamp()`), so they're the exception.
- Radii: `--radius-sm` for tags, `-md` for buttons and inputs, `-lg` for cards and dialogs, `-pill` for chips, `-round` for circles.
- Animations use `--duration-fast` (press feedback), `-base` (movement) or `-slow` (progress).
- Touch targets are at least **44px** (`--size-target`; `--size-target-lg`, 48px, where there is room, like the run controls). Buttons, inputs and selects get this as a minimum height. A control that looks smaller (an icon, a colour swatch, the − / + in a field) keeps its look and gets the tap area from an invisible `::after` around it: add it to the list at the top of `styles.css`. `test/e2e/a11y.test.js` measures every control on every screen.
- ✓ The edge of a field (input, select, text area) uses `--border-control`, at least **3:1**, because it shows where to type. Cards and buttons keep the subtle `--border`.
- Don't dim text with `opacity`: it drops below 4.5:1 without the token test noticing. Use `--text-muted` instead; `test/e2e/a11y.test.js` checks the contrast of what's on screen.

**Classes instead of inline styles**

Styles that repeat in the HTML templates are classes, not `style="…"`: `.text`, `.text-muted`, `.fs-sm`, `.m-0`, `.mt-3`, `.mb-2`, `.mb-3`, `.span-all`, `.w-auto`, `.tap`, `.dim`, `.link` (at the end of `styles.css`). A one-off inline style is fine, but its sizes come from the tokens too.

## Voice and copy

The app is read at arm's length in the middle of a workout, so text is short and screens hold one decision at a time.

- **A coach, not a manual.** Short, plain, present tense, addressed to _you_: "Pick a pace you can hold for 3 rounds." Run-screen calls are imperative and terse: "Go go go", "Last one — finish strong".
- **Say what to do, not the jargon.** Step cues describe the movement: "Right knee: lift forward, swing out, down".
- **Sentence case** for buttons, labels and headings ("New routine", "Rest between rounds"). Uppercase comes from CSS (`text-transform` on section heads, the run screen's phase label, small captions), never typed in caps.
- **Separators:** a spaced middle dot `·` joins facts ("3 rounds · 6:30 · Mon Wed Fri"), `×` counts sets ("Boxing 3 × 3 min", "8 × 12"), an em dash marks an aside ("Burpees — max reps").
- **Times** are `m:ss` in fields and stats (`1:15`) and spelled out in hints ("1 min 15 s", `core/time.js`).
- **No emoji in the UI.** Use the stroke icons; old emoji routine icons are mapped to icons when a routine loads (`core/routine.js`).
- **Help is titled as the user's question** ("What is count length?") and answered in one or two sentences.
- **Errors say what happened and what to do:** "Could not save on this device (storage full or blocked). Export a JSON backup in Settings."

## Icons

- One flat stroke set (`IC` in `ui/html.js`, drawn by `svgi()`): 24px grid, stroke width 2, round caps and joins, no fill, `currentColor` so an icon takes its text colour. `play`, `pause`, `prev` and `next` use a filled shape.
- 20px by default, 14–18px in chips and compact rows, 22–30px on run controls.
- Routines pick from the twenty sport icons (`activity` … `bounce`, the first entries of `IC`). A new icon is drawn the same way: on the 24px grid, strokes only, no colours of its own.
- An icon next to a label sits before it, `--space-2` apart (`.ib`).

## Logo

- The mark is two interlocking italic Ps: the front P and the word in `--logo-word`, the rear P in `--logo-mark`. The header wordmark (`#appName`) is at most 214px wide.
- `icon.svg` is the mark on a `#252525` rounded square, for the favicon and other small places. The install icons in `icons/` show the same mark.
- The logo is made for dark backgrounds. Don't recolour it or put it on a light background; a light theme will need its own logo colours, via `--logo-word` and `--logo-mark`.
- The brand slash, a 4px `--accent` bar skewed −16° (`.sech::before`), marks section heads and echoes the italic logo. It is the only ornament.

## Changing a token

1. Edit `tokens.json` (add a primitive if it's a new colour, then point a theme token at it).
2. `npm run tokens`, then `npm run check`: the contrast tests tell you if a colour pair became hard to read.
3. Check the screens it touches on a phone-sized screen.
