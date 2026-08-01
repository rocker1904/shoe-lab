import { describe, expect, it } from 'vitest';
import { labToLch, mixLab, oklabToRgb, rgb255, rgbToOklab } from './oklab';
import {
  DEFAULT_PAINT, DISPLAY_DEFAULTS, greyAlpha, rankedAlpha, rankedMix, resolveWash, washAlpha,
  WASH_FLOOR, WASH_PEAK, WASH_THEMES, type DisplayPrefs, type ThemeName, type WashPaint,
} from './wash';

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
 * surface it is ACTUALLY on: above 1180px the sidebar declares no background, so the histogram bars
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
 * histogram's backdrop below 1180px, inside the drawer; above it the sidebar has no background of
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

/**
 * The engine's own table is the one home for the four values it computes with, so the assertion
 * material above must agree with it or the guard and the paint are measuring different colours.
 * Pinned here rather than in `tokens.test.ts` because that file reads `app.css` and this one holds
 * the resolved bytes: three homes for one fact is what this closes (docs/app.md §Theming).
 */
describe('the engine reads the same tokens this file asserts against', () => {
  for (const t of THEMES) {
    it(`${t.name}: surface, ink, accent and wash fill agree`, () => {
      const e = WASH_THEMES[t.name as ThemeName];
      expect([...e.surface]).toEqual(t.surface);
      expect([...e.ink]).toEqual(t.ink);
      expect([...e.accent]).toEqual(t.accent);
      expect([...e.blue]).toEqual(t.washFill);
    });
  }
});

/**
 * **The default state paints what it always painted.** A runner who never opens the Display menu
 * must get the ramp that shipped before the menu existed, to the bit — the alphas from the frozen
 * closed form above, and `app.css`'s own `--wash-blue` rather than a reconstruction of it
 * (docs/app.md §The display preferences).
 *
 * `washAlpha` is written out separately in `wash.ts` precisely so this comparison is between two
 * implementations rather than a function and itself.
 */
describe('the shipped ramp at the default preferences', () => {
  const r = resolveWash(DISPLAY_DEFAULTS);

  it('leaves the stylesheet alone entirely', () => {
    expect(r.tokenFill).toBe(true);
    expect(r.better.light).toBe('#147ceb');
    expect(r.better.dark).toBe('#226ebf');
  });

  it('resolves to the three frozen constants and paints at the frozen peak', () => {
    expect(r.paint).toEqual(DEFAULT_PAINT);
    expect(r.peak).toBe(WASH_PEAK);
    expect(r.capped).toBe(false);
  });

  /**
   * The trap the point-3 retune walks into (BACKLOG 16): `usesTokenFill` keys off these two
   * numbers, so moving them without moving `--wash-blue` with them leaves the panel reading one
   * colour while the default state paints another. Held to the sliders' own steps — 1° and 0.001 —
   * because that is the finest the defaults can be stated in.
   */
  it('states the default colour as the light token, to the step the slider can hold', () => {
    const token = labToLch(rgbToOklab(WASH_THEMES.light.blue.map((v) => v / 255) as [number, number, number]));
    expect(Math.abs(token.h - DISPLAY_DEFAULTS.betterHue), `token hue ${token.h.toFixed(2)}°`)
      .toBeLessThanOrEqual(0.5);
    expect(Math.abs(token.C - DISPLAY_DEFAULTS.betterChroma), `token chroma ${token.C.toFixed(4)}`)
      .toBeLessThanOrEqual(0.0005);
  });

  it('reproduces the alpha of every step of the shipped curve exactly', () => {
    for (let i = 0; i <= 400; i++) {
      const p = i / 400;
      expect(rankedAlpha(p, r.paint), `p=${p}`).toBe(washAlpha(p));
    }
  });

  it('carries lightness, so the ramp reads without hue at all', () => {
    expect(r.hueOnly).toBe(false);
    expect(r.lightnessSpan).toBeGreaterThan(0.2);
  });
});

