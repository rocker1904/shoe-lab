<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { displayNumber, indexTests, numericValue } from '../lib/dataset';
  import { washOf } from '../lib/direction';
  import { columnLabel } from '../lib/labels';
  import { EASY_SCORE_KEY } from '../lib/score';
  import { percentileMap, rankMap } from '../lib/stats';
  import { headerUnits, isFigure } from '../lib/units';
  import type { ViewState } from '../lib/urlstate';
  import DetailPanel from './DetailPanel.svelte';

  let { shoes, data, view, scores, onchange }: {
    shoes: Shoe[]; data: ShoesFile; view: ViewState;
    /** Resolved in `Page.svelte`: the Easy score is the one column whose value depends on the view
     *  rather than on the shoe alone, so it arrives ready rather than through `numericValue`. */
    scores: Map<string, number>;
    onchange: (v: ViewState) => void;
  } = $props();

  const idx = $derived(indexTests(data.tests));
  // A set, not a single slug: comparing two shoes means having both panels open at once.
  const expanded = new SvelteSet<string>();

  // The score's wash ranks over the **rendered rows**, like every other column's, or its tint would
  // mean something different from its neighbours' in the same row.
  const percentiles = $derived(new Map(view.columns.map((c) => [c,
    c === EASY_SCORE_KEY
      ? rankMap(new Map(shoes.flatMap((s) => (scores.has(s.slug) ? [[s.slug, scores.get(s.slug)!] as const] : []))))
      : percentileMap(shoes, c, idx)])));

  function setSort(key: string) {
    const next = structuredClone($state.snapshot(view)) as ViewState;
    next.sort = view.sort.key === key && view.sort.dir === 'desc' ? { key, dir: 'asc' } : { key, dir: 'desc' };
    onchange(next);
  }
  function cellText(s: Shoe, col: string): string {
    // A false `preciseReleaseDate` means only the year is real (docs/scraping.md §Release-year supplement).
    if (col === 'releasedAt') return s.releasedAt ? (s.preciseReleaseDate ? s.releasedAt : s.releasedAt.slice(0, 4)) : '—';
    if (col === 'plate') return s.plate === 'none' ? '—' : s.plate === 'carbon' ? 'Carbon' : 'Non-carbon plate';
    if (col === EASY_SCORE_KEY) {
      const sc = scores.get(s.slug);
      return sc === undefined ? '—' : displayNumber(sc);
    }
    // msrpGbp goes through numericValue so the cell shows the same resolved price the
    // filter and the sort use (docs/app.md §Resolved price).
    const v = col === 'score' ? s.score : numericValue(s, col, idx);
    return v === null || v === undefined ? '—' : displayNumber(v);
  }
  async function toggle(slug: string, row: HTMLElement | null) {
    if (expanded.delete(slug)) return;
    expanded.add(slug);
    // The panel opens *below* the row, so a row near the fold opens off screen. Awaited so the
    // panel exists to be scrolled to. jsdom implements no layout and defines neither
    // `scrollIntoView` nor `matchMedia`, hence the optional calls.
    await tick();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    row?.nextElementSibling?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }
  function onRowKey(e: KeyboardEvent, slug: string) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    void toggle(slug, e.currentTarget as HTMLElement);
  }
</script>

