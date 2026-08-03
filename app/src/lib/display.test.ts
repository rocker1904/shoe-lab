import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDisplay, coerceDisplay, installWash, readDisplay, washCss, writeDisplay } from './display';
import {
  DISPLAY_DEFAULTS, resolveWash, washBucketValue, washClass, WASH_STEPS,
  type DisplayPrefs, type WashRamp,
} from './wash';

beforeEach(() => {
  localStorage.clear();
  document.getElementById('wash-prefs')?.remove();
  document.getElementById('wash-buckets')?.remove();
});

/**
 * Storage is a public app's most hostile input: it survives a version, it is hand-editable, and
 * anything that reaches the ramp as a NaN paints nothing at all
 * (docs/app.md §The display preferences).
 */
describe('reading a stored preference', () => {
  it('gives the defaults for anything that is not a preference', () => {
    for (const junk of [null, 3, 'x', [], {}, { v: 99, strength: 0.2 }]) {
      expect(coerceDisplay(junk)).toEqual(DISPLAY_DEFAULTS);
    }
  });

  it('keeps the fields it can read and defaults only the ones it cannot', () => {
    const got = coerceDisplay({ v: 2, primaryHue: 120, strength: 'loud', curve: NaN, baseOn: true });
    expect(got.primaryHue).toBe(120);
    expect(got.baseOn).toBe(true);
    // One bad number costs that number, not the four beside it that were right.
    expect(got.strength).toBe(DISPLAY_DEFAULTS.strength);
    expect(got.curve).toBe(DISPLAY_DEFAULTS.curve);
  });

  it('clamps to the sliders\' own range rather than trusting the file', () => {
    const got = coerceDisplay({ v: 2, primaryHue: 4000, primaryChroma: -2, strength: 9, curve: 0, floor: 40 });
    expect(got.primaryHue).toBe(360);
    expect(got.primaryChroma).toBe(0);
    expect(got.strength).toBe(1);
    expect(got.curve).toBe(1);
    expect(got.floor).toBe(0.5);
  });

  it('treats a non-boolean base toggle as off', () => {
    expect(coerceDisplay({ v: 2, baseOn: 'yes' }).baseOn).toBe(false);
  });

  it('survives storage that is unreadable, unwritable or holds nonsense', () => {
    localStorage.setItem('display', '{not json');
    expect(readDisplay()).toEqual(DISPLAY_DEFAULTS);

    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readDisplay()).toEqual(DISPLAY_DEFAULTS);
    get.mockRestore();

    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => writeDisplay(DISPLAY_DEFAULTS)).not.toThrow();
    set.mockRestore();
  });

  it('round-trips a state it has written', () => {
    const prefs: DisplayPrefs = { ...DISPLAY_DEFAULTS, primaryHue: 145, baseOn: true, strength: 0.5 };
    writeDisplay(prefs);
    expect(readDisplay()).toEqual(prefs);
  });
});

/**
 * The stylesheet, and the one claim the whole wave hangs on: at the default state there is no
 * stylesheet. A runner who never opens the menu gets `app.css` untouched, in both themes.
 */
describe('the override stylesheet', () => {
  it('writes nothing at all at the default preferences', () => {
    expect(washCss(resolveWash(DISPLAY_DEFAULTS))).toBe('');
    applyDisplay(DISPLAY_DEFAULTS);
    expect(document.getElementById('wash-prefs')).toBeNull();
  });

  it('gives the dark tint to both ways of asking for dark', () => {
    const r = resolveWash({ ...DISPLAY_DEFAULTS, primaryHue: 145 });
    const css = washCss(r);
    // A single `:root` rule would paint the light tint on a runner whose OS is dark and who has
    // never touched the theme control — the failure `app.css`'s own doubled blocks exist to avoid.
    expect(css).toContain(`@media (prefers-color-scheme: dark){:root:not([data-theme='light']){--wash-blue:${r.better.dark}`);
    expect(css).toContain(`:root[data-theme='dark']{--wash-blue:${r.better.dark}`);
    expect(css).toContain(`:root{--wash-blue:${r.better.light}`);
    expect(r.better.light).not.toBe(r.better.dark);
  });

  /**
   * The accent family rides in the same rule as the wash, because it is the same preference: one
   * primary colour drives the tint the leaders carry and the chrome that stands around them
   * (docs/app.md §Theming). A stylesheet that moved one without the other is a table wearing the
   * runner's green under a blue toolbar.
   */
  it('writes the whole accent family beside the wash, per theme', () => {
    const r = resolveWash({ ...DISPLAY_DEFAULTS, primaryHue: 145 });
    const css = washCss(r);
    for (const theme of ['light', 'dark'] as const) {
      for (const [token, value] of [['--accent', r.accents[theme].accent],
                                    ['--accent-solid', r.accents[theme].accentSolid],
                                    ['--accent-dim', r.accents[theme].accentDim]] as const) {
        expect(css, `${theme} ${token}`).toContain(`${token}:${value}`);
      }
    }
    // Every block that carries a wash carries a family: a `prefers-color-scheme` rule that moved
    // the tint and left the accent behind is the half-repaint this shape exists to prevent.
    for (const line of css.split('\n')) expect(line).toContain('--accent-dim:');
    // `--hover-wash` is `color-mix(…, var(--accent) 6%, …)` in `app.css`, so it follows by
    // construction; a declaration here would be a second home for the 6%.
    expect(css).not.toContain('--hover-wash');
  });

  it('installs, updates and then removes one style element', () => {
    applyDisplay({ ...DISPLAY_DEFAULTS, primaryHue: 145 });
    const first = document.getElementById('wash-prefs');
    expect(first?.textContent).toContain('--wash-blue');

    applyDisplay({ ...DISPLAY_DEFAULTS, primaryHue: 30 });
    // The same element re-texted, not a second one stacked on top of it.
    expect(document.querySelectorAll('#wash-prefs')).toHaveLength(1);
    expect(document.getElementById('wash-prefs')).toBe(first);

    applyDisplay(DISPLAY_DEFAULTS);
    expect(document.getElementById('wash-prefs')).toBeNull();
  });

});