/**
 * The composite the STYLESHEET performs, rebuilt from the resolved values alone — hex fills, the
 * paint, nothing reaching into the engine's internals. Two implementations of the same claim is
 * the whole value of the sweep below: a solver checked against its own cell function proves
 * nothing about what a cell paints.
 */
function paintedCell(theme: typeof THEMES[number], r: ReturnType<typeof resolveWash>, p: number): number[] {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const name = theme.name as ThemeName;
  const better = hex(r.better[name]);
  if (!r.paint.dual) return over(better, rankedAlpha(p, r.paint), theme.surface);
  // `color-mix(in oklab, --wash-blue W%, --wash-base)`, which is what the dual cell rule writes.
  const lab = mixLab(rgbToOklab(hex(r.base[name]).map((v) => v / 255) as [number, number, number]),
                     rgbToOklab(better.map((v) => v / 255) as [number, number, number]),
                     rankedMix(p, r.paint));
  return over(rgb255(oklabToRgb(lab)), r.paint.peak, theme.surface);
}

/**
 * **The solver's property**, and the reason the menu can ship at all: over a grid of preference
 * states no runner would choose but every one of which the sliders can reach, the ramp the app
 * actually paints holds the theme's own ink at 4.5:1 — swept whole, hovered, in both themes.
 *
 * Swept rather than sampled at the endpoint, because with the base on the ramp is not monotone in
 * alpha at all: every cell carries the same one, and the colour is what moves. Hovered, because a
 * pointed-at cell is a third layer and the app's real worst case (§Theming). Both themes at ONE
 * strength, because that is what ships: the painted peak is the lower of the two caps, so a runner
 * whose OS flips to dark at sunset does not need a repaint to stay legible.
 *
 * The grid is what makes this a guard rather than an example. Where the old suite asserted the
 * shipped constants, a preference layer means the constants are a starting point and the property
 * is the contract.
 */
