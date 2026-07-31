<script lang="ts">
  import type { Theme } from '../lib/theme';

  let { total, builtAt, theme, onexport, ontheme }: {
    total: number; builtAt: string; theme: Theme;
    onexport: () => void; ontheme: () => void;
  } = $props();
  /**
   * `2026-07-27` reads like debug output. Locale AND zone are both pinned, so the string does not
   * vary by visitor: `builtAt` is a UTC instant, and formatting it in local time renders the
   * previous day for every reader west of Greenwich. The old `builtAt.slice(0, 10)` had no such
   * problem, so dropping the zone would be a regression rather than an omission.
   */
  const updated = $derived(new Intl.DateTimeFormat('en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(builtAt)));

  let copied = $state(false);
  /**
   * The URL *is* the view (docs/app.md §View and URL ownership), so copying the address bar is the
   * whole share feature — a stated project goal that had no affordance at all. The confirmation is
   * its own live region rather than a relabelled button: swapping the label would change the
   * control's accessible name to something you cannot then press.
   */
  async function copyLink() {
    // Absent outside a secure context, and it can reject on a denied permission. Neither is worth
    // an error state — but neither may claim success either, so both leave the region unsaid.
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(location.href);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

<header>
  <h1>Shoe Lab</h1>
  <span class="count">{total} shoes · updated {updated}</span>
  <span class="spacer"></span>
  <!-- Attribution is structural, not decorative: a permanent, visible, immediately-clickable link
       (docs/decisions.md §Be a good citizen toward RunRepeat). The micro-label does the explaining,
       so the name is set in plain text and no link colour competes with the wash. -->
  <a class="credit" href="https://runrepeat.com/catalog/running-shoes" rel="noopener" target="_blank">
    <span class="credit-label">Lab data by</span>
    <span class="credit-name">RunRepeat <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M3 7L7 3M7 3H3.8M7 3v3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
  </a>
  <!-- One box, so the three actions wrap as a group. Left loose they are three flex items competing
       for the end of a line: between 560px and 800px the bar broke mid-group, leaving Copy link
       alone at the end of the masthead and the other two starting the row below
       (docs/app.md §The header names the catalogue, the receipt owns the count). -->
  <div class="actions">
    <button type="button" onclick={copyLink}>Copy link</button>
    <!-- Rendered whether or not there is anything to say: a live region created together with its
         text is not reliably announced, so only the text may arrive late. -->
    <span class="copied" class:said={copied} role="status">{copied ? 'Copied' : ''}</span>
    <button type="button" onclick={onexport}>Export CSV</button>
    <!-- An icon per state, and the `aria-label` is what makes the three-way cycle usable without
         sight — the drawing is decoration and carries no accessible name of its own. -->
    <button type="button" class="icon" onclick={ontheme} aria-label="Toggle theme (currently {theme})"
            title="Theme: {theme}">
      {#if theme === 'auto'}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 010 12z" fill="currentColor"/></svg>
      {:else if theme === 'light'}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v1.8M8 13.2V15M1 8h1.8M13.2 8H15M3 3l1.3 1.3M11.7 11.7L13 13M13 3l-1.3 1.3M4.3 11.7L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.5 9.6A5.8 5.8 0 016.4 2.5a5.8 5.8 0 107.1 7.1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
      {/if}
    </button>
  </div>
</header>

<style>
  /* Not sticky itself: `Page.svelte` pins header and toolbar together as one chrome box, and the
     table's header row offsets against that box's measured height
     (docs/app.md §Columns and sorting). */
  header { --gap-x: var(--s4); display: flex; align-items: center; gap: var(--gap-x); padding: var(--s2) var(--s5); border-bottom: 1px solid var(--border); background: var(--chrome); }
  h1 { font-size: var(--t-xl); margin: 0; }
  .count { color: var(--text-dim); font-family: var(--font-mono); font-size: var(--t-sm); font-variant-numeric: tabular-nums; }
  .spacer { flex: 1; }
  /* The header's own gap inside it, so grouping the three changes no spacing at any width. It never
     wraps internally: at 360px it measures 232px against the 269px left beside the credit, and the
     e2e row count reads the header's direct children, so a group that broke its own line would be
     counted as one row (`smoke.spec.ts`). */
  .actions { display: flex; align-items: center; gap: var(--gap-x); }
  .credit { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; text-decoration: none; color: var(--text); }
  /* 9px as a literal, deliberately below the scale: `--t-xs` is 12px and the type scale bottoms out
     there, because 12px is the floor for anything a reader has to READ. This label is not read — it
     is a micro-label whose whole job is to let the name under it be set in plain text with no link
     colour competing with the wash, and at 12px it competes with the count beside it instead. */
  .credit-label { font-size: 9px; letter-spacing: 0.11em; text-transform: uppercase; color: var(--text-dim); }
  .credit-name { display: inline-flex; align-items: center; gap: 3px; font-size: var(--t-sm); font-weight: 500; }
  .credit:hover .credit-name { color: var(--accent); }
  .icon { display: inline-flex; align-items: center; justify-content: center; }
  .copied { font-size: var(--t-sm); color: var(--good); }
  /* A silent region is still a flex item, so it would carry a gap on each side and space the header
     differently depending on whether a link had ever been copied. */
  .copied:not(.said) { margin-inline-start: calc(-1 * var(--gap-x)); }
  button { padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: var(--r-sm); }
  button:hover { background: var(--accent-dim); }
  /* Below 800px every pixel of chrome is paid before the first shoe, on the screen with the least
     of it — so this tier buys height back three ways and none of them drops a control.
     `--s5` of side padding is a desktop gutter: at 390px it spent 48px of a 390px line and was what
     pushed the buttons onto a row of their own. */
  @media (max-width: 800px) {
    header { --gap-x: var(--s3); flex-wrap: wrap; gap: var(--s2) var(--gap-x);
             padding: var(--s2) var(--s3); }
    /* The credit stays STACKED here, and that is the measurement rather than the obvious answer: on
       one line it is 142px wide against the stacked 75px, and only 12px shorter — a 16px line box
       against 28px of stack. At 390px those 67px of extra line push the theme button onto a third
       row and the masthead goes from 77px to 106px, so the 12px saving costs 29. The 9px micro-label
       above the name is what keeps the stacked form that cheap.
       Stacked and LEFTMOST: once the bar wraps this block starts its row, so its two lines share a
       left edge with each other and with the title above them. Aligning them right — which is what
       the desktop wants, where it is the last item on a single line — set `LAB DATA BY` 12px in
       from `RunRepeat` and made the masthead three different left edges. */
    .credit { align-items: flex-start; }
    /* The spacer exists to push the credit to the far right of a bar that is ONE line, so once the
       bar wraps it has nothing left to push and is DELETED rather than neutralised. A zero-width
       flex item is still a flex item: it takes a gap and it wraps, and at 360px it did not fit
       after the count, landed at the head of row two, and indented the credit 8px past the title's
       left edge — the one width at which the masthead's left column was ragged. */
    .spacer { display: none; }
  }
  /* 360px is the binding width, not 375 — it is the usual Android one. At `--s3` of side padding the
     title line alone measures 341px against the 336px available, so the catalogue count wrapped and
     carried the credit and all three buttons to a third row: 26px of chrome bought by 8px of
     gutter. */
  @media (max-width: 560px) {
    header { --gap-x: var(--s2); padding-inline: var(--s2); }
    /* Down one step, to the scale's 12px floor, and it is the month that decides it. `en-GB` sets
       September as `Sept`, so the widest string the formatter can emit is 8px wider than the July
       one this tier was measured against: 256px against the 255px left beside the title at 360px.
       It wrapped, took the credit and all three buttons with it, and cost 26px of chrome — one
       month in twelve, on the narrowest phone only. At `--t-xs` the widest month measures 231px, so
       the line has 24px in hand rather than -1. */
    .count { font-size: var(--t-xs); }
  }
</style>
