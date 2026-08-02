import type { LabTest } from '../../../shared/types.js';
import { DERIVED_ZONE_PAIRS } from './lineage';

/** Derived rather than listed, so a further story needs no edit here. It depends on every derived
 *  pair's label ending in " score" — which is why `labels.test.ts` keeps one exact pin beside the
 *  loop over every definition. */
const SCORE_LABELS = new Map<string, string>(DERIVED_ZONE_PAIRS.flatMap((p) =>
  (['heel', 'forefoot'] as const).map((zone) =>
    [p[zone], `${p.label.replace(/ score$/, '')} ${zone} score`] as const)));

/**
 * The header's first line. The four shoe fields that have cells carry no catalogue test behind
 * them, so they are named here; everything else is the catalogue's own name. Both renderings read
 * this, so a column is called the same thing on a phone and on a desktop before `shortLabel` gets
 * a say (docs/app.md §Columns and sorting).
 */
export function columnLabel(key: string, test: LabTest | undefined): string {
  // Neither is ever a column — the table renders both itself — but `name`'s header is a real sort
  // control and the ordering line names either of them, so each string keeps one home like the
  // fields below it (docs/app.md §Columns and sorting).
  if (key === 'name') return 'Shoe';
  if (key === 'brand') return 'Brand';
  if (key === 'releasedAt') return 'Released';
  // Named for whose it is: our own score sits beside it now (docs/app.md §Table presentation).
  if (key === 'score') return 'RunRepeat Score';
  if (key === 'msrpGbp') return 'Price';
  if (key === 'plate') return 'Plate';
  const score = SCORE_LABELS.get(key);
  if (score) return score;
  return test?.name ?? key;
}

/**
 * Mobile column headers get ~49px of text at the six-column bound, measured at the narrowest
 * common phone (360px) rather than the 375px the design was drawn at. Only names whose widest
 * word exceeds that are shortened; most keep their real name. `Outsole wear` is the one entry
 * that is not a length fix — the test is Dremel dent depth in mm, so "durability" contradicts
 * its own units (docs/app.md §Columns and sorting).
 */
export const SHORT_LABELS: Record<string, string> = {
  breathability: 'Airflow', 'breathability-25': 'Airflow',
  'heel-padding-durability': 'Heel pad durab.',
  'toe-guard-durability': 'Toe guard durab.',
  'outsole-durability': 'Outsole wear',
  'outsole-thickness': 'Outsole depth', 'insole-thickness': 'Insole depth',
  stiffness: 'Stiffness', 'flexibility-stiffness': 'Stiffness',
  'difference-in-midsole-softness-in-cold': 'Cold softness Δ',
  'difference-in-stiffness-in-cold': 'Cold stiffness Δ',
  'midsole-width-in-the-forefoot': 'Forefoot midsole width',
  'midsole-width-in-the-heel': 'Heel midsole width',
  'midsole-softness-in-the-forefoot': 'Forefoot softness',
  'midsole-softness-in-the-forefoot-22': 'Forefoot softness',
  'removable-insole': 'Remv. insole', 'reflective-elements': 'Hi-vis',
  'secondary-foam-softness': '2nd foam softness', 'secondary-foam-softness-22': '2nd foam softness',
  'shock-absorption-heel': 'Heel shock', 'shock-absorption-forefoot': 'Forefoot shock',
  // Not a catalogue test: "RunRepeat" alone is 56.8px against the 48px bound.
  score: 'RR score',
  'sweat-evaporated': 'Sweat evap.', insulation: 'Warmth',
  // Marginal against the bound once headroom is allowed.
  'outsole-hardness': 'Outsole firmness',
  // Two different tests carry the upstream name "Forefoot traction" and are NOT a superseded
  // pair, so both can be on screen at once. The stop-traction one takes a distinct label.
  'forefoot-traction-stop': 'Forefoot stop',
};

/**
 * 49px is the real text width inside the 53px column at the six-column bound on a 360px phone —
 * 53px less the 2px of `th` padding each side. The column narrowed because Inter Tight is ~10%
 * narrower than the face this was first measured against (docs/app.md §Columns and sorting). The
 * guard runs a pixel under, because CHAR_PX sums approximate the browser to about ±1px.
 */
export const MAX_LABEL_PX = 48;

/**
 * Per-character advance widths for **Inter Tight 600 at 12px with -0.02em tracking**, produced by
 * `app/scripts/measure-label-widths.mjs`. Regenerate with that script if the header face, size,
 * weight or tracking ever changes — every number here, `FALLBACK_PX` included, is specific to all
 * four.
 *
 * Self-hosting the face is what makes this table meaningful everywhere: `system-ui` resolved to a
 * different face on every OS, so the widths were only ever true on the machine that measured them.
 *
 * `Δ` is the exception, and stays one: it is outside the latin subset the app ships, so the browser
 * falls back for that glyph and this number is a `system-ui` measurement. It is here because two
 * short labels use it, and it is approximate for the same reason the whole table used to be.
 */
