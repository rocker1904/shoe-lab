/**
 * The display preferences: how they are stored, and how a resolved wash reaches the stylesheet.
 * The engine itself is `lib/wash.ts`; this is the layer between it and the document
 * (docs/app.md §The display preferences).
 *
 * **Local storage, never the URL.** The URL is the view — what is being asked of the fleet — and a
 * shared link has to show the recipient the same table. A colour ramp is a property of the reader's
 * eyes and screen, so a link carrying one would repaint someone else's table for them
 * (docs/app.md §View and URL ownership). Its own key beside the theme's, for the same reason the
 * theme has one.
 */

import { DISPLAY_DEFAULTS, resolveWash, type DisplayPrefs, type ResolvedWash } from './wash';

const KEY = 'display';
/**
 * Bumped when a stored shape stops being readable; an unrecognised version reads as defaults.
 * **2** since the better colour became the primary colour: the two fields were renamed, and the
 * curve and floor defaults moved under them, so a v1 record is neither readable by name nor
 * trustworthy by value — half of it would be a runner's choice and half of it a stale default
 * wearing the same shape (docs/app.md §The display preferences).
 */
const VERSION = 2;

/** The sliders' own ranges, and the only values a stored preference may take. */
const BOUNDS = {
  primaryHue: [0, 360], primaryChroma: [0, 0.37],
  baseHue: [0, 360], baseChroma: [0, 0.37],
  // Emphasis runs past the default rather than up to it: 4 is where the ramp ships, so a slider
  // that ended there could only ever be dragged one way.
  strength: [0, 1], curve: [1, 6], floor: [0, 0.5],
} as const satisfies Record<string, readonly [number, number]>;

export const DISPLAY_BOUNDS: Record<keyof typeof BOUNDS, readonly [number, number]> = BOUNDS;

function num(v: unknown, key: keyof typeof BOUNDS): number {
  const [lo, hi] = BOUNDS[key];
  // `typeof v === 'number'` alone admits NaN and ±Infinity, both of which reach the ramp as an
  // alpha of NaN and paint nothing at all.
  if (typeof v !== 'number' || !Number.isFinite(v)) return DISPLAY_DEFAULTS[key];
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Any input at all → a usable preference state. Every field is clamped independently rather than
 * the whole record being thrown away on one bad value: this is a hand-editable key in a public
 * app's storage, and a runner who has typed one number wrong should lose that number rather than
 * the four they got right.
 */
export function coerceDisplay(raw: unknown): DisplayPrefs {
  if (typeof raw !== 'object' || raw === null) return { ...DISPLAY_DEFAULTS };
  const o = raw as Record<string, unknown>;
  if (o['v'] !== VERSION) return { ...DISPLAY_DEFAULTS };
  return {
    primaryHue: num(o['primaryHue'], 'primaryHue'),
    primaryChroma: num(o['primaryChroma'], 'primaryChroma'),
    baseOn: o['baseOn'] === true,
    baseHue: num(o['baseHue'], 'baseHue'),
    baseChroma: num(o['baseChroma'], 'baseChroma'),
    strength: num(o['strength'], 'strength'),
    curve: num(o['curve'], 'curve'),
    floor: num(o['floor'], 'floor'),
  };
}

// Storage access throws where it is blocked (embedded frames, hard privacy settings) rather than
// returning null, and this module runs at boot — the same guard `lib/theme.ts` carries, for the
// same reason.
export function readDisplay(): DisplayPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? { ...DISPLAY_DEFAULTS } : coerceDisplay(JSON.parse(raw));
  } catch {
    // A malformed value parses as a throw rather than as garbage, so both land here.
    return { ...DISPLAY_DEFAULTS };
  }
}

export function writeDisplay(prefs: DisplayPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...prefs }));
  } catch {
    // Losing the preference between sessions beats losing the drag.
  }
}

/**
 * The override stylesheet, or the empty string at the default colour.
 *
 * Empty is the load-bearing case: a runner who never opens the menu gets **no rule at all**, so
 * `app.css`'s own `--wash-blue` and its own accent family reach the screen exactly as they always
 * have, in both themes, byte for byte. Nothing here is a re-statement of the default colour — there
 * is no default colour to re-state (docs/app.md §The display preferences).
 *
 * **The accent family rides in the same rule as the wash**, because it is the same preference: one
 * primary colour drives the tint the leaders carry and the marks, fills and surfaces the chrome is
 * drawn in. `--hover-wash` is left alone deliberately — it is `color-mix(in oklab, var(--accent) 6%,
 * transparent)` in `app.css`, so it follows `--accent` by construction and a second declaration
 * here would be a second home for the 6%.
 *
 * The three selector blocks mirror `app.css`'s own, and they have to: the dark values sit under
 * both `prefers-color-scheme` and `[data-theme]` so the toggle wins in either direction, and a
 * single `:root` rule here would paint the light tint on a runner whose OS is dark.
 */
export function washCss(r: ResolvedWash): string {
  if (r.tokenFill) return '';
  const decl = (t: 'light' | 'dark') =>
    `--wash-blue:${r.better[t]};--wash-base:${r.base[t]}`
    + `;--accent:${r.accents[t].accent};--accent-solid:${r.accents[t].accentSolid}`
    + `;--accent-dim:${r.accents[t].accentDim}`;
  return [
    `:root{${decl('light')}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme='light']){${decl('dark')}}}`,
    `:root[data-theme='dark']{${decl('dark')}}`,
  ].join('\n');
}

const STYLE_ID = 'wash-prefs';

/**
 * Push a resolved wash at the document: the override rule, and the flag that selects which cell
 * rule paints.
 *
 * `data-wash="dual"` is an attribute rather than a third custom property because it switches a
 * *rule*, not a value: the single-colour rule has to stay literally untouched at the default state
 * for the byte-identical claim above to mean anything, and a `var()` fallback resolving to the same
 * colour does not give that — it round-trips the token through OKLab first.
 */
export function installWash(resolved: ResolvedWash): void {
  const root = document.documentElement;
  if (resolved.paint.dual) root.dataset['wash'] = 'dual';
  else delete root.dataset['wash'];

  const css = washCss(resolved);
  let style = document.getElementById(STYLE_ID);
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = css;
}

/**
 * Resolve and install in one call. `main.ts`'s form, run at boot before the dataset fetch exactly
 * as the theme is, so a saved ramp is never repainted under the runner. `Page.svelte` keeps the
 * two halves apart instead: it derives the resolution and installs it from an effect, so a
 * resolution is never computed twice for one change.
 */
export function applyDisplay(prefs: DisplayPrefs): ResolvedWash {
  const resolved = resolveWash(prefs);
  installWash(resolved);
  return resolved;
}
