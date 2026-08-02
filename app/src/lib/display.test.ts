import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDisplay, coerceDisplay, readDisplay, washCss, writeDisplay } from './display';
import { DISPLAY_DEFAULTS, resolveWash, type DisplayPrefs } from './wash';

beforeEach(() => {
  localStorage.clear();
  document.getElementById('wash-prefs')?.remove();
  delete document.documentElement.dataset['wash'];
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
    expect(document.documentElement.dataset['wash']).toBeUndefined();
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

  it('marks the document only while the two-colour rule is the one that paints', () => {
    applyDisplay({ ...DISPLAY_DEFAULTS, baseOn: true });
    expect(document.documentElement.dataset['wash']).toBe('dual');
    applyDisplay({ ...DISPLAY_DEFAULTS, primaryHue: 145 });
    expect(document.documentElement.dataset['wash']).toBeUndefined();
  });
});
