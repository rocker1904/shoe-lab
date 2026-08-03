/**
 * The LAYOUT width, and the one way to keep an answer to it live.
 *
 * `documentElement.clientWidth`, not `innerWidth`: it excludes a classic scrollbar, and the fleet
 * never fits on one screen, so there is always one — counting its 12–15px as room for the table is
 * how a model comes to
 * mount a table that then overflows (docs/app.md §Two renderings, and only one of them mounted).
 * jsdom lays nothing out and reports 0, so `innerWidth` is the fallback and the suite's window is a
 * real number.
 *
 * **A `ResizeObserver`, not a `resize` listener**, and that is the whole reason this file exists.
 * A `resize` event says the WINDOW moved; the layout width also moves when it did not — a filter
 * cleared or a row opened makes the document tall enough for a classic scrollbar, which takes its
 * 12–15px out of the layout with no event of any kind. Inferred from window events the width went
 * stale exactly there, and the table stayed one that no longer fitted. Observing the element whose
 * width is being asked about answers both causes with one subscription.
 *
 * Nothing here holds state: the callback re-reads rather than trusting the entry, because the entry
 * reports the observed box and the fallback above is about the window.
 */
export const layoutWidth = (): number =>
  document.documentElement.clientWidth || window.innerWidth;

/**
 * Calls back with the layout width now and on every change to it, and returns the teardown — the
 * shape an `$effect` returns directly, so a component owns no observer of its own.
 */
export function observeLayoutWidth(onwidth: (px: number) => void): () => void {
  onwidth(layoutWidth());
  const observer = new ResizeObserver(() => onwidth(layoutWidth()));
  observer.observe(document.documentElement);
  return () => observer.disconnect();
}
