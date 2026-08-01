/**
 * The wash ramp. It lives here rather than in CSS for two reasons: the curve needs a power, and
 * the contrast rule has to be asserted across the whole ramp rather than at its endpoint
 * (docs/app.md §Theming).
 *
 * Grey means "more", blue means "better". The blue ramp may be a podium — only leaders read as
 * tinted, which is what a ranking wants. The grey ramp must stay **linear**, because a metric with
 * no better end is a scale and has to read as a gradient. Do not collapse them into one curve.
 *
 * The ranked half is now **preference-parameterised** (docs/app.md §The display preferences): a
 * runner may retune the colour and the curve, and everything below the constants is the guarded
 * engine that keeps any such retune legible. The grey ramp takes no preference at all — a neutral
 * metric has no better end, so there is nothing about it to tune.
 */

import {
  contrast, hslToRgb, mixLab, oklabToRgb, over, rgb255, rgbToOklab, toGamutLab, toHex,
  type Lab, type Rgb,
} from './oklab';

/** Below this percentile a ranked cell is bare. */
export const WASH_FLOOR = 0.15;
/** How fast it climbs once it starts. Higher is more of a podium. */
export const WASH_CURVE = 1.8;
/**
 * Alpha at p = 1. The fill is chosen so this clears 4.5:1 with the theme's own ink; the light fill
 * tolerates up to 0.973, so there is headroom. Raising it past that breaks `wash.test.ts`.
 */
export const WASH_PEAK = 0.94;
/** Below this, paint nothing rather than a tint no one can see. */
export const WASH_MIN_PAINT = 0.015;

/**
 * The shipped ramp, written out rather than delegating to `rankedAlpha` below. The duplication is
 * deliberate and is what `reproduces the shipped ramp exactly at the default preferences` in
 * `wash.test.ts` compares against: this is the curve the app painted before there were any
 * preferences, and the parameterised engine has to reproduce it to the bit for a runner who never
 * opens the menu.
 */
export function washAlpha(p: number): number {
  const t = Math.max(0, (p - WASH_FLOOR) / (1 - WASH_FLOOR));
  const a = Math.pow(t, WASH_CURVE) * WASH_PEAK;
  return a < WASH_MIN_PAINT ? 0 : a;
}

/** Linear, deliberately. See the note above. */
export function greyAlpha(p: number): number {
  const a = p * 0.34;
  return a < WASH_MIN_PAINT ? 0 : a;
}

// ---------------------------------------------------------------------------------------------
// What a runner may retune

/**
 * Lightness is absent by design: contrast is very nearly a question of luminance alone, so a free
 * lightness slider is a free contrast slider. The engine pins each tint's OKLab `L` to that theme's
 * own wash instead (docs/app.md §The display preferences).
 *
 * Hue and chroma are absolute OKLCh and shared by both themes; only the pinned `L` differs between
 * them. `strength`, `curve` and `floor` are the three constants above, made movable.
 */
export interface DisplayPrefs {
  /** OKLCh hue in degrees, 0–360, of the tint the BEST cells carry. */
  betterHue: number;
  /** OKLCh chroma of the same, reduced into sRGB at the pinned lightness where it does not fit. */
  betterChroma: number;
  /** Tint every ranked cell, with the COLOUR carrying the magnitude rather than the alpha. */
  baseOn: boolean;
  /** The tint the WORST ranked cell carries with `baseOn`; ignored without it. */
  baseHue: number;
  baseChroma: number;
  /** Alpha at p = 1 with the base off; the flat alpha every cell carries with it on. */
  strength: number;
  /** The ramp's power. Higher is more of a podium. */
  curve: number;
  /** Below this percentile a ranked cell is bare. Meaningless with the base on. */
  floor: number;
}

