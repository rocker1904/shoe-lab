import { describe, expect, it } from 'vitest';
import { greyAlpha, washAlpha, WASH_FLOOR, WASH_PEAK } from './wash';

/** sRGB relative luminance, per WCAG. */
function luminance([r, g, b]: number[]): number {
  const c = [r, g, b].map((v) => {
    const s = v! / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** What a translucent fill composites to over an opaque surface. */
function over(fill: number[], alpha: number, surface: number[]): number[] {
  return fill.map((v, i) => Math.round(v * alpha + surface[i]! * (1 - alpha)));
}

/**
 * The resolved values of the tokens in `app.css`. A token this file does not know about cannot be
 * asserted, and a value that drifts from its token is exactly what these tests exist to catch —
 * `tokens.test.ts` pins the same literals from the other side (docs/app.md §Theming).
 *
 * `page` is `--bg` and `track` is `--border-soft`, because a flat mark is only legible against the
 * surface it is ACTUALLY on: above 800px the sidebar declares no background, so the histogram bars
 * sit on the page rather than on `--surface`, and the pickers' coverage fill sits in a
 * `--border-soft` groove. Asserting against `--surface` alone measures the case that only happens
 * inside the drawer.
 */
const THEMES = [
  { name: 'light', surface: [0xff, 0xff, 0xff], page: [0xf5, 0xf5, 0xf4],
    track: [0xee, 0xee, 0xec], ink: [0x16, 0x18, 0x1b],
    chrome: [0xfb, 0xfb, 0xfa], well: [0xfa, 0xf9, 0xf8],
    accentDim: [0xe8, 0xf2, 0xfd],     // hsl(211 84% 95%)
    dimInk: [0x5f, 0x66, 0x73],        // --text-dim
    washFill: [0x14, 0x7c, 0xeb],      // hsl(211 84% 50%)
    greyFill: [0x82, 0x89, 0x97],      // hsl(220 9% 55%)
    histDim: [0x7f, 0x87, 0x94],       // --hist-dim
    accent: [0x13, 0x72, 0xd8],        // hsl(211 84% 46%), which --hover-wash is 6% of
    accentSolid: [0x12, 0x6d, 0xce] }, // hsl(211 84% 44%)
  { name: 'dark', surface: [0x1a, 0x1d, 0x21], page: [0x0f, 0x11, 0x13],
    track: [0x22, 0x26, 0x2a], ink: [0xec, 0xee, 0xf1],
    chrome: [0x15, 0x18, 0x1b], well: [0x16, 0x19, 0x1d],
    accentDim: [0x19, 0x37, 0x57],     // hsl(211 55% 22%)
    dimInk: [0x98, 0xa0, 0xab],
    washFill: [0x22, 0x6e, 0xbf],      // hsl(211 70% 44%)
    greyFill: [0x96, 0x9c, 0xa6],      // hsl(220 8% 62%)
    histDim: [0x6b, 0x74, 0x82],
    accent: [0x38, 0x87, 0xdc],        // hsl(211 70% 54%)
    accentSolid: [0x22, 0x6e, 0xbf] }, // hsl(211 70% 44%)
];
/** `--on-accent`. A token, not a literal, everywhere it is used (Global Constraints). */
const ON_ACCENT = [0xff, 0xff, 0xff];
/**
 * The alpha in `--hover-wash`, which is `color-mix(in oklab, var(--accent) 6%, transparent)` —
 * i.e. the accent's own colour at this alpha. `ShoeTable.svelte` paints it as a background *image*
 * over the cell's wash, so a hovered cell is a THIRD layer and the ramp's endpoint is not the last
 * word on legibility.
 */
const HOVER_ALPHA = 0.06;

describe('washAlpha', () => {
  it('paints nothing at or below the floor', () => {
    expect(washAlpha(0)).toBe(0);
    expect(washAlpha(WASH_FLOOR)).toBe(0);
  });

  it('reaches the peak at the top of the range', () => {
    expect(washAlpha(1)).toBeCloseTo(WASH_PEAK, 5);
  });

  it('rises monotonically, which is what makes the endpoint the ramp\'s worst case', () => {
    for (let i = 1; i <= 100; i++) {
      expect(washAlpha(i / 100)).toBeGreaterThanOrEqual(washAlpha((i - 1) / 100));
    }
  });
});

describe('greyAlpha', () => {
  it('stays linear, because a neutral metric is a scale rather than a podium', () => {
    expect(greyAlpha(0.5) / greyAlpha(0.25)).toBeCloseTo(2, 5);
  });

  it('paints nothing rather than a tint no one can see', () => {
    // The floor branch, which the linearity case alone never reaches: 0.04 * 0.34 is under
    // WASH_MIN_PAINT and must round to bare, and the step above it must not.
    expect(greyAlpha(0.04)).toBe(0);
    expect(greyAlpha(0.05)).toBeGreaterThan(0);
  });
});

/**
 * The guard that makes the single-ink rule enforceable rather than remembered. A ramp that
 * switched ink could not clear 4.5:1 anywhere near the switch — the best obtainable at the
 * crossover is 4.22:1 against this theme's own ink (spec §One ink, always).
 *
 * BOTH ramps, not just the blue one. The grey ramp clears by a wide margin today, which is the
 * reason it needs the assertion rather than a reason to skip it: its peak alpha and its fill are
 * both retunable, and an unasserted rule is one a retune deletes in silence.
 */
describe('both ramps are legible at every step', () => {
  const RAMPS = [
    { ramp: 'ranked', fill: (t: typeof THEMES[number]) => t.washFill, alpha: washAlpha },
    { ramp: 'neutral', fill: (t: typeof THEMES[number]) => t.greyFill, alpha: greyAlpha },
  ];
  for (const { ramp, fill, alpha } of RAMPS) {
    for (const theme of THEMES) {
      it(`${theme.name}: the ${ramp} ramp keeps theme ink at 4.5:1 across its whole range`, () => {
        let worst = Infinity;
        let worstAt = 0;
        for (let i = 0; i <= 200; i++) {
          const p = i / 200;
          const c = contrast(over(fill(theme), alpha(p), theme.surface), theme.ink);
          if (c < worst) { worst = c; worstAt = p; }
        }
        expect(worst, `worst ${worst.toFixed(2)}:1 at p=${worstAt.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

/**
 * The ramp guard above measures a cell at rest. Pointing at its row adds `--hover-wash` on top of
 * the wash — `tr.shoe:hover td` sets it as a background IMAGE, which layers over the cell's
 * background colour rather than replacing it — so the hovered peak is strictly darker than the
 * endpoint the ramp is tuned against, and it is the app's real worst case.
 *
 * It clears the bar with little to spare: the hovered peak measures **4.67:1** in this model in
 * both themes, against 4.73 light and 4.80 dark at rest. The model is sRGB (`over()`) while the
 * app paints `color-mix(in oklab, …)`, and the two disagree by up to one 8-bit step per channel:
 * the light fill round-trips exactly, the dark fill lands a step lighter, which is worth about
 * 0.07 of ratio in the safe direction. So these figures are a floor on what is painted, and the
 * assertion is against 4.5 rather than against them.
 *
 * The headroom is in the ALPHA, not the ratio: the light peak tolerates a hover alpha up to 0.194
 * and the dark up to 0.149, against the 0.06 that ships. That is what this test protects — nothing
 * else in the suite would fail if `--hover-wash` were tripled.
 */
describe('both ramps stay legible under the hover overlay', () => {
  const RAMPS = [
    { ramp: 'ranked', fill: (t: typeof THEMES[number]) => t.washFill, alpha: washAlpha },
    { ramp: 'neutral', fill: (t: typeof THEMES[number]) => t.greyFill, alpha: greyAlpha },
  ];
  for (const { ramp, fill, alpha } of RAMPS) {
    for (const theme of THEMES) {
      it(`${theme.name}: a hovered ${ramp} cell keeps theme ink at 4.5:1 across its whole range`, () => {
        let worst = Infinity;
        let worstAt = 0;
        for (let i = 0; i <= 200; i++) {
          const p = i / 200;
          const washed = over(fill(theme), alpha(p), theme.surface);
          const hovered = over(theme.accent, HOVER_ALPHA, washed);
          const c = contrast(hovered, theme.ink);
          if (c < worst) { worst = c; worstAt = p; }
        }
        expect(worst, `worst ${worst.toFixed(2)}:1 at p=${worstAt.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

/**
 * A flat mark is governed by a different rule from the gradient wash: it is opaque and it is not
 * text, so 3:1 is the bar (docs/app.md §Theming). Without this the histogram and coverage bars can
 * be lightened into invisibility by a token retune with nothing failing.
 *
 * Against every surface the mark actually sits on, not just one. `--surface` is only the
 * histogram's backdrop below 800px, inside the drawer; above it the sidebar has no background of
 * its own and the bars sit on `--bg`, which is the lighter of the two in light mode and therefore
 * the binding case. The pickers' coverage fill sits in a `--border-soft` track, which is lighter
 * again.
 */
describe('flat marks stand off every surface they sit on', () => {
  for (const { name, histDim, surface, page, track } of THEMES) {
    for (const [what, bg] of [['--surface', surface], ['--bg', page], ['--border-soft', track]] as const) {
      it(`${name}: --hist-dim clears 3:1 against ${what}`, () => {
        const c = contrast(histDim, bg);
        expect(c, `${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

/**
 * The same shape as the flat-mark guard above, for TEXT: `--text-dim` is small text, so 4.5:1 is
 * the bar, and it is set on more than one backdrop. `--bg` carries the segmented groups' recessed
 * track, `--border-soft` the column picker's count badge, and `--accent-dim` a chosen setup card's
 * description — that last one is the binding case in both themes.
 *
 * Against the surfaces the token is ACTUALLY drawn on, not one representative surface: choosing a
 * dim ink against white alone is how an unselected pill's label reached production at 4.44:1.
 */
describe('dim text stands off every surface it is set on', () => {
  for (const t of THEMES) {
    for (const [what, bg] of [['--surface', t.surface], ['--bg', t.page], ['--chrome', t.chrome],
                              ['--well', t.well], ['--border-soft', t.track],
                              ['--accent-dim', t.accentDim]] as const) {
      it(`${t.name}: --text-dim clears 4.5:1 against ${what}`, () => {
        const c = contrast(t.dimInk, bg);
        expect(c, `${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

/**
 * `--accent` is a signed-off value and is never used behind text; `--accent-solid` is the darker
 * variant that is. `--on-accent` on the dark accent measures 3.71:1, which is why the two cannot be
 * one token (docs/app.md §Theming).
 */
describe('--on-accent on a filled accent', () => {
  for (const { name, accentSolid } of THEMES) {
    it(`${name}: --accent-solid clears 4.5:1 with --on-accent`, () => {
      const c = contrast(accentSolid, ON_ACCENT);
      expect(c, `${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
