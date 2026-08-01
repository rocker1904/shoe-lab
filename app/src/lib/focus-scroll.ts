/**
 * The app replaced the browser's focus ring, and a ring is only as good as the browser's willingness
 * to scroll the thing wearing it into view. Measured across the three engines on the same 90-stop
 * Tab walk, that willingness is not a shared behaviour:
 *
 * - **WebKit never scrolls the sidebar at all** while Tab walks it. `.sidebar` is sticky with its
 *   own `overflow-y`, and before the page has been scrolled its box runs 130px past the foot of the
 *   window — so 24 consecutive stops (16 in the phone drawer) were focused with nothing visible
 *   anywhere on screen.
 * - **Firefox declines to scroll a control that is already partly visible**, so the row at the foot
 *   of a list keeps focus with 7px of itself, and all of its ring, below the clip edge. It also
 *   ignores `scroll-padding` when it does scroll, where Chromium honours it.
 * - **Chromium honours both** — which is exactly why this was invisible for so long.
 *
 * So the scroll is the app's too, computed rather than asked for: `scrollIntoView` is the browser's
 * own heuristic under another name and reproduces the Firefox half. The room to leave is read back
 * from the port's `scroll-padding` rather than restated here, so `--ring-room` in `app.css` stays
 * the one home for the number (docs/app.md §Theming).
 *
 * There is no animation to reduce: every engine's own focus scroll is instant, and a Tab held down
 * through a 45-stop sidebar would otherwise queue 45 animations. `prefers-reduced-motion` therefore
 * has nothing to change here — the deliberate scroll is already the reduced one.
 */

/**
 * How far a scrollport must scroll so an element sits `room` inside it: negative to reveal
 * something above, positive for something below, 0 when it already fits.
 *
 * A control taller than the port is aligned to the port's top rather than chased to its bottom,
 * because the top is where the label and the ring's first edge are.
 */
export function scrollDelta(
  port: { top: number; height: number },
  el: { top: number; bottom: number },
  room: number,
): number {
  const above = el.top - room - port.top;
  if (above < 0) return above;
  const below = el.bottom + room - (port.top + port.height);
  return below > 0 ? Math.min(below, el.top - room - port.top) : 0;
}

/** The scrollports between `el` and the document, innermost first. */
const portsAbove = (el: Element): HTMLElement[] => {
  const out: HTMLElement[] = [];
  for (let n = el.parentElement; n; n = n.parentElement) if (n.classList.contains('scrollport')) out.push(n);
  return out;
};

/**
 * Keeps whatever takes focus inside every scrollport it sits in, and inside the window. The window
 * half is delegated to `scrollIntoView` and gated on the control being outside it, because that is
 * the WebKit case and the two engines that already scroll must not be given a second opinion.
 *
 * One delegated listener rather than one per port: `.scrollport` is what marks a port
 * (docs/app.md §Theming), so a fifth one is covered the day it is added rather than the day
 * somebody remembers to wire it up.
 */
export function keepFocusInScrollports(root: Document = document): () => void {
  const onfocus = (e: FocusEvent) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    const ports = portsAbove(el);
    // Nothing outside a scrollport is touched, window check included: the table and the chrome are
    // the browser's to scroll, and a second opinion there is how a page starts fighting its own
    // sticky header.
    if (!ports.length) return;
    for (const port of ports) {
      const room = parseFloat(getComputedStyle(port).scrollPaddingTop) || 0;
      const box = port.getBoundingClientRect();
      const delta = scrollDelta({ top: box.top, height: box.height }, el.getBoundingClientRect(), room);
      if (delta !== 0) port.scrollTop += delta;
    }
    const b = el.getBoundingClientRect();
    if (b.top < 0 || b.bottom > (root.defaultView?.innerHeight ?? 0)) el.scrollIntoView({ block: 'nearest' });
  };
  root.addEventListener('focusin', onfocus, true);
  return () => root.removeEventListener('focusin', onfocus, true);
}
