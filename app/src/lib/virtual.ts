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

/**
 * One shoe: what it is keyed by, and what the table will render it at.
 *
 * **`height` must be non-negative.** Nothing here enforces it — a negative one would make a spacer's
 * px negative, which is a `<tr>` nobody can express — and no height source in the tree can produce
 * one. It is stated because the next one to join, task 8's phone measurement, inherits the contract.
 */
export interface VirtualItem { readonly key: string; readonly height: number }

/**
 * How far past the viewport the window reaches, at **each** end.
 *
 * **It is a scroll distance, not a row count**, and it is measured against the one thing that can
 * make the body go blank: how far the page can travel between the frame a plan was computed for and
 * the frame it is painted in. A plan is computed from a `scroll` event, so the answer is bounded by
 * what one frame of scrolling moves — measured on the real fleet at 1440px with a wheel fling, a
 * `Page Down`, an `End` and a scrollbar drag, in Chromium, Firefox and WebKit
 * (`.hunt/task6/overscan.ts`, logged in `.hunt/task6/overscan-3engine.log`). Worst travel per frame,
 * by gesture: a scrollbar drag **0px**; a wheel notch **120px** in Chromium and Firefox and **535px**
 * in WebKit; a wheel fling **600–649px** in all three; a held `Page Down` **2,436–3,945px**; `End`
 * **3,010–8,440px**, crossing a document about 16,800px tall at the default column set.
 *
 * **1280, because ordinary reading is what an overscan can cover and a jump is not.** It clears
 * every wheel and scrollbar reading above in every engine with room to spare — two frames of the
 * hardest fling — so what the number buys is that everything a runner *reads* through is already
 * mounted. It does NOT cover a held `Page Down`, and it does not cover `End`: both move further in
 * one frame than any affordable overscan, and both are repaired by the next frame's plan rather than
 * prevented.
 *
 * **What the uncovered half costs was measured against a control**, because a windowed body is not
 * the only thing that paints a blank frame. Painted compositor frames, `2ca7ac6` — every row
 * rendered — against this build, Chromium, three repeats each (`.hunt/review12/probe-k.ts`,
 * `probe-m.ts`): a wheel fling paints the same 1–2 blank frames of ~41 on both, `End` is inside the
 * run-to-run spread, and a held `Page Down` is the one that moves — 1 blank frame of a ~12-frame
 * burst becomes 2–4. Raising the number to cover that would pay DOM on every frame of every gesture
 * to repair a burst, which is the trade this design makes the other way.
 *
 * 1280 is ~35 rows at the fleet's 36px modal height against a viewport that holds ~24: the DOM it
 * costs is under three screenfuls where the alternative is 455 rows.
 *
 * Symmetric, because scrolling up has to be as cheap as scrolling down.
 */
export const OVERSCAN_PX = 1280;

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
 * **An item renders when its box TOUCHES the window**, not when it strictly overlaps. What that buys
 * is totality over every non-negative height: a degenerate box passes through a strict overlap test
 * at every position there is, so a zero-height item would be in no part of the plan rather than at
 * the position it occupies. No height source in this tree produces one today — `row-height.ts`
 * declines rather than answering zero — so this is defence, and it costs at most one row per edge
 * against an overscan that already pays for many. The window itself is the viewport grown by
 * `overscanPx` at BOTH ends, because scrolling up has to be as cheap as scrolling down.
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
 *
 * ---
 *
 * Three things a caller owes this plan, none of which it can check for itself.
 *
 * **A gap's `px` is the WHOLE of what its row may occupy.** The desktop table gives every `td` a
 * `--s2` padding and a 1px bottom border (`ShoeTable.svelte`), so a spacer that inherits them stands
 * 17px taller than the run it replaces — on every spacer, not only a 0px one, which puts every
 * scroll position below it wrong and drifts the scrollbar the design exists to keep honest. The
 * expanded row already takes that reset for its own reasons; a spacer needs it and the border too.
 *
 * **A plan can contain no items at all.** Scroll past either end of the fleet and it is one spacer
 * the height of everything. That is the empty-window state the spec's registry sweep warns about:
 * with no `tr.shoe` in the body there is no prototype to clone, so `measureDesktopRowHeights`
 * declines, so the caller renders everything, which puts a row back and re-measures. The loop is
 * self-healing by design but it is a loop, and the caller is what has to be shown to settle.
 *
 * **A gap needs a key, and its position in the plan is the wrong one.** The plan gains and loses
 * spacers as kept shoes split them, so an array index is a gap in one frame and an item in the next.
 * The run a spacer stands for is the stable identity, and it is already derivable: the index of the
 * next item entry, or `items.length` for a trailing gap. Whatever is chosen has to be namespaced
 * away from slugs, or a shoe slugged `3` collides with a spacer.
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
