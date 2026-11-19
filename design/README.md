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
- Touch targets are at least **44px** (48px where there is room). Not all controls meet this yet: see #37.

**Classes instead of inline styles**

Styles that repeat in the HTML templates are classes, not `style="…"`: `.text`, `.text-muted`, `.fs-sm`, `.m-0`, `.mt-3`, `.mb-2`, `.mb-3`, `.span-all`, `.w-auto`, `.tap`, `.dim`, `.link` (at the end of `styles.css`). A one-off inline style is fine, but its sizes come from the tokens too.

## Changing a token

1. Edit `tokens.json` (add a primitive if it's a new colour, then point a theme token at it).
2. `npm run tokens`, then `npm run check`: the contrast tests tell you if a colour pair became hard to read.
3. Check the screens it touches on a phone-sized screen.
