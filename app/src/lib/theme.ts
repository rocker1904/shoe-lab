export type Theme = 'auto' | 'light' | 'dark';

/** Every state the control offers, in the order it draws them (docs/app.md §Theming). */
export const THEMES: readonly Theme[] = ['auto', 'light', 'dark'];

const KEY = 'theme';

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

// Storage access throws where it is blocked (embedded frames, hard privacy settings) rather than
// returning null, and this module runs at boot — an unguarded read would take the whole app down.
function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function write(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Losing the preference between sessions beats losing the click.
  }
}

/** Called at boot rather than on mount: the dataset fetch is slow enough to flash the wrong theme. */
export function applySavedTheme(): Theme {
  const saved = read();
  return set(saved === 'light' || saved === 'dark' ? saved : 'auto');
}

/**
 * Named rather than stepped. The control is a three-pill segmented group, so the runner presses the
 * state they want and there is no order for a cycle to walk (docs/app.md §Theming).
 */
export function setTheme(theme: Theme): Theme {
  // Apply first, persist second: a throwing write must not cost the visible switch.
  const next = set(theme);
  write(next);
  return next;
}
