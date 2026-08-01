<script lang="ts">
  import type { Snippet } from 'svelte';

  let { total, builtAt, utilities }: {
    total: number; builtAt: string;
    /** Written once in `Page.svelte` and handed to exactly one host: this one above 800px, the
     *  toolbar below it (docs/app.md §Where the utilities live). */
    utilities?: Snippet;
  } = $props();
  /**
   * `2026-07-27` reads like debug output. Locale AND zone are both pinned, so the string does not
   * vary by visitor: `builtAt` is a UTC instant, and formatting it in local time renders the
   * previous day for every reader west of Greenwich. The old `builtAt.slice(0, 10)` had no such
   * problem, so dropping the zone would be a regression rather than an omission.
   */
  const updated = $derived(new Intl.DateTimeFormat('en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(builtAt)));

</script>

<header>
  <h1>Shoe Lab</h1>
  <span class="spacer"></span>
  <!-- Attribution is structural, not decorative: a permanent, visible, immediately-clickable link
       (docs/decisions.md §Be a good citizen toward RunRepeat). It stacks under the catalogue fact
       because both say where the data came from — beside a button it read as that button's caption.
       The micro-label does the explaining, so the name is set in plain text and no link colour
       competes with the wash. -->
  <span class="prov">
    <span class="count">{total} shoes · updated {updated}</span>
    <a class="credit" href="https://runrepeat.com/catalog/running-shoes" rel="noopener" target="_blank">
      <span class="credit-label">Lab data by</span>
      <span class="credit-name">RunRepeat <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M3 7L7 3M7 3H3.8M7 3v3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </a>
  </span>
  <!-- `{#if}`, not `{@render utilities?.()}` on its own: an empty span is still a flex item and
       still takes the header's gap, which is exactly what would stop the banner being flush. -->
  {#if utilities}<span class="utils-host">{@render utilities()}</span>{/if}
</header>

<style>
  /* Not sticky itself: `Page.svelte` pins header and toolbar together as one chrome box, and the
     table's header row offsets against that box's measured height
     (docs/app.md §Columns and sorting). */
  header { --gap-x: var(--s4); display: flex; align-items: center; gap: var(--gap-x); padding: var(--s2) var(--s5); border-bottom: 1px solid var(--border); background: var(--chrome); }
  h1 { font-size: var(--t-xl); margin: 0; }
  .count { color: var(--text-dim); font-family: var(--font-mono); font-size: var(--t-sm); font-variant-numeric: tabular-nums; }
  .spacer { flex: 1; }
  /* Above 800px the two facts are header items in their own right, in the order the visual-polish
     pass settled — the wrapper exists for the banner, and grouping them here would move the
     catalogue count from beside the wordmark to the far right. `display: contents` is what lets one
     wrapper serve both bands without a second copy of the count in the markup. */
  .prov { display: contents; }
  h1 { order: -2; }
  .count { order: -1; }
  .credit { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; text-decoration: none; color: var(--text); }
  /* 9px as a literal, deliberately below the scale: `--t-xs` is 12px and the type scale bottoms out
     there, because 12px is the floor for anything a reader has to READ. This label is not read — it
     is a micro-label whose whole job is to let the name under it be set in plain text with no link
     colour competing with the wash, and at 12px it competes with the count beside it instead. */
  .credit-label { font-size: 9px; letter-spacing: 0.11em; text-transform: uppercase; color: var(--text-dim); }
  .credit-name { display: inline-flex; align-items: center; gap: 3px; font-size: var(--t-sm); font-weight: 500; }
  .credit:hover .credit-name { color: var(--accent); }
  /* Below 800px the masthead becomes a BANNER: the wordmark at the left margin, and opposite it one
     right-aligned block saying where the data came from. Desktop is the default and this is the
     override, never the other way round — writing it banner-first would need a `min-width` twin of
     the sidebar's `max-width: 800px`, and every fractional width between the two would match
     neither (docs/app.md §Where the utilities live). One query, and its complement is whatever the
     query does not match.
     `--s5` of side padding is a desktop gutter: at 390px it spent 48px of a 390px line. */
  @media (max-width: 800px) {
    /* The spacer STAYS — it is what makes the banner flush right, and deleting it here is exactly
       what left 59px of air at 390px and 248px at 700px on the old header. `nowrap` because there
       are only two items to place and the block beside the wordmark is meant to hold the trailing
       edge rather than fall under it. */
    header { --gap-x: var(--s3); flex-wrap: nowrap; padding: var(--s1) var(--s2); }
    /* One block, right-aligned, opposite the wordmark. One line for the credit, not the desktop's
       stack: the count sitting directly above it already carries the small print. */
    .prov { display: flex; flex-direction: column; align-items: flex-end; gap: 0; }
    .credit { flex-direction: row; align-items: baseline; gap: 5px; }
  }
  /* 360px is the binding width, not 375 — it is the usual Android one. The tier's `--gap-x` step
     went with the masthead: the banner's spacer is `flex: 1` and absorbs the difference, so forcing
     `--s3` here changes the height, the trailing air and the overflow by nothing in either engine.
     The count step is the whole of what is left, and it is re-measured on the banner rather than
     carried over: `en-GB` sets September as `Sept`, the widest string the formatter can emit, and
     at 360px that line takes THREE lines at `--t-sm` in Chromium — 54px, and 7px of overflow with
     it — and two in Firefox, against one 16px line at `--t-xs` in both. The banner is 41px tall
     with the step and 100px without it. */
  @media (max-width: 560px) {
    .count { font-size: var(--t-xs); }
  }
</style>
