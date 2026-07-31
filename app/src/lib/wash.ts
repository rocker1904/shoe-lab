/**
 * The wash ramp. It lives here rather than in CSS for two reasons: the curve needs a power, and
 * the contrast rule has to be asserted across the whole ramp rather than at its endpoint
 * (docs/app.md §Theming).
 *
 * Grey means "more", blue means "better". The blue ramp may be a podium — only leaders read as
 * tinted, which is what a ranking wants. The grey ramp must stay **linear**, because a metric with
 * no better end is a scale and has to read as a gradient. Do not collapse them into one curve.
 */

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
