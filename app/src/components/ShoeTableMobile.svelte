<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { displayNumber, indexTests, numericValue } from '../lib/dataset';
  import { washOf } from '../lib/direction';
  import { columnLabel, shortLabel } from '../lib/labels';
  import { percentileMap } from '../lib/stats';
  import { headerUnits, isFigure } from '../lib/units';
  import type { ViewState } from '../lib/urlstate';
  import DetailPanel from './DetailPanel.svelte';

  let { shoes, data, view, onchange }: {
    shoes: Shoe[]; data: ShoesFile; view: ViewState; onchange: (v: ViewState) => void;
  } = $props();

  const idx = $derived(indexTests(data.tests));
  const expanded = new SvelteSet<string>();

  /** The value row is only ever numeric: it is what keeps every chip the same box under a header
   *  that labels it (docs/app.md §Columns and sorting). */
  const cols = $derived(view.columns.filter(isFigure));
  // A card whose value row holds nothing still needs a cell to span, so the colspan never hits 0.
  const span = $derived(Math.max(cols.length, 1));
  const percentiles = $derived(new Map(cols.map((c) => [c, percentileMap(shoes, c, idx)])));

  function setSort(key: string) {
    const next = structuredClone($state.snapshot(view)) as ViewState;
    next.sort = view.sort.key === key && view.sort.dir === 'desc' ? { key, dir: 'asc' } : { key, dir: 'desc' };
    onchange(next);
  }
  function cellText(s: Shoe, col: string): string {
    const v = col === 'score' ? s.score : numericValue(s, col, idx);
    return v === null || v === undefined ? '—' : displayNumber(v);
  }
  /** The columns that hold words, rendered after the name and wrapping rather than truncating.
   *  A shoe with no plate and no date contributes nothing, rather than a row of em dashes. */
  function metaOf(s: Shoe): string[] {
    const out: string[] = [];
    if (view.columns.includes('releasedAt') && s.releasedAt) {
      // A false `preciseReleaseDate` means only the year is real (docs/scraping.md §Release-year supplement).
      out.push(s.preciseReleaseDate ? s.releasedAt : s.releasedAt.slice(0, 4));
    }
    if (view.columns.includes('plate') && s.plate !== 'none') {
      out.push(s.plate === 'carbon' ? 'Carbon' : 'Non-carbon plate');
    }
    return out;
  }
  async function toggle(slug: string, row: HTMLElement | null) {
    if (expanded.delete(slug)) return;
    expanded.add(slug);
    // The panel opens below the card, so a card near the fold opens off screen. Awaited so the
    // panel exists to be scrolled to. jsdom implements no layout and defines neither
    // `scrollIntoView` nor `matchMedia`, hence the optional calls.
    await tick();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    row?.nextElementSibling?.nextElementSibling?.scrollIntoView?.(
      { behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }
  function onRowKey(e: KeyboardEvent, slug: string) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    void toggle(slug, e.currentTarget as HTMLElement);
  }
</script>

<!-- Bled out of `.content`'s inline padding rather than given less of it: six 57px columns need
     358px, which is more than a 360px phone has left once the page is padded, and the receipt
     above still wants its margin (docs/app.md §Columns and sorting). -->
<div class="bleed">
  <table data-testid="shoe-table-mobile" style:--cols={span}>
    <thead>
      <tr>
        {#each cols as col (col)}
          <th aria-sort={view.sort.key === col ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
            <button type="button" onclick={() => setSort(col)}>
              <span class="h-name">{shortLabel(col, columnLabel(col, idx.bySlug.get(col)))}{#if view.sort.key === col}{view.sort.dir === 'asc' ? ' ▲' : ' ▼'}{/if}</span>
              <span class="h-units">{headerUnits(col, idx.bySlug.get(col))}</span>
            </button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each shoes as s (s.slug)}
        <!-- `aria-expanded` says the card controls something; `aria-controls` is the only thing
             that says what, and the panel is a sibling row rather than a child of the control.
             Emitted only while it is open: the panel exists only then, and an IDREF naming a node
             that is not in the document is an unresolvable reference rather than a promise of one. -->
        <tr class="shoe" tabindex="0" aria-expanded={expanded.has(s.slug)}
            aria-controls={expanded.has(s.slug) ? `detail-${s.slug}` : undefined}
            onclick={(e) => void toggle(s.slug, e.currentTarget)} onkeydown={(e) => onRowKey(e, s.slug)}>
          <td class="ident" colspan={span}>
            <span class="chev" class:open={expanded.has(s.slug)} aria-hidden="true">›</span>
            <strong>{s.name}</strong>
            {#each metaOf(s) as m (m)}<span class="meta">{m}</span>{/each}
            {#if s.discontinued}<span class="disc-tag">discontinued</span>{/if}
          </td>
        </tr>
        <tr class="values">
          {#each cols as col (col)}
            {@const p = percentiles.get(col)?.get(s.slug)}
            <td>
              <span class="chip" class:tinted={p !== undefined} style:--p={p ?? 0}
                    class:blue={washOf(col) === 'blue'} class:grey={washOf(col) === 'grey'}>{cellText(s, col)}</span>
            </td>
          {/each}
        </tr>
        {#if expanded.has(s.slug)}
          <tr class="expand" id="detail-{s.slug}"><td colspan={span}><DetailPanel shoe={s} /></td></tr>
        {/if}
        <tr class="gap" aria-hidden="true"><td colspan={span}></td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .bleed { margin-inline: calc(-1 * var(--s4)); }
  /* Fixed layout with spacing-derived gaps: content-sized columns made every chip a different
     width and detached each header from the values it labels. The min-width is the six-column
     bound — 57px a column plus the spacing either side of each — so past six columns the geometry
     the labels were validated against holds and the page scrolls instead
     (docs/app.md §Columns and sorting). */
  table {
    table-layout: fixed; border-collapse: separate; border-spacing: 2px 0; width: 100%;
    min-width: calc(var(--cols) * 57px + (var(--cols) + 1) * 2px);
    font-size: var(--t-md);
  }
  /* 2px, deliberately not `--s1`: the token is 4px and would take 4px off a 57px column, which is
     the difference between "softness" fitting the header and clipping (docs/app.md §Columns and sorting). */
  /* The two side shadows paint the `border-spacing` gaps: a cell background stops at the cell, so a
     sticky header made of them is see-through in 2px slits and scrolled rows show through the band. */
  th { padding: var(--s1) 2px; background: var(--bg); vertical-align: bottom;
       position: sticky; top: var(--thead-top); z-index: 2;
       box-shadow: var(--shadow-sticky), 2px 0 0 var(--bg), -2px 0 0 var(--bg); }
  th button { display: flex; flex-direction: column; align-items: center; gap: 1px; width: 100%;
              background: none; border: none; color: var(--text); font: inherit; font-size: var(--t-xs);
              font-weight: 600; letter-spacing: -0.02em; cursor: pointer; padding: 0; text-align: center; }
  .h-units { font-weight: 400; color: var(--text-dim); min-height: 1em; }
  /* The identity strip and the value row are one card: the strip rounds its top, the values row
     its bottom, and the spacer row below is what separates one card from the next. */
  tr.shoe { cursor: pointer; }
  td.ident { background: var(--chrome); border-radius: var(--r-md) var(--r-md) 0 0;
             padding: var(--s2) var(--s3); font-size: var(--t-sm); }
  td.ident strong { font-weight: 600; }
  .meta::before, .disc-tag::before { content: '·'; margin: 0 var(--s1); color: var(--text-dim); }
  .meta { color: var(--text-dim); font-size: var(--t-xs); }
  .disc-tag { color: var(--bad); font-size: var(--t-xs); }
  /* In the separate borders model the row's background paints through the border-spacing, so one
     declaration here gives the whole value row a continuous card surface behind the chips. */
  tr.values { background: var(--surface); }
  /* Symmetric, so a chip sits centred in its band rather than riding high. */
  tr.values td { padding: var(--s2) 0; }
  tr.values td:first-child { border-bottom-left-radius: var(--r-md); }
  tr.values td:last-child { border-bottom-right-radius: var(--r-md); }
  tr.gap td { height: var(--s2); }
  tr.expand td { background: var(--surface); }
  tr.shoe:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  /* Inset rather than full-bleed: at this density edge-to-edge cells read as a solid band of
     colour, far louder than the desktop table (docs/app.md §Theming). */
  .chip { display: block; margin: 0 var(--s1); padding: var(--s1) 0; border-radius: var(--r-sm);
          text-align: center; font-variant-numeric: tabular-nums; }
  /* Squared so only leaders read as tinted; linear where the metric has no better end
     (docs/app.md §Theming). */
  .chip.tinted.blue { background-color: color-mix(in oklab, var(--wash-blue) calc(var(--p) * var(--p) * 100%), transparent); }
  .chip.tinted.grey { background-color: color-mix(in oklab, var(--wash-grey) calc(var(--p) * 100%), transparent); }
  /* The name's size, not the metadata's: it is the affordance for the whole card. */
  .chev { display: inline-block; color: var(--text-dim); }
  @media (prefers-reduced-motion: no-preference) {
    .chev { transition: transform 120ms ease-out; }
    tr.expand td { animation: reveal 140ms ease-out; }
  }
  .chev.open { transform: rotate(90deg); }
  @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
</style>
