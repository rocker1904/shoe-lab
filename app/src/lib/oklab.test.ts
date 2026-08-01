import { describe, expect, it } from 'vitest';
import {
  contrast, hslToRgb, inGamut, labToLch, lchToLab, mixLab, oklabToRgb, over, rgb255, rgbToOklab,
  srgbToLinear, linearToSrgb, toGamutLab, toHex,
} from './oklab';

/**
 * Colour space arithmetic with no policy in it (docs/app.md §The display preferences). The wash
 * engine's guarantees are only as good as these, so each is checked against something external to
 * itself: a round trip, a published constant, or the property the function exists for.
 */
describe('sRGB transfer', () => {
  it('round-trips every 8-bit value', () => {
    for (let v = 0; v <= 255; v++) {
      const c = v / 255;
      expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 9);
    }
  });
});

describe('OKLab', () => {
  it('round-trips sRGB through OKLab and back', () => {
    const samples = [[0, 0, 0], [1, 1, 1], [0.5, 0.2, 0.9], [0.08, 0.49, 0.92], [1, 0, 0]] as const;
    for (const rgb of samples) {
      const back = oklabToRgb(rgbToOklab(rgb));
      for (let i = 0; i < 3; i++) expect(back[i]!).toBeCloseTo(rgb[i]!, 6);
    }
  });

  it('puts white and black at the ends of the lightness axis', () => {
    // The two values Björn Ottosson's own definition fixes: L = 1 at white, 0 at black, and no
    // chroma at either. A transposed matrix passes a round trip and fails this.
    const white = rgbToOklab([1, 1, 1]);
    expect(white[0]).toBeCloseTo(1, 5);
    expect(Math.hypot(white[1], white[2])).toBeCloseTo(0, 5);
    expect(rgbToOklab([0, 0, 0])[0]).toBeCloseTo(0, 6);
  });

  it('round-trips a lightness/chroma/hue triple', () => {
    const lch = labToLch(lchToLab(0.6, 0.12, 190));
    expect(lch.L).toBeCloseTo(0.6, 9);
    expect(lch.C).toBeCloseTo(0.12, 9);
    expect(lch.h).toBeCloseTo(190, 9);
  });

  it('interpolates each axis independently', () => {
    expect(mixLab([0, 0, 0], [1, 0.2, -0.4], 0.25)).toEqual([0.25, 0.05, -0.1]);
  });
});

describe('toGamutLab', () => {
  /**
   * The engine's one guarantee about colour: a hue change never moves lightness, because contrast
   * is very nearly luminance and luminance is what the 4.5:1 bar reads. Clipping the linear
   * channels — the obvious alternative to this bisection — moves it by however much it clipped.
   */
  it('holds lightness exactly at every hue, however unreachable the chroma', () => {
    for (let h = 0; h < 360; h += 5) {
      const lab = toGamutLab(0.5937, 0.4, h);
      expect(lab[0], `hue ${h}`).toBe(0.5937);
      expect(inGamut(lab), `hue ${h} left the gamut`).toBe(true);
    }
  });

  it('leaves a reachable colour untouched', () => {
    expect(toGamutLab(0.6, 0.05, 255)).toEqual(lchToLab(0.6, 0.05, 255));
  });

  it('gives back as much chroma as sRGB holds', () => {
    // Reduced, not zeroed: an unreachable request should still be as colourful as it can be.
    const lab = toGamutLab(0.5937, 0.4, 255);
    expect(labToLch(lab).C).toBeGreaterThan(0.1);
    expect(labToLch(lab).C).toBeLessThan(0.4);
  });
});

describe('WCAG', () => {
  it('measures the two ratios the standard fixes', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    expect(contrast([120, 120, 120], [120, 120, 120])).toBeCloseTo(1, 9);
  });

  it('is symmetric in its arguments', () => {
    expect(contrast([0x14, 0x7c, 0xeb], [0x16, 0x18, 0x1b]))
      .toBeCloseTo(contrast([0x16, 0x18, 0x1b], [0x14, 0x7c, 0xeb]), 9);
  });
});

describe('over', () => {
  it('gives the surface back at zero alpha and the fill at one', () => {
    expect(over([20, 30, 40], 0, [255, 255, 255])).toEqual([255, 255, 255]);
    expect(over([20, 30, 40], 1, [255, 255, 255])).toEqual([20, 30, 40]);
  });
});

describe('reading a token back', () => {
  it('resolves the light wash fill to the byte value app.css paints', () => {
    // `--wash-blue: hsl(211 84% 50%)`, which every figure in wash.test.ts is computed from.
    expect(toHex(hslToRgb(211, 0.84, 0.50))).toBe('#147ceb');
    expect(rgb255(hslToRgb(211, 0.70, 0.44))).toEqual([0x22, 0x6e, 0xbf]);
  });

  it('walks all six sectors of the wheel', () => {
    // One sector per branch, and the branch chain is the only place this function can be wrong:
    // the tokens it is written for all live in one sector, so nothing else would catch a swap.
    const seen = [0, 60, 120, 180, 240, 300].map((h) => toHex(hslToRgb(h, 1, 0.5)));
    expect(seen).toEqual(['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff']);
  });
});
