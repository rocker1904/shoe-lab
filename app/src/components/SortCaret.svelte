<script lang="ts">
  let { dir, placement = 'inline' }: {
    /** `null` when this column is not the sorted one — which is the state the hover reveal is for. */
    dir: 'asc' | 'desc' | null;
    /** Where the mark sits, not what it is: see the note on `.corner` below. */
    placement?: 'inline' | 'corner';
  } = $props();
</script>

<!-- Decoration only: `aria-sort` on the `th` is the accessible contract, so this carries no text and
     no accessible name of its own (docs/app.md §Table presentation). -->
<span class="caret" class:on={dir !== null} class:corner={placement === 'corner'}>
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
   * than as a margin here, because the desktop header has to RESERVE the same width to the right of
   * its text column and a number owned by two files drifts (docs/app.md §Table presentation).
   * `flex: none` so a tight header cell squashes the name rather than the mark.
   */
  .caret { display: inline-flex; justify-content: flex-end; flex: none; width: var(--caret-w);
           color: var(--text-dim); opacity: 0; }
  .caret.on { color: var(--accent); opacity: 1; }
  :global(th:hover) .caret { opacity: 0.55; }
  :global(th:hover) .caret.on { opacity: 1; }
  /**
   * The phone's placement, and the only thing that differs between the two renderings. A header cell
   * there is 53px wide with a 49px text budget that `lib/labels.ts` validates every short label
   * against, and this mark is rendered in EVERY column whether or not it is the sorted one — so
   * inline it spends `--caret-w` of that budget permanently, which is enough to put `Weight` on a second
   * line and grow a header that is pinned and therefore paid by every screen. Out of flow it costs
   * the NAME line nothing. The `th` is already `position: sticky`, so it is the containing block,
   * and `bottom` lands the mark on the unit line — on it, not beside it, so what it costs instead
   * is that line's clearance: its painted ink starts 8.33px inside the 49.33px text box's right
   * edge, which leaves a centred string five characters before a glyph sits under the stroke.
   * `MAX_UNITS_CLEAR_PX` in `lib/labels.ts` is that bound, owns the arithmetic, and is what every
   * unit string the catalogue emits is held to — asserted rather than believed.
   */
  .caret.corner { position: absolute; right: 2px; bottom: var(--s1); }
</style>
