<script lang="ts">
  let { dir, placement = 'inline' }: {
    /** `null` when this column is not the sorted one — which is the state the hover reveal is for. */
    dir: 'asc' | 'desc' | null;
    /** Where the mark sits, not what it is: see the note on the corner placements below. Both take
     *  it out of flow; they differ only in which corner is the one the header's text is NOT aligned
     *  to — `end` for the phone's centred names, `start` for a right-aligned figure column. */
    placement?: 'inline' | 'corner-end' | 'corner-start';
  } = $props();
</script>

<!-- Decoration only: `aria-sort` on the `th` is the accessible contract, so this carries no text and
     no accessible name of its own (docs/app.md §Table presentation). -->
<span class="caret" class:on={dir !== null} class:corner={placement !== 'inline'}
      class:start={placement === 'corner-start'}>
  {#if dir === 'asc'}
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 6l3-3 3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
  {:else}
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
  {/if}
</span>

<style>
  /**
   * One component for both table renderings, and the reason it is one rather than two copies of four
   * lines: the phone drew a plain `▲`/`▼` joined to the header text with a space, which at the 53px
   * column bound wrapped to a line of its own and grew the sticky header — permanently, since that
   * header is pinned. An SVG in an inline-flex box cannot wrap away from the name beside it, and
   * sharing the mark is what stops the two headers meaning the same thing two ways.
   *
   * The reveal is written against `th:hover` from in here because the state belongs to the header
   * cell and this is the element that changes: a sortable column shows a dim caret under the
   * pointer, the sorted one is accent and always on. `@media (hover: none)` never fires either rule,
   * so a phone shows the sorted column's caret and nothing else — which is what it showed before.
   *
   * Its footprint is `--caret-w` — the glyph plus the air before it — declared as a token rather
   * than as a margin here, because a header that takes the mark out of flow has to RESERVE the same
   * width beside its unit line, and a number owned by two files drifts
   * (docs/app.md §Table presentation). `flex: none` so a tight header cell squashes the name rather
   * than the mark.
   */
  .caret { display: inline-flex; justify-content: flex-end; flex: none; width: var(--caret-w);
           color: var(--text-dim); opacity: 0; }
  .caret.on { color: var(--accent); opacity: 1; }
  :global(th:hover) .caret { opacity: 0.55; }
  :global(th:hover) .caret.on { opacity: 1; }
  /**
   * Out of flow, which both renderings now want and for the same reason: a mark that sits in the
   * name line spends `--caret-w` of it permanently, and neither header can afford that.
   *
   * The phone cannot afford the WIDTH. A header cell there is 53px wide with a 49px text budget that
   * `lib/labels.ts` validates every short label against, and this mark is rendered in EVERY column
   * whether or not it is the sorted one — inline, it is enough to put `Weight` on a second line and
   * grow a header that is pinned and therefore paid by every screen.
   *
   * A desktop figure column cannot afford the EDGE. Its name and unit lines are right-aligned to the
   * column the figures keep, so a mark inline after the name ends the text 12px short of the numbers
   * under it and the header no longer lines up with its own column
   * (docs/app.md §Table presentation).
   *
   * The `th` is already `position: sticky`, so it is the containing block, and `bottom` lands the
   * mark on the unit line — on it, not beside it, so what it costs instead is that line's clearance.
   * Which side that clearance is owed on is the only difference between the two:
   *
   * - `corner-end` — the phone. Its ink starts 8.33px inside the 49.33px text box's right edge,
   *   which leaves a centred string five characters before a glyph sits under the stroke.
   *   `MAX_UNITS_CLEAR_PX` in `lib/labels.ts` is that bound and owns the arithmetic.
   * - `corner-start` — a desktop figure column, where the unit line is right-aligned and grows
   *   LEFTWARD into this corner. The clearance is reserved in flow instead of bounded, by the
   *   `margin-left` on `.h-units` in `ShoeTable.svelte`, so the browser sizes the column to keep it
   *   and `fit.ts` can state the same reserve as a number.
   *
   * `justify-content` flips with the side so the glyph is against the corner it is placed in rather
   * than `--caret-w` adrift of it, which on `corner-start` is the difference between clearing the
   * unit line and standing in it.
   */
  .caret.corner { position: absolute; bottom: var(--s1); }
  .caret.corner:not(.start) { right: 2px; }
  .caret.corner.start { left: 2px; justify-content: flex-start; }
</style>
