/**
 * sRGB ↔ OKLab/OKLCh, plus the gamut walk and the WCAG ratio the wash engine is built on
 * (docs/app.md §Theming). Colour SPACE only: no policy, no tokens, no thresholds — `wash.ts` owns
 * every one of those, and keeping the two apart is what lets the ramp's guard be tested against
 * arithmetic that has no opinions.
 *
 * OKLCh rather than HSL because the engine's whole guarantee is that a hue change does not move
 * lightness: HSL's `l` is not a perceptual lightness, so `hsl(60 84% 50%)` and `hsl(240 84% 50%)`
 * differ by a factor of five in relative luminance — and luminance is exactly what the contrast
 * rule is about. Pinning OKLab's `L` pins (approximately) the thing the 4.5:1 bar measures.
 *
 * Channels are 0..1 floats throughout, and only `rgb255` rounds. The app paints 8-bit colours, so
 * every contrast figure this repo quotes is computed on rounded channels — the same model
 * `wash.test.ts` has always used.
 */

/** sRGB transfer function and its inverse, per IEC 61966-2-1. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export type Rgb = readonly [number, number, number];
/** OKLab, as `[L, a, b]`. */
export type Lab = readonly [number, number, number];

export function rgbToOklab([r, g, b]: Rgb): Lab {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** Linear-light sRGB, which may sit outside [0,1] — that is what `inGamut` reads. */
export function oklabToLinear([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
export function oklabToRgb(lab: Lab): Rgb {
  const [r, g, b] = oklabToLinear(lab);
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)];
}

/** The epsilon absorbs the round trip's own float error at the gamut's exact corners. */
export function inGamut(lab: Lab): boolean {
  return oklabToLinear(lab).every((c) => c > -0.0001 && c < 1.0001);
}

export function lchToLab(L: number, C: number, hueDeg: number): Lab {
  const h = (hueDeg * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

/**
 * The requested colour, or the most chromatic one at that lightness and hue which sRGB can hold.
 *
 * Chroma is reduced and **lightness is never touched**, which is the whole point: clipping the
 * linear-RGB channels instead (the obvious alternative) moves luminance by however much the clip
 * removed, and a guard that pins `L` to keep contrast predictable cannot then let the gamut walk
 * un-pin it. 24 bisections resolve chroma to under 1e-7, far below an 8-bit step.
 */
export function toGamutLab(L: number, C: number, hueDeg: number): Lab {
  if (inGamut(lchToLab(L, C, hueDeg))) return lchToLab(L, C, hueDeg);
  let lo = 0, hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(lchToLab(L, mid, hueDeg))) lo = mid; else hi = mid;
  }
  return lchToLab(L, lo, hueDeg);
}

/** Hue in degrees and chroma of an OKLab pair — the inverse of `lchToLab`'s angle. */
export function labToLch(lab: Lab): { L: number; C: number; h: number } {
  const [L, a, b] = lab;
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** Linear interpolation in OKLab, which is what `color-mix(in oklab, …)` does. */
export function mixLab(from: Lab, to: Lab, t: number): Lab {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

/** 0..1 channels to the 8-bit values the screen actually paints. */
export function rgb255(rgb: Rgb): [number, number, number] {
  return rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255)) as [number, number, number];
}
export function toHex(rgb: Rgb): string {
  return '#' + rgb255(rgb).map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * HSL → sRGB, needed for one job only: reading the `--wash-blue` tokens, which `app.css` writes in
 * HSL, back into OKLab so the engine can pin each theme's own lightness (docs/app.md §Theming).
 */
export function hslToRgb(hueDeg: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hueDeg / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hueDeg < 60 ? [c, x, 0] : hueDeg < 120 ? [x, c, 0] : hueDeg < 180 ? [0, c, x]
    : hueDeg < 240 ? [0, x, c] : hueDeg < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** WCAG relative luminance and contrast ratio, on 8-bit channels — see the file header. */
export function luminance(rgb8: readonly number[]): number {
  const c = rgb8.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export function contrast(a: readonly number[], b: readonly number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * What a translucent fill composites to over an opaque backdrop, in sRGB.
 *
 * sRGB and not OKLab, although the app writes `color-mix(in oklab, …)`: the `color-mix` resolves
 * the FILL, and the browser then composites that resolved colour over the backdrop in the
 * destination space. `wash.test.ts` has modelled it this way since the ramp was first asserted, and
 * the model reproduces `wash.ts`'s own recorded tolerance — a 0.9733 light cap against the comment's
 * 0.973 — which an OKLab composite does not (it reads 0.977).
 */
export function over(fill8: readonly number[], alpha: number, surface8: readonly number[]): [number, number, number] {
  return fill8.map((v, i) => Math.round(v * alpha + surface8[i]! * (1 - alpha))) as [number, number, number];
}
