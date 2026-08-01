/**
 * The version is hand-maintained and bumped when the URL encoding changes, or when what counts as
 * a default view does — a stored view from before a `defaultColumns` change reads as hand-edited
 * and would open collapsed for no visible reason. On a bump the old key is simply never read
 * again. **No migrations, ever** — losing a previous search is a trivial cost and migration code
 * is not. Deliberately not derived from the build: `main` deploys continuously, so a
 * build-derived version would discard state on every push
 * (docs/app.md §View and URL ownership).
 */
export const VIEW_STORAGE_KEY = 'shoe-lab.view.v4';

// Storage access throws where it is blocked (embedded frames, hard privacy settings) rather than
// returning null, so both directions are wrapped exactly as the theme is (docs/app.md §Theming).
export function readStoredView(): string | null {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * A genuine first arrival — no query string **and** no stored view. Two things key off it and they
 * have to answer alike: the setup strip opens on it (docs/app.md §The setup strip), and the loading
 * placeholder reserves the strip's height for it (docs/app.md §Decisions). Written once here rather
 * than in each caller, because a placeholder reserving a strip the page then did not draw would be
 * the very jump it exists to prevent.
 */
export function isFirstArrival(): boolean {
  return location.search.replace(/^\?/, '') === '' && readStoredView() === null;
}

export function writeStoredView(qs: string): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, qs);
  } catch {
    // Losing a saved view between sessions beats losing the interaction that caused it.
  }
}