const CHAR_PX: Record<string, number> = {
  a: 5.76, b: 6.76, c: 6.76, d: 6.76, e: 6.76, f: 3.76, g: 6.76, h: 6.76, i: 2.76, j: 2.76,
  k: 5.76, l: 2.76, m: 9.76, n: 6.76, o: 6.76, p: 6.76, q: 6.76, r: 3.76, s: 5.76, t: 3.76,
  u: 6.76, v: 5.76, w: 9.76, x: 5.76, y: 5.76, z: 5.76,
  A: 7.76, B: 6.76, C: 7.76, D: 7.76, E: 6.76, F: 6.76, G: 8.76, H: 7.76, I: 2.76, J: 5.76,
  K: 7.76, L: 5.76, M: 9.76, N: 7.76, O: 8.76, P: 6.76, Q: 8.76, R: 6.76, S: 6.76, T: 6.76,
  U: 7.76, V: 7.76, W: 11.76, X: 7.76, Y: 7.76, Z: 6.76,
  '0': 7.76, '1': 4.76, '2': 6.76, '3': 6.76, '4': 7.76, '5': 6.76, '6': 6.76, '7': 5.76,
  '8': 6.76, '9': 6.76,
  ' ': 2.76, '.': 2.76, ',': 3.76, '/': 3.76, '(': 3.76, ')': 3.76, '%': 9.76, '-': 4.76,
  'Δ': 7.81,
};
const FALLBACK_PX = 12;

const textPx = (s: string): number =>
  [...s].reduce((sum, ch) => sum + (CHAR_PX[ch] ?? FALLBACK_PX), 0);

export function widestWordPx(label: string): number {
  return Math.max(...label.split(/\s+/).map(textPx));
}

/**
 * Three, not two: six catalogue names need a third line at the 48px bound and keep their upstream
 * wording because they are allowed one — `Energy return heel` and `forefoot`, both generations of
 * `Midsole softness in cold`, `Heel counter stiffness` and `Lateral stability test`. A two-line
 * cap would put all six in `SHORT_LABELS`. Beyond three nothing improves, because what is left is
 * word overflow rather than line count — and the header is sticky, so a fourth line is paid once by
 * every screen (docs/app.md §Columns and sorting).
 */
export const MAX_LABEL_LINES = 3;

/** The browser's own greedy wrap, which is what decides how tall the sticky header stands. */
export function lineCount(label: string, maxPx: number = MAX_LABEL_PX): number {
  const space = textPx(' ');
  let lines = 1;
  let width = 0;
  for (const word of label.split(/\s+/)) {
    const w = textPx(word);
    if (width === 0) width = w;
    else if (width + space + w <= maxPx) width += space + w;
    else { lines += 1; width = w; }
  }
  return lines;
}

export function shortLabel(key: string, fallback: string): string {
  return SHORT_LABELS[key] ?? fallback;
}

/**
 * One number, because the header's second line is set in a monospaced face: **JetBrains Mono 400 at
 * 12px with -0.02em**, which is `.h-units` in `ShoeTableMobile.svelte` declaring neither the size
 * nor the tracking and inheriting both from the `th` button above it. That makes it a third table
 * rather than a reuse of either neighbour — `CHAR_PX` is a different face and weight, and the
 * desktop's `UNITS_ADVANCE_PX` (`fit.ts`) is this face at this size with no tracking, which is 7.
 * `app/scripts/measure-label-widths.mjs` produces all three, over a units alphabet of its own:
 * upstream's `HC`/`HA`/`SA`/`AC`/`BR`/`Nm`/`°` and the five the app derives are not the character
 * census a name or a phrase takes.
 */
const UNITS_CHAR_PX = 6.76;

/**
 * The same 49px of header text `MAX_LABEL_PX` bounds, and a pixel wider than it, because a uniform
 * advance times a length needs none of the slack a `CHAR_PX` sum does. What it does have to absorb
 * is the engines' 0.21px per character: at the seven characters this buys, the widest of them
 * renders 48.8px against the 49.33px the column measures.
 *
 * An eighth character is what it exists to stop, and the cost is not a truncation: the units line
 * has no third line to grow into and no `SHORT_LABELS` to fall back on, so it wraps and doubles a
 * header that is pinned and therefore paid by every screen (docs/app.md §Table presentation).
 */
export const MAX_UNITS_PX = 49;

/**
 * The whole string, not its longest word: a units line that wraps at all is the failure, so there
 * is no per-word bound to take. `.length` stands in for a per-character table because every glyph
 * the units alphabet holds measures the same — a character outside the shipped mono subset would
 * fall back to a proportional face and be mismodelled here, which is the caveat `Δ` carries in
 * `CHAR_PX` above.
 */
export function unitsPx(units: string): number {
  return units.length * UNITS_CHAR_PX;
}

/**
 * The noun a categorical reading takes on the phone's name line, where it is prose rather than the
 * 49px of text in a 53px header — so `SHORT_LABELS` is the wrong source ("Remv. insole" reads as
 * an abbreviation in a sentence) and so is the catalogue name, because "Tongue: gusset type"
 * already carries a colon and the line adds another (docs/app.md §Categorical columns).
 *
 * Only the tests that need one are listed; anything else falls back to its catalogue name, which
 * is wordy but never wrong.
 */
const CHIP_LABELS: Record<string, string> = {
  'tongue-gusset-type': 'Gusset',
  'heel-tab': 'Heel tab',
};

export function chipLabel(key: string, test: LabTest | undefined): string {
  return CHIP_LABELS[key] ?? columnLabel(key, test);
}