/**
 * The hue and chroma are `--wash-blue`'s own in the LIGHT theme, rounded to the sliders' steps:
 * the painted token `#147ceb` is OKLCh 255.305° / 0.1889, so 255° and 0.189. Rounded rather than
 * exact because `<input type="range">` snaps its thumb to the step and would otherwise show a value
 * the preference does not hold — and because nothing is painted from these two at the default state
 * anyway: `resolveWash` reports `tokenFill` there and `app.css`'s own tokens reach the screen
 * untouched (docs/app.md §The display preferences).
 *
 * They are still held to the token by `wash.test.ts`, because `usesTokenFill` keys off them:
 * moving these without moving `--wash-blue` with them would leave the panel reading one colour
 * while the default state paints another (BACKLOG 16).
 */
export const DISPLAY_DEFAULTS: DisplayPrefs = {
  betterHue: 255, betterChroma: 0.189,
  baseOn: false, baseHue: 25, baseChroma: 0.12,
  strength: WASH_PEAK, curve: WASH_CURVE, floor: WASH_FLOOR,
};

// ---------------------------------------------------------------------------------------------
// The painted ramp

/** Everything a cell needs to paint, resolved once per preference change — never per frame. */
export interface WashPaint {
  /** Base on: flat alpha, and the colour carries the magnitude. */
  dual: boolean;
  /** `min(strength, cap)` — the guard has already been applied by the time a cell reads this. */
  peak: number;
  curve: number;
  floor: number;
}

export const DEFAULT_PAINT: WashPaint = {
  dual: false, peak: WASH_PEAK, curve: WASH_CURVE, floor: WASH_FLOOR,
};

/** The ranked cell's alpha. Plain arguments, no allocation: this runs once per painted cell. */
export function rankedAlpha(p: number, w: WashPaint): number {
  if (w.dual) return w.peak;
  const t = Math.max(0, (p - w.floor) / (1 - w.floor));
  const a = Math.pow(t, w.curve) * w.peak;
  return a < WASH_MIN_PAINT ? 0 : a;
}

/**
 * How far along base → better this cell sits, with the base on. The same power the alpha ramp uses,
 * applied to the colour instead: with every cell tinted, alpha can no longer say which is better,
 * so the hue has to (docs/app.md §The display preferences).
 */
export function rankedMix(p: number, w: WashPaint): number {
  return Math.pow(p, w.curve);
}

// ---------------------------------------------------------------------------------------------
// The guarded engine

export type ThemeName = 'light' | 'dark';

/**
 * The four `app.css` values the engine reads at runtime, frozen here as their one home and pinned
 * against the stylesheet by `tokens.test.ts` — the guard is what makes freezing them safe. Only
 * these four: a token the engine does not compute with belongs in `wash.test.ts`'s own table with
 * the rest of the assertion material.
 *
 * `washL` is derived from the theme's own `--wash-blue` rather than written down, because it IS
 * that token read in another space: two numbers for one fact drift, and this one is the pin the
 * whole contrast guarantee hangs off.
 */
export interface WashTheme {
  name: ThemeName;
  surface: readonly number[];
  ink: readonly number[];
  /** `--accent`, which `--hover-wash` is 6% of. */
  accent: readonly number[];
  /** `--wash-blue`, as the `app.css` token resolves. */
  blue: readonly number[];
  /** The OKLab lightness every tint in this theme is pinned to. */
  washL: number;
}

