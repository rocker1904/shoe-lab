/**
 * What the table body renders: a run of real shoes bracketed by spacers that stand in for the ones
 * left out (docs/specs/2026-08-03-virtualising-the-table.md §What this changes, in one line).
 *
 * **A plan rather than a first and last index**, which is what a virtualiser usually returns. Two
 * things survive scrolling past them — an expanded row and the focused row — so the rendered set is
 * not an interval, and an interval-shaped answer would have to be widened to reach a kept shoe at
 * the far end of the fleet, rendering everything in between (spec §Decisions, *The window is what is
 * on screen, plus what the runner has claimed*).
 *
 * **In document order, so a kept shoe sits BETWEEN two gaps rather than being hoisted.** A table row
 * cannot be taken out of flow — `position: absolute` on a `<tr>` removes it from its row group — so
 * the only thing that can put a row where the scrollbar says it is, is the spacer above it. Which
 * means a kept shoe above the window splits that spacer in two rather than moving.
 *
 * **Pure, and that is what makes it testable at all.** Every other half of this change is a
 * measurement in an engine; this half is arithmetic, and arithmetic asserted entry by entry cannot
 * be wrong in a position while looking right in total. Heights come from `row-height.ts`, the
 * viewport and scroll offset from the component, and none of the three is read here.
 */

/** One shoe: what it is keyed by, and what the table will render it at. */
export interface VirtualItem { readonly key: string; readonly height: number }

/** A spacer standing for one or more shoes, or a shoe to render, by index into `items`. */
export type VirtualEntry =
  | { readonly kind: 'gap'; readonly px: number }
  | { readonly kind: 'item'; readonly index: number };

/**
 * The plan for one scroll position.
 *
 * **`scrollTop` is in the items' own space**, where 0 is the top of the first item — not the
 * scrollport's `scrollTop`, which counts from the top of the document and therefore includes the
 * chrome, the toolbar and the table's own header. The caller subtracts the body's offset, because
 * the caller is the only one that can measure it.
 *
 * **`viewportPx <= 0` renders everything**, and it is the honest answer rather than a test
 * affordance: jsdom lays nothing out, and so does this app before its first measured frame. A window
 * computed from a viewport of zero would window the fleet down to the one item at the scroll offset,
 * which is a blank table wherever the measurement has not happened yet — the same fallback
 * `fit.ts` and `row-height.ts` already take where they cannot measure (spec §Failure behaviour).
 *
 * **An item renders when its box TOUCHES the window**, not when it strictly overlaps. The difference
 * is one row at each edge, which the overscan already pays for many times over, and it is what makes
 * a zero-height item — a shoe measured at nothing, which `row-height.ts` can answer during a face
 * swap — behave like the position it occupies rather than falling through every comparison. The
 * window itself is the viewport grown by `overscanPx` at BOTH ends, because scrolling up has to be
 * as cheap as scrolling down.
 *
 * **A gap is emitted for every run of skipped items and for no empty run**, so the plan accounts for
 * every item exactly once: a kept shoe next to the window produces no gap at all rather than a 0px
 * one, and a run of zero-height shoes produces a 0px gap rather than vanishing. Its `px` is the
 * summed height of exactly the items it replaces — never a count times an average, which is the
 * estimate this whole change was chosen over.
 *
 * Linear in the fleet, deliberately: 455 additions on a scroll frame is nothing, and the prefix-sum
 * array that would make it logarithmic is a second copy of the heights to invalidate — and a stale
 * one puts rows where the scrollbar does not say they are.
 */
export function virtualPlan(
  items: readonly VirtualItem[],
  scrollTop: number,
  viewportPx: number,
  overscanPx: number,
  kept: ReadonlySet<string>,
): VirtualEntry[] {
  if (viewportPx <= 0) return items.map((_, index) => ({ kind: 'item', index }));

  const windowTop = scrollTop - overscanPx;
  const windowBottom = scrollTop + viewportPx + overscanPx;
  const out: VirtualEntry[] = [];
  let offset = 0;
  let gapPx = 0;
  let gapItems = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const bottom = offset + item.height;
    if ((offset <= windowBottom && bottom >= windowTop) || kept.has(item.key)) {
      if (gapItems) {
        out.push({ kind: 'gap', px: gapPx });
        gapPx = 0;
        gapItems = 0;
      }
      out.push({ kind: 'item', index: i });
    } else {
      gapPx += item.height;
      gapItems++;
    }
    offset = bottom;
  }
  if (gapItems) out.push({ kind: 'gap', px: gapPx });
  return out;
}
