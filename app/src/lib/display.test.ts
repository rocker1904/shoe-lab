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
    const got = coerceDisplay({ v: 1, betterHue: 120, strength: 'loud', curve: NaN, baseOn: true });
    expect(got.betterHue).toBe(120);
    expect(got.baseOn).toBe(true);
    // One bad number costs that number, not the four beside it that were right.
    expect(got.strength).toBe(DISPLAY_DEFAULTS.strength);
    expect(got.curve).toBe(DISPLAY_DEFAULTS.curve);
  });

  it('clamps to the sliders\' own range rather than trusting the file', () => {
    const got = coerceDisplay({ v: 1, betterHue: 4000, betterChroma: -2, strength: 9, curve: 0, floor: 40 });
    expect(got.betterHue).toBe(360);
    expect(got.betterChroma).toBe(0);
    expect(got.strength).toBe(1);
    expect(got.curve).toBe(1);
    expect(got.floor).toBe(0.5);
  });

  it('treats a non-boolean base toggle as off', () => {
    expect(coerceDisplay({ v: 1, baseOn: 'yes' }).baseOn).toBe(false);
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
    const prefs: DisplayPrefs = { ...DISPLAY_DEFAULTS, betterHue: 145, baseOn: true, strength: 0.5 };
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
    const r = resolveWash({ ...DISPLAY_DEFAULTS, betterHue: 145 });
    const css = washCss(r);
    // A single `:root` rule would paint the light tint on a runner whose OS is dark and who has
    // never touched the theme control — the failure `app.css`'s own doubled blocks exist to avoid.
    expect(css).toContain(`@media (prefers-color-scheme: dark){:root:not([data-theme='light']){--wash-blue:${r.better.dark}`);
    expect(css).toContain(`:root[data-theme='dark']{--wash-blue:${r.better.dark}`);
    expect(css).toContain(`:root{--wash-blue:${r.better.light}`);
    expect(r.better.light).not.toBe(r.better.dark);
  });

  it('installs, updates and then removes one style element', () => {
    applyDisplay({ ...DISPLAY_DEFAULTS, betterHue: 145 });
    const first = document.getElementById('wash-prefs');
    expect(first?.textContent).toContain('--wash-blue');

    applyDisplay({ ...DISPLAY_DEFAULTS, betterHue: 30 });
    // The same element re-texted, not a second one stacked on top of it.
    expect(document.querySelectorAll('#wash-prefs')).toHaveLength(1);
    expect(document.getElementById('wash-prefs')).toBe(first);

    applyDisplay(DISPLAY_DEFAULTS);
    expect(document.getElementById('wash-prefs')).toBeNull();
  });

  it('marks the document only while the two-colour rule is the one that paints', () => {
    applyDisplay({ ...DISPLAY_DEFAULTS, baseOn: true });
    expect(document.documentElement.dataset['wash']).toBe('dual');
    applyDisplay({ ...DISPLAY_DEFAULTS, betterHue: 145 });
    expect(document.documentElement.dataset['wash']).toBeUndefined();
  });
});
