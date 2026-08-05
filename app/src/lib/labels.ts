import type { LabTest } from '../../../shared/types.js';
import { DERIVED_ZONE_PAIRS } from './lineage';

/** Derived rather than listed, so a further story needs no edit here. It depends on every derived
 *  pair's label ending in " score" — which is why `labels.test.ts` keeps one exact pin beside the
 *  loop over every definition. */
const SCORE_LABELS = new Map<string, string>(DERIVED_ZONE_PAIRS.flatMap((p) =>
  (['heel', 'forefoot'] as const).map((zone) =>
    [p[zone], `${p.label.replace(/ score$/, '')} ${zone} score`] as const)));

const ZERO_WIDTH_BREAK = '\u200b';

/**
 * The header's first line. The four shoe fields that have cells carry no catalogue test behind
 * them, so they are named here; everything else is the catalogue's own name. Both renderings read
 * this, so a column is called the same thing on a phone and on a desktop before `shortLabel` gets
 * a say. A dropped catalogue slug authors its cross-engine hyphen breaks here too, so rendering and
 * width arithmetic receive one string (docs/app.md §Columns and sorting).
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
  return test?.name ?? key.replaceAll('-', `-${ZERO_WIDTH_BREAK}`);
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
 * `Δ` is the visible exception: it is outside the latin subset the app ships, so the browser falls
 * back for that glyph and this number is a `system-ui` measurement. U+200B is the structural one,
 * authored into a dropped slug by `columnLabel`; its zero advance keeps the marker from falling
 * through to the pessimistic unmeasured-character width.
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
  '\u200b': 0, 'Δ': 7.81,
};
const FALLBACK_PX = 12;

const textPx = (s: string): number =>
  [...s].reduce((sum, ch) => sum + (CHAR_PX[ch] ?? FALLBACK_PX), 0);

/**
 * Where this app is willing to say a line may break: **at a space, a tab, a line feed, or an
 * authored U+200B**, and nowhere else. The one home for that rule — `lineCount` below wraps with it,
 * `widestWordPx` below takes the widest token it yields, and `lib/fit.ts` measures both header words
 * and shoe names through it (docs/app.md §Table presentation).
 *
 * **A hyphen is deliberately NOT a break opportunity here, and that is over-reservation rather than
 * a claim about any engine.** Every engine does break at some hyphens, so the whole token is the
 * widest answer any of them can give and a model built on it can only ever be too wide. Modelling
 * which ones is the losing game: measured in all three engines, Chromium and WebKit break
 * `breathability-25`, `abc-12` and `10-12` alike, while Firefox implements UAX #14's numeric
 * context and leaves every one of them whole — and a rule tuned to any single engine puts the
 * model *under* another engine's min-content, which is a header hanging out of a declared column
 * rather than a column a few pixels wider than it needed to be. A dropped raw slug is the only
 * exception: `columnLabel` authors a zero-width break after its visible hyphens, so all three
 * engines and this splitter receive an explicit opportunity rather than guessing from `-`.
 *
 * **Splitting is the one half that can make the model narrow, so the separator set is measured
 * rather than named.** Not splitting only ever costs width. Splitting where an engine will not
 * break, or where it breaks but keeps the separator's own advance on the line, models a fragment of
 * a string the engine renders whole — unbounded in that string's length. So a character is in this
 * set only where all three engines both break at it and drop it, and `labels.test.ts` pins one of
 * each class that is out — the closure argument runs over about fifty characters and those ten are
 * what a regression would trip over first.
 *
 * Two definitions were tried and both are wrong here. JS's `\s` matches U+00A0, U+2007, U+202F and
 * U+FEFF, whose whole purpose is to forbid the break — it put a real catalogue label 193px narrow,
 * and `shoes.json` already carries U+00A0 and U+FEFF in its prose fields. HTML's own ASCII
 * whitespace is no better: measured, Chromium and WebKit offer no break at U+000C and WebKit none
 * at a lone U+000D, and these strings reach the DOM as JS text nodes, so the parser's newline
 * normalisation never runs on them.
 *
 * **What it still does not cover is a break that ADDS ink, and that is the residual rather than a
 * hole.** An engine may put on the widest line something no token carries, and the two mechanisms
 * belong to different engines. Firefox draws the hyphen for a break at a U+00AD — 6.42px at the name
 * face, the worst reading taken anywhere — and it needs no separator in the string at all, so that
 * one is a property of U+00AD rather than of this split. **Chromium** is the engine that keeps a
 * space's own advance when a combining mark clings to it, at 4.08px; Firefox does the same for
 * 6.20px behind a run of four spaces. Neither accumulates, because min-content is the widest LINE
 * and a line carries at most one retained advance and one drawn hyphen — sixteen soft hyphens in one
 * token measure +567px, not sixteen times anything. The shortfall is therefore bounded by a
 * character rather than by a token's distance from its string, which is the whole difference from
 * the `\s` defect above.
 *
 * **It is not inside `FIT_TOLERANCE_PX`, and that is worth saying rather than rounding away**:
 * 4.08px is over the 4px the rest of this model is held to. Two things make it survivable and
 * neither makes it guarded — it lands in the `--s2` padding the cell already carries, and nothing
 * upstream publishes carries a combining mark or a soft hyphen in a name or a label, so reaching it
 * takes a string written to reach it.
 */
export const wordsOf = (s: string): string[] => s.split(/[ \t\n\u200b]+/);

export function widestWordPx(label: string): number {
  return Math.max(...wordsOf(label).map(textPx));
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

/**
 * A greedy wrap, which is how the sticky header's height is decided — over `wordsOf`'s conservative
 * break rule rather than the engine's own, which is what this one really wants. Safe rather than
 * merely shared: nothing renders from this count, its only consumers being `labels.test.ts`'s bound
 * assertions, so a rule that breaks in fewer places than the engine can only ever fail the build
 * early. Two rules would be the worse trade — a second home for the one thing this file is careful
 * to state once.
 */
export function lineCount(label: string, maxPx: number = MAX_LABEL_PX): number {
  const space = textPx(' ');
  let lines = 1;
  let width = 0;
  for (const word of wordsOf(label)) {
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
 * The tighter of the two bounds, and therefore the one the catalogue is held to: the phone's sort
 * caret is out of flow in the cell's bottom-right corner and lands ON the unit line, so a centred
 * string runs out of room before it runs out of line.
 *
 * Measured by `app/scripts/measure-label-widths.mjs`, identically in both engines: the mark's
 * painted ink starts 8.33px inside the 49.33px text box's right edge — not the 12px its box takes,
 * a third of which is air, and not the path's own bounding rect, which the engines report
 * differently and both about 0.35px right of what they paint. A centred string's ADVANCE BOX
 * therefore clears the mark only up to 2 × 41.00 − 49.33 = 32.67px, which is four characters.
 *
 * Five is nevertheless the bound, because ink is what collides and a glyph stops short of its own
 * advance box: at five characters the box crosses by 0.57px and `3=TTS` puts 0.1px of the `S` into
 * the mark's outermost antialiased pixel — 0.5px where Firefox sets the string wider — which
 * renders as the two touching. At six the box crosses by 3.95px and the whole last glyph sits
 * under the stroke, struck through, in the one column a phone draws a caret in at all. The value
 * sits midway between the two, where neither the 0.21px per character the engines disagree by nor
 * the model's own rounding can flip a five into a six (docs/app.md §Table presentation).
 */
export const MAX_UNITS_CLEAR_PX = 37;

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
