export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'theme';
const NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };

function set(theme: Theme): Theme {
  // 'auto' is the absence of an override, so the OS preference media query takes over again.
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  return theme;
}

export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'auto';
}

/** Called at boot rather than on mount: the dataset fetch is slow enough to flash the wrong theme. */
export function applySavedTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  return set(saved === 'light' || saved === 'dark' ? saved : 'auto');
}

export function cycleTheme(): Theme {
  const next = NEXT[currentTheme()];
  localStorage.setItem(KEY, next);
  return set(next);
}