describe('every preference state the sliders can reach stays legible', () => {
  const HUES = [0, 55, 110, 165, 220, 275, 330];
  const CHROMAS = [0.02, 0.188, 0.37];
  const STRENGTHS = [0.4, 1];
  const CURVES = [1, 1.8, 4];

  const states: DisplayPrefs[] = [];
  for (const betterHue of HUES) {
    for (const betterChroma of CHROMAS) {
      for (const strength of STRENGTHS) {
        for (const curve of CURVES) {
          for (const baseOn of [false, true]) {
            states.push({ ...DISPLAY_DEFAULTS, betterHue, betterChroma, strength, curve, baseOn,
              // The base sits opposite the better colour, which is the arrangement that stresses
              // the mix hardest: a base near the better hue barely moves along the ramp.
              baseHue: (betterHue + 180) % 360, baseChroma: betterChroma, floor: baseOn ? 0 : 0.15 });
          }
        }
      }
    }
  }

  it(`holds 4.5:1 across ${states.length} states, both themes, hovered`, () => {
    let worst = Infinity;
    let worstAt = '';
    for (const prefs of states) {
      const r = resolveWash(prefs);
      // Never more than asked for, and never more than the guard allows.
      expect(r.peak).toBeLessThanOrEqual(prefs.strength);
      expect(r.peak).toBeLessThanOrEqual(r.cap + 1e-9);
      for (const theme of THEMES) {
        for (let i = 0; i <= 120; i++) {
          const p = i / 120;
          const hovered = over(theme.accent, HOVER_ALPHA, paintedCell(theme, r, p));
          const c = contrast(hovered, theme.ink);
          if (c < worst) {
            worst = c;
            worstAt = `${theme.name} p=${p.toFixed(2)} hue=${prefs.betterHue} C=${prefs.betterChroma} `
              + `s=${prefs.strength} curve=${prefs.curve} base=${prefs.baseOn} peak=${r.peak.toFixed(3)}`;
          }
        }
      }
    }
    expect(worst, `worst ${worst.toFixed(3)}:1 at ${worstAt}`).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * The cap is the thing the panel talks about, so its shape is worth pinning: it binds where the ink
 * is under pressure and does not where it is not, and the theme it names is the one that bound.
 */
describe('the cap and the theme that binds it', () => {
  const at = (over: Partial<DisplayPrefs>) => resolveWash({ ...DISPLAY_DEFAULTS, ...over });

  it('leaves the default blue uncapped at the shipped strength', () => {
    const r = at({});
    expect(r.cap).toBeGreaterThan(WASH_PEAK);
    expect(r.capped).toBe(false);
  });

  it('binds on the light theme for a red and on the dark for a green', () => {
    // WCAG luminance is 71% green, so at ONE pinned OKLab lightness a red is far darker in the
    // sense the contrast rule measures than a green is. A dark fill on white pulls the cell toward
    // the light theme's near-black ink; a bright one on near-black pulls it toward the dark theme's
    // near-white ink. The two themes therefore bind on opposite halves of the wheel — measured:
    // red 29° caps light at 0.74 and leaves dark uncapped, green 145° caps dark at 0.92 and leaves
    // light uncapped. One cap could not have covered both.
    expect(at({ betterHue: 29, betterChroma: 0.37, strength: 1 }).binding).toBe('light');
    expect(at({ betterHue: 145, betterChroma: 0.37, strength: 1 }).binding).toBe('dark');
  });

  it('reports itself capped only when the runner asked past the cap', () => {
    const r = at({ betterHue: 29, betterChroma: 0.37, strength: 1 });
    expect(r.capped).toBe(true);
    expect(r.peak).toBe(r.cap);
    expect(at({ betterHue: 29, betterChroma: 0.37, strength: 0.2 }).capped).toBe(false);
  });
});

/**
 * The base-on warning. Both tints sit at the SAME pinned lightness — that is the guard — so a
 * two-colour ramp separates its ends by hue and by nothing else, at every setting rather than
 * occasionally. The panel says so; this is what makes the saying true
 * (docs/app.md §The display preferences).
 */
describe('the base-on ramp carries no lightness', () => {
  it('warns for a red → green ramp, and not for the single-colour one', () => {
    const rg = resolveWash({ ...DISPLAY_DEFAULTS, baseOn: true, baseHue: 29, baseChroma: 0.16,
                             betterHue: 145, betterChroma: 0.16, curve: 1.4 });
    expect(rg.hueOnly).toBe(true);
    expect(rg.lightnessSpan).toBeLessThan(0.01);
    expect(resolveWash(DISPLAY_DEFAULTS).hueOnly).toBe(false);
  });

  it('tints the worst cell as strongly as the best, so alpha says nothing', () => {
    const r = resolveWash({ ...DISPLAY_DEFAULTS, baseOn: true });
    expect(rankedAlpha(0, r.paint)).toBe(r.peak);
    expect(rankedAlpha(1, r.paint)).toBe(r.peak);
    // …and the colour is what moves instead.
    expect(rankedMix(0, r.paint)).toBe(0);
    expect(rankedMix(1, r.paint)).toBe(1);
  });
});

/** The knobs do what their labels say, which no contrast sweep can catch. */
describe('the ramp shape follows its preferences', () => {
  const paint = (o: Partial<WashPaint>): WashPaint => ({ ...DEFAULT_PAINT, ...o });

  it('starts painting exactly where the floor says', () => {
    expect(rankedAlpha(0.3, paint({ floor: 0.3 }))).toBe(0);
    expect(rankedAlpha(0.31, paint({ floor: 0.3 }))).toBeGreaterThanOrEqual(0);
    expect(rankedAlpha(0.2, paint({ floor: 0 }))).toBeGreaterThan(0);
  });

  it('makes a higher emphasis more of a podium', () => {
    const mid = 0.6;
    expect(rankedAlpha(mid, paint({ curve: 4 }))).toBeLessThan(rankedAlpha(mid, paint({ curve: 1 })));
    // …and leaves the top of the ramp where it is, whatever the exponent.
    expect(rankedAlpha(1, paint({ curve: 4 }))).toBeCloseTo(rankedAlpha(1, paint({ curve: 1 })), 12);
  });

  it('still paints nothing where a tint would be invisible', () => {
    expect(rankedAlpha(0.16, paint({ peak: 0.02 }))).toBe(0);
  });
});