/**
 * The bucket stylesheet: one `background-color` per bucket per ramp, so a painted cell names a
 * class and carries no value at all (docs/app.md §Theming).
 *
 * It is a SEPARATE sheet from the override above and always present, which is what lets the
 * override stay absent at the default colour: these rules apply an alpha to whatever `--wash-blue`
 * currently resolves to, so `app.css`'s own token still reaches the screen untouched.
 */
describe('the bucket stylesheet', () => {
  const sheet = () => document.getElementById('wash-buckets')?.textContent ?? '';

  /** Every rule in the sheet, keyed by its one class selector, with a duplicate declared a failure. */
  function rules(css: string): Map<string, string> {
    const found = new Map<string, string>();
    for (const [, cls, body] of css.matchAll(/\.([\w-]+)\{([^}]*)\}/g)) {
      expect(found.has(cls!), `${cls} declared twice`).toBe(false);
      found.set(cls!, body!);
    }
    return found;
  }
  /** What a rule composites the named token at, as a fraction — the value the cell used to carry. */
  function tokenPct(body: string, token: string): number {
    return Number(new RegExp(`var\\(${token}\\) ([\\d.]+)%`).exec(body)![1]) / 100;
  }
  function classesFor(ramps: readonly WashRamp[]): Set<string> {
    const want = new Set<string>();
    for (const ramp of ramps) for (let i = 0; i <= WASH_STEPS; i++) want.add(washClass(ramp, i));
    return want;
  }

  it('declares one rule per bucket, on each ramp the paint uses', () => {
    const r = resolveWash(DISPLAY_DEFAULTS);
    installWash(r);
    const declared = rules(sheet());
    expect(new Set(declared.keys())).toEqual(classesFor(['blue', 'grey']));
    for (const [ramp, token] of [['blue', '--wash-blue'], ['grey', '--wash-grey']] as const) {
      for (let i = 0; i <= WASH_STEPS; i++) {
        expect(tokenPct(declared.get(washClass(ramp, i))!, token), `${ramp} ${i}`)
          .toBeCloseTo(washBucketValue(ramp, i, r.paint), 8);
      }
    }
  });

  /** Present where the override sheet is not — the whole point of keeping them two sheets. */
  it('paints from the stylesheet\'s own tokens at the default preferences', () => {
    applyDisplay(DISPLAY_DEFAULTS);
    expect(document.getElementById('wash-prefs')).toBeNull();
    expect(sheet()).toContain('var(--wash-blue)');
    expect(sheet()).toContain('var(--wash-grey)');
  });

  it('re-texts one element per preference change, and leaves the neutral ramp alone', () => {
    applyDisplay(DISPLAY_DEFAULTS);
    const first = document.getElementById('wash-buckets');
    const before = rules(sheet());

    applyDisplay({ ...DISPLAY_DEFAULTS, strength: 0.5 });
    expect(document.querySelectorAll('#wash-buckets')).toHaveLength(1);
    expect(document.getElementById('wash-buckets')).toBe(first);
    const after = rules(sheet());
    // The strength scales the ranked ramp's own top, so the top bucket now paints at it…
    expect(tokenPct(after.get(washClass('blue', WASH_STEPS))!, '--wash-blue')).toBeCloseTo(0.5, 8);
    expect(after.get(washClass('blue', 64))).not.toBe(before.get(washClass('blue', 64)));
    // …and the neutral ramp takes no preference at all (docs/app.md §The display preferences).
    expect(after.get(washClass('grey', 64))).toBe(before.get(washClass('grey', 64)));
  });

  /**
   * Base on: alpha is flat at the peak and the COLOUR carries the magnitude, so the ranked cells
   * move to a ramp of their own rather than the blue class name meaning a second thing.
   */
  it('declares the two-colour rules only while the base is on', () => {
    applyDisplay(DISPLAY_DEFAULTS);
    expect(sheet()).not.toContain('--wash-base');

    const r = resolveWash({ ...DISPLAY_DEFAULTS, baseOn: true });
    installWash(r);
    const declared = rules(sheet());
    expect(new Set(declared.keys())).toEqual(classesFor(['mix', 'grey']));
    const outer = new Set<string>();
    for (let i = 0; i <= WASH_STEPS; i++) {
      const body = declared.get(washClass('mix', i))!;
      expect(tokenPct(body, '--wash-blue'), `mix ${i}`).toBeCloseTo(washBucketValue('mix', i, r.paint), 8);
      expect(body).toContain('var(--wash-base)');
      outer.add(/\) ([\d.]+)%,transparent\)$/.exec(body)![1]!);
    }
    // One flat strength across every bucket: with the base on, only the inner mix moves.
    expect([...outer]).toHaveLength(1);
    expect(Number([...outer][0]) / 100).toBeCloseTo(r.paint.peak, 8);
  });
});