function hexBytes(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function bytesToRgb(b: readonly number[]): Rgb {
  return [b[0]! / 255, b[1]! / 255, b[2]! / 255];
}
function washTheme(name: ThemeName, surface: string, ink: string, accent: Rgb, blue: Rgb): WashTheme {
  return {
    name, surface: hexBytes(surface), ink: hexBytes(ink),
    accent: rgb255(accent), blue: rgb255(blue), washL: rgbToOklab(blue)[0],
  };
}

export const WASH_THEMES: Record<ThemeName, WashTheme> = {
  light: washTheme('light', '#ffffff', '#16181b', hslToRgb(211, 0.84, 0.46), hslToRgb(211, 0.84, 0.50)),
  dark: washTheme('dark', '#1a1d21', '#eceef1', hslToRgb(211, 0.70, 0.54), hslToRgb(211, 0.70, 0.44)),
};

/** The alpha in `--hover-wash`; `ShoeTable.svelte` paints it as a background IMAGE over the wash. */
const HOVER_ALPHA = 0.06;
/** Small text over the ramp. */
const TARGET = 4.5;
/** Stops in the swept ramp. Swept whole, because with the base on it need not be monotone. */
const RAMP_STOPS = 120;

export interface ResolvedWash {
  /** Per theme, the `#rrggbb` the ranked ramp paints from. */
  better: Record<ThemeName, string>;
  base: Record<ThemeName, string>;
  /** Max strength keeping that theme's ink at 4.5:1 over the whole ramp, hover included. */
  caps: Record<ThemeName, number>;
  /** The binding one of the two, which is what is painted in BOTH themes. */
  cap: number;
  binding: ThemeName;
  /** The runner asked for more strength than the guard allows. */
  capped: boolean;
  /** What a cell paints at p = 1: `min(strength, cap)`. */
  peak: number;
  /**
   * The painted ramp's lightness span, in OKLab `L`, across both themes' worst case. Below one
   * 8-bit step it is `hueOnly`.
   */
  lightnessSpan: number;
  /** Nothing but hue separates the worst cell from the best — the panel's warning state. */
  hueOnly: boolean;
  /** No override is written at all — `app.css`'s own tokens paint, exactly as they always have. */
  tokenFill: boolean;
  paint: WashPaint;
}

/**
 * The painted cell, as 8-bit sRGB, at percentile `p`. This is the model every contrast figure in
 * the repo is computed on, and it mirrors what the stylesheet does: mix base → better in OKLab (the
 * `color-mix(in oklab, …)` the cell rule writes) and composite the result over the row's surface.
 */
function cellRgb(t: WashTheme, p: number, better: Lab, base: Lab, w: WashPaint): readonly number[] {
  if (!w.dual) return over(rgb255(oklabToRgb(better)), rankedAlpha(p, w), t.surface);
  return over(rgb255(oklabToRgb(mixLab(base, better, rankedMix(p, w)))), w.peak, t.surface);
}

/**
 * The worst ink contrast anywhere on the ramp, with the hover overlay on top.
 *
 * Hover included, unlike the reference mockup: `--hover-wash` is a third layer over a pointed-at
 * cell and is the app's real worst case (docs/app.md §Theming). Excluding it would let the solver
 * hand back a strength that fails the moment a runner puts the pointer on the row.
 */
function worstContrast(t: WashTheme, better: Lab, base: Lab, w: WashPaint): number {
  let worst = Infinity;
  for (let i = 0; i <= RAMP_STOPS; i++) {
    const cell = cellRgb(t, i / RAMP_STOPS, better, base, w);
    const c = contrast(over(t.accent, HOVER_ALPHA, cell), t.ink);
    if (c < worst) worst = c;
  }
  return worst;
}

/**
 * The largest strength this theme's ink survives, by bisection. 22 steps resolve it to 2.4e-7,
 * four orders of magnitude finer than the slider's own 0.01.
 *
 * Bisection is sound even though contrast is not *proven* monotone in strength: it is monotone for
 * every ramp shape these preferences can express — more fill is always further from the surface
 * and, with one ink, always closer to the ink — and the swept property in `wash.test.ts` is what
 * actually holds the result to 4.5:1 over a grid of states rather than trusting that.
 */
function solveCap(t: WashTheme, better: Lab, base: Lab, shape: Omit<WashPaint, 'peak'>): number {
  const at = (peak: number) => worstContrast(t, better, base, { ...shape, peak });
  if (at(1) >= TARGET) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= TARGET) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * How far the painted ramp travels in OKLab lightness, worst cell to best.
 *
 * This is the mockup's monotone-lightness check, measured rather than assumed — and measuring it
 * is what showed the rule its real shape. Under the guard both tints sit at the SAME pinned `L`, so
 * what little lightness a base-on ramp carries comes only from the two tints' CHROMA differing:
 * OKLab `L` is not luminance, and a more chromatic colour composites lighter. Two equally vivid
 * tints therefore leave hue carrying the ordering alone — a red→green ramp is then one colour-blind
 * runner away from carrying nothing. A monotonicity test would have reported "fine" forever,
 * because a flat line never reverses. The span is the fact worth having
 * (docs/app.md §The display preferences).
 */
function lightnessSpan(t: WashTheme, better: Lab, base: Lab, w: WashPaint): number {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= 20; i++) {
    const L = rgbToOklab(bytesToRgb(cellRgb(t, i / 20, better, base, w)))[0];
    lo = Math.min(lo, L); hi = Math.max(hi, L);
  }
  return hi - lo;
}
/** One 8-bit step of lightness, near enough: below this, nothing but hue is separating the cells. */
const HUE_ONLY_SPAN = 0.01;