<table>
  <thead>
    <tr>
      <th class="name">Shoe</th>
      {#each view.columns as col (col)}
        <th class:fig={isFigure(col)}
            aria-sort={view.sort.key === col ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
          <button type="button" onclick={() => setSort(col)}>
            <!-- A non-breaking space before the arrow: the name may now wrap, and an arrow alone
                 on the second line reads as a bullet rather than as a sort direction. -->
            <span class="h-name">{columnLabel(col, idx.bySlug.get(col))}{#if view.sort.key === col}{view.sort.dir === 'asc' ? ' ▲' : ' ▼'}{/if}</span>
            <!-- Always rendered, empty or not: vertical is the axis we have spare, and a missing
                 second line would make the header rows different heights. -->
            <span class="h-units">{headerUnits(col, idx.bySlug.get(col))}</span>
          </button>
        </th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each shoes as s (s.slug)}
      <!-- `aria-expanded` says the row controls something; `aria-controls` is the only thing that
           says what, and the panel is a sibling row rather than a child of the control. Emitted only
           while it is open: the panel exists only then, and an IDREF naming a node that is not in
           the document is an unresolvable reference rather than a promise of one. -->
      <tr class="shoe" tabindex="0" aria-expanded={expanded.has(s.slug)}
          aria-controls={expanded.has(s.slug) ? `detail-${s.slug}` : undefined}
          onclick={(e) => void toggle(s.slug, e.currentTarget)} onkeydown={(e) => onRowKey(e, s.slug)}>
        <!-- The flex lives on a wrapper, not on the cell: `display: flex` on a `td` takes it out of
             the table-cell box, so it stops stretching to the row and leaves a half-height block the
             numeric cells scroll through under the sticky column. -->
        <td class="name">
          <div class="name-row">
            <span class="chev" class:open={expanded.has(s.slug)} aria-hidden="true">›</span>
            {#if s.imageUrl}<img src={s.imageUrl} alt="" loading="lazy" />{/if}
            <!-- No brand line: 442 of 450 names already begin with their brand, and the other 8
                 shorten it rather than drop it (docs/app.md §Columns and sorting). -->
            <div><strong>{s.name}</strong>{#if s.discontinued}<span class="disc-tag">discontinued</span>{/if}</div>
          </div>
        </td>
        {#each view.columns as col (col)}
          {@const p = percentiles.get(col)?.get(s.slug)}
          <td class="num" class:fig={isFigure(col)} style:--p={p ?? 0} class:tinted={p !== undefined}
              class:blue={washOf(col) === 'blue'} class:grey={washOf(col) === 'grey'}>{cellText(s, col)}</td>
        {/each}
      </tr>
      {#if expanded.has(s.slug)}
        <tr class="expand" id="detail-{s.slug}"><td colspan={1 + view.columns.length}><DetailPanel shoe={s} /></td></tr>
      {/if}
    {/each}
  </tbody>
</table>

<style>
  /* Separate rather than collapsed: a collapsed border belongs to the table, not the cell, so it
     does not travel with a sticky header and vanishes the moment the head detaches. */
  table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: var(--t-md); }
  /* Header names wrap rather than holding their line: `nowrap` made every column's minimum its
     longest header, which summed to 950px and pushed the whole document 26px sideways at 1200px.
     Wrapping only bites once the width is genuinely short, so a wide viewport looks unchanged
     (docs/app.md §Columns and sorting). */
  th { text-align: left; border-bottom: 2px solid var(--border); padding: var(--s2);
       background: var(--surface); }
  /* The offset is the height `Page.svelte` measured off the pinned chrome, with no fallback: the
     chrome is 44px at desktop widths and 103px on a phone, so any constant here hides this row
     behind it at every width but one (docs/app.md §Columns and sorting). */
  thead th { position: sticky; top: var(--thead-top); z-index: 2; box-shadow: var(--shadow-sticky); }
  th button { display: flex; flex-direction: column; gap: 1px; background: none; border: none; color: var(--text);
              font: inherit; font-weight: 600; cursor: pointer; padding: 0; text-align: inherit; }
  .h-units { font-size: var(--t-xs); font-weight: 400; color: var(--text-dim); min-height: 1em; }
  th.fig, td.fig { text-align: right; }
  th.fig button { align-items: flex-end; }
  td.fig { font-variant-numeric: tabular-nums; }
  td { border-bottom: 1px solid var(--border); padding: var(--s2); }
  /* The surface belongs to the ROW, and the wash travels inward from it (docs/app.md §Theming).
     On the cell it would be replaced by the translucent wash, which `td.num.tinted` sets at higher
     specificity — and the cell would then composite over the page instead of over the surface. */
  tr.shoe { cursor: pointer; background: var(--surface); }
  /* A background *image* layers over the cell's background colour, so hovering a tinted cell
     dims it rather than replacing the percentile wash with a flat one. */
  tr.shoe:hover td { background-image: linear-gradient(var(--hover-wash), var(--hover-wash)); }
  tr.shoe:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  /* The cell keeps its own opaque background as well as the row's: it is sticky, and the numeric
     cells scroll underneath it rather than behind the row. */
  td.name { min-width: 14rem; background: var(--surface); }
  .name-row { display: flex; gap: var(--s2); align-items: center; }
  td.name img { width: 40px; height: 27px; object-fit: cover; border-radius: var(--r-sm); }
  /* The plate reads "Non-carbon plate", which wrapped to three lines in an auto-sized column and
     made the row heights ragged. On the cell rather than the header, deliberately: `nowrap` on a
     `th` makes every column's minimum its longest header, which summed past the viewport
     (docs/app.md §Columns and sorting). */
  td.num:not(.fig) { white-space: nowrap; }
  /* Expandability was signalled by `cursor: pointer` alone, which a touch reader never sees. */
  .chev { display: inline-block; color: var(--text-dim); }
  /* Unconditional, because this component is the desktop rendering: below 700px `Page.svelte`
     mounts `ShoeTableMobile` instead, which has no horizontal scroll to pin against
     (docs/app.md §Columns and sorting). */
  th.name, td.name { position: sticky; left: 0; z-index: 1; }
  thead th.name { z-index: 3; }
  /* Squared so only leaders read as tinted, which is what a ranking wants; the endpoint is the
     cap (docs/app.md §Theming). */
  td.num.tinted.blue { background-color: color-mix(in oklab, var(--wash-blue) calc(var(--p) * var(--p) * 100%), transparent); }
  /* Linear, because a metric with no better end is a scale and must read as a gradient rather
     than a podium (docs/app.md §Theming). */
  td.num.tinted.grey { background-color: color-mix(in oklab, var(--wash-grey) calc(var(--p) * 100%), transparent); }
  .disc-tag { margin-left: var(--s1); font-size: var(--t-xs); color: var(--bad); border: 1px solid var(--bad); border-radius: var(--r-full); padding: 0 var(--s1); }
  @media (prefers-reduced-motion: no-preference) {
    .chev { transition: transform 120ms ease-out; }
    .chev.open { transform: rotate(90deg); }
    tr.expand td { animation: reveal 140ms ease-out; }
  }
  @media (prefers-reduced-motion: reduce) {
    .chev.open { transform: rotate(90deg); }
  }
  @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
</style>
