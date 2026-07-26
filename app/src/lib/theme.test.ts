import { beforeEach, describe, expect, it } from 'vitest';
import { applySavedTheme, currentTheme, cycleTheme } from './theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

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
});
