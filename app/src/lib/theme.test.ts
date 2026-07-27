import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applySavedTheme, currentTheme, cycleTheme } from './theme';

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
  it('cycles auto → light → dark → auto, persisting each step', () => {
    expect(cycleTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(cycleTheme()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(cycleTheme()).toBe('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('theme')).toBe('auto');
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
    expect(cycleTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
