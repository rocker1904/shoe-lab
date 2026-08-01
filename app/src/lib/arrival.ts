/**
 * A bare arrival — no query string, so nothing was carried in and the table opens on the defaults.
 * It is a fresh start rather than a first visit: view state lives in the URL and nowhere else, so a
 * runner who filtered last week and returns to the bare address gets the default table again
 * (docs/app.md §View and URL ownership).
 *
 * Two things key off it and they have to answer alike: the setup strip opens on it
 * (docs/app.md §The setup strip), and the loading placeholder reserves the strip's height for it
 * (docs/app.md §Decisions). Written once here rather than in each caller, because a placeholder
 * reserving a strip the page then did not draw would be the very jump it exists to prevent.
 */
export function isBareArrival(): boolean {
  return location.search.replace(/^\?/, '') === '';
}
