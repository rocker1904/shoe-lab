/**
 * The version is hand-maintained and bumped when the URL encoding changes; on a bump the old key
 * is simply never read again. **No migrations, ever** — losing a previous search is a trivial
 * cost and migration code is not. Deliberately not derived from the build: `main` deploys
 * continuously, so a build-derived version would discard state on every push
 * (docs/app.md §View and URL ownership).
 */
export const VIEW_STORAGE_KEY = 'shoe-lab.view.v2';

// Storage access throws where it is blocked (embedded frames, hard privacy settings) rather than
// returning null, so both directions are wrapped exactly as the theme is (docs/app.md §Theming).
export function readStoredView(): string | null {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredView(qs: string): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, qs);
  } catch {
    // Losing a saved view between sessions beats losing the interaction that caused it.
  }
}