/** True while `app.css`'s `--wash-blue` is still what the ranked ramp paints from. */
export function usesTokenFill(prefs: DisplayPrefs): boolean {
  return !prefs.baseOn
    && prefs.betterHue === DISPLAY_DEFAULTS.betterHue
    && prefs.betterChroma === DISPLAY_DEFAULTS.betterChroma;
}

/**
 * Everything the app needs from a preference state, computed **once per change** and never per
 * frame or per cell: a tint per theme, the cap each theme's ink imposes, and the paint the table
 * then reads with no further arithmetic (docs/app.md §What a drag may recompute).
 *
 * The painted strength is the **lower** of the two caps, in both themes rather than one each. A
 * runner on `auto` crosses the theme boundary at dusk with no repaint of their own, so painting to
 * whichever theme binds is what makes the ramp they chose legible on both sides of that switch —
 * and it is why the panel can name one binding theme rather than quote two numbers.
 */
export function resolveWash(prefs: DisplayPrefs): ResolvedWash {
  const tokens = usesTokenFill(prefs);
  const shape = { dual: prefs.baseOn, curve: prefs.curve, floor: prefs.floor };

  const hex = {} as Record<ThemeName, { better: string; base: string }>;
  const lab = {} as Record<ThemeName, { better: Lab; base: Lab }>;
  for (const name of ['light', 'dark'] as const) {
    const t = WASH_THEMES[name];
    // At the default colour the token is what paints, so the token is what the guard must measure:
    // reconstructing it from the rounded slider values would solve for a colour nobody sees.
    const better = tokens ? rgbToOklab(bytesToRgb(t.blue)) : toGamutLab(t.washL, prefs.betterChroma, prefs.betterHue);
    const base = toGamutLab(t.washL, prefs.baseChroma, prefs.baseHue);
    hex[name] = { better: toHex(oklabToRgb(better)), base: toHex(oklabToRgb(base)) };
    // **Quantised before it is solved for.** What reaches the browser is a `#rrggbb`, so that is
    // what `color-mix` interpolates between and what the screen composites — and rounding two
    // endpoints and then mixing is not the same colour as mixing and then rounding. Solving on the
    // unrounded tint over-reported the base-on ramp by up to 0.03 of ratio, which is a guard that
    // passes on a colour nobody paints.
    lab[name] = { better: rgbToOklab(bytesToRgb(hexBytes(hex[name]!.better))),
                  base: rgbToOklab(bytesToRgb(hexBytes(hex[name]!.base))) };
  }

  const caps = {
    light: solveCap(WASH_THEMES.light, lab.light.better, lab.light.base, shape),
    dark: solveCap(WASH_THEMES.dark, lab.dark.better, lab.dark.base, shape),
  };
  const binding: ThemeName = caps.light <= caps.dark ? 'light' : 'dark';
  const cap = Math.min(caps.light, caps.dark);
  const paint: WashPaint = { ...shape, peak: Math.min(prefs.strength, cap) };
  const span = Math.min(...(['light', 'dark'] as const)
    .map((n) => lightnessSpan(WASH_THEMES[n], lab[n]!.better, lab[n]!.base, paint)));

  return {
    better: { light: hex.light!.better, dark: hex.dark!.better },
    base: { light: hex.light!.base, dark: hex.dark!.base },
    caps, cap, binding, capped: prefs.strength > cap, peak: paint.peak,
    lightnessSpan: span, hueOnly: span < HUE_ONLY_SPAN,
    tokenFill: tokens, paint,
  };
}
