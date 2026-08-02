import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applySavedTheme, currentTheme, setTheme, THEMES } from './theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.restoreAllMocks());

describe('theme', () => {
  it('defaults to auto with no attribute set', () => {
    expect(applySavedTheme()).toBe('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(currentTheme()).toBe('auto');
  });
  it('applies a saved choice', () => {
    localStorage.setItem('theme', 'dark');
    expect(applySavedTheme()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
  it('ignores junk in storage', () => {
    localStorage.setItem('theme', 'neon');
    expect(applySavedTheme()).toBe('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
  /** Every state the segmented control offers is reachable from every other one, in one press. */
  it('applies and persists each named theme from any other', () => {
    for (const from of THEMES) {
      for (const to of THEMES) {
        setTheme(from);
        expect(setTheme(to)).toBe(to);
        expect(document.documentElement.dataset.theme).toBe(to === 'auto' ? undefined : to);
        expect(localStorage.getItem('theme')).toBe(to);
      }
    }
  });
  // Storage access throws outright where it is blocked (embedded frames, hard privacy settings), and this
  // runs at boot: an unguarded read would blank the whole app.
  it('falls back to auto when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(applySavedTheme()).toBe('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
  it('still switches the theme when writing storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(setTheme('light')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
