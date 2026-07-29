import type { LabTest } from '../../../shared/types.js';

/**
 * The header's first line. The four shoe fields that have cells carry no catalogue test behind
 * them, so they are named here; everything else is the catalogue's own name. Both renderings read
 * this, so a column is called the same thing on a phone and on a desktop before `shortLabel` gets
 * a say (docs/app.md §Columns and sorting).
 */
export function columnLabel(key: string, test: LabTest | undefined): string {
  if (key === 'releasedAt') return 'Released';
  if (key === 'score') return 'Score';
  if (key === 'msrpGbp') return 'Price';
  if (key === 'plate') return 'Plate';
  return test?.name ?? key;
}

/**
 * Mobile column headers get ~53px of text at the six-column bound, measured at the narrowest
 * common phone (360px) rather than the 375px the design was drawn at. Only names whose widest
 * word exceeds that are shortened; most keep their real name. `Outsole wear` is the one entry
 * that is not a length fix — the test is Dremel dent depth in mm, so "durability" contradicts
 * its own units (docs/app.md §Columns and sorting).
 */
export const SHORT_LABELS: Record<string, string> = {
  breathability: 'Airflow', 'breathability-25': 'Airflow',
  'toebox-durability': 'Toebox durab.', 'heel-padding-durability': 'Heel pad durab.',
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
  'sweat-evaporated': 'Sweat evap.', insulation: 'Warmth',
  // Marginal against the bound once headroom is allowed.
  'outsole-hardness': 'Outsole firmness',
  'torsional-rigidity': 'Torsion', 'torsional-rigidity-23': 'Torsion',
  // Two different tests carry the upstream name "Forefoot traction" and are NOT a superseded
  // pair, so both can be on screen at once. The stop-traction one takes a distinct label.
  'forefoot-traction-stop': 'Forefoot stop',
  'drying-potential': 'Drying',
};

/**
 * 53px is the real column at the six-column bound on a 360px phone. The guard runs at 52 to
 * leave a pixel of headroom, because CHAR_PX sums approximate Chromium to about ±1px and two
 * real names ("Torsional" 52.5, "hardness" 52.8) sit inside that margin.
 */
export const MAX_LABEL_PX = 52;

/**
 * Per-character advance widths for system-ui 600 at 12px with -0.02em tracking, measured in
 * Chromium. Summing them reproduces the browser to within 0.5px on the longest real names,
 * which is ample against a 53px bound — jsdom has no layout of its own.
 */
const CHAR_PX: Record<string, number> = {
  a: 6.95, b: 7.34, c: 5.95, d: 7.34, e: 6.92, f: 4.4, g: 7.34, h: 7.56, i: 3.35, j: 3.34,
  k: 7.2, l: 3.34, m: 11.46, n: 7.56, o: 7.26, p: 7.34, q: 7.34, r: 5.12, s: 5.78, t: 4.97,
  u: 7.56, v: 6.61, w: 10.03, x: 6.7, y: 6.61, z: 5.68,
  A: 8.06, B: 7.74, C: 7.23, D: 8.54, E: 6.48, F: 6.35, G: 8.45, H: 8.94, I: 4.43, J: 3.73,
  K: 7.73, L: 6.47, M: 11.08, N: 9.52, O: 9.25, P: 7.21, Q: 9.25, R: 7.63, S: 6.37, T: 6.92,
  U: 8.83, V: 7.56, W: 11.36, X: 7.8, Y: 7.27, Z: 6.71,
  '0': 6.62, '1': 6.62, '2': 6.62, '3': 6.62, '4': 6.62, '5': 6.62, '6': 6.62, '7': 6.62,
  '8': 6.62, '9': 6.62,
  ' ': 2.88, '.': 3.13, ',': 3.18, '/': 4.74, '(': 3.83, ')': 3.83, '%': 10.58, '-': 3.6,
  'Δ': 7.81,
};
const FALLBACK_PX = 7;

export function widestWordPx(label: string): number {
  return Math.max(...label.split(/\s+/).map((word) =>
    [...word].reduce((sum, ch) => sum + (CHAR_PX[ch] ?? FALLBACK_PX), 0)));
}

export function shortLabel(key: string, fallback: string): string {
  return SHORT_LABELS[key] ?? fallback;
}
