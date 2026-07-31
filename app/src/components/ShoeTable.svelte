<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { displayNumber, indexTests, numericValue } from '../lib/dataset';
  import { washOf } from '../lib/direction';
  import { greyAlpha, washAlpha } from '../lib/wash';
  import { categoricalValue } from '../lib/categorical';
  import { displayReleaseDate } from '../lib/release-date';
  import { columnLabel } from '../lib/labels';
  import type { ScoreColumns } from '../lib/score';
  import { percentileMap, rankMap } from '../lib/stats';
  import { headerUnits, isFigure } from '../lib/units';
  import type { ViewState } from '../lib/urlstate';
  import DetailPanel from './DetailPanel.svelte';

  let { shoes, data, view, scores, stability, onchange }: {
    shoes: Shoe[]; data: ShoesFile; view: ViewState;
    /** Resolved in `Page.svelte` and keyed by column: a score is the one kind of column whose value
     *  depends on the view rather than on the shoe alone, so it arrives ready rather than through
     *  `numericValue` (docs/app.md §The story scores). */
    scores: ScoreColumns;
    /** The preference `scores` were computed with, passed through to the panel so its breakdown
     *  cannot disagree with the value rendered beside it. */
    stability: boolean;
    onchange: (v: ViewState) => void;
  } = $props();

  const idx = $derived(indexTests(data.tests));
  // A set, not a single slug: comparing two shoes means having both panels open at once.
  const expanded = new SvelteSet<string>();

  // The score's wash ranks over the **rendered rows**, like every other column's, or its tint would
  // mean something different from its neighbours' in the same row.
  const percentiles = $derived(new Map(view.columns.map((c) => [c,
    scores.has(c)
      ? rankMap(new Map(shoes.flatMap((s) => {
        const v = scores.get(c)!.get(s.slug);
        return v === undefined ? [] : [[s.slug, v] as const];
      })))
      : percentileMap(shoes, c, idx)])));

  function setSort(key: string) {
    const next = structuredClone($state.snapshot(view)) as ViewState;
    next.sort = view.sort.key === key && view.sort.dir === 'desc' ? { key, dir: 'asc' } : { key, dir: 'desc' };
    onchange(next);
  }
  function cellText(s: Shoe, col: string): string {
    if (col === 'releasedAt') return displayReleaseDate(s.releasedAt, s.releaseDateSource);
    const cat = categoricalValue(s, col, idx);
    if (cat !== undefined) return cat;
    if (col === 'plate') return s.plate === 'none' ? '—' : s.plate === 'carbon' ? 'Carbon' : 'Non-carbon';
    const resolved = scores.get(col);
    if (resolved) {
      const sc = resolved.get(s.slug);
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

<div class="tblwrap">
<table>
  <thead>
    <tr>
      <th class="name">Shoe</th>
      {#each view.columns as col (col)}
        <th class:fig={isFigure(col, idx.bySlug.get(col))}
            aria-sort={view.sort.key === col ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
          <button type="button" onclick={() => setSort(col)}>
            <span class="h-name">{columnLabel(col, idx.bySlug.get(col))}<span class="caret" class:on={view.sort.key === col}>
              {#if view.sort.key === col && view.sort.dir === 'asc'}
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 6l3-3 3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
              {:else}
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
              {/if}
            </span></span>
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
            <!-- No brand line: 442 of 450 names already begin with their brand, and the other 8
                 shorten it rather than drop it (docs/app.md §Columns and sorting). -->
            <div><strong>{s.name}</strong>{#if s.discontinued}<span class="disc-tag">discontinued</span>{/if}</div>
          </div>
        </td>
        {#each view.columns as col (col)}
          {@const p = percentiles.get(col)?.get(s.slug)}
          <td class="num" class:fig={isFigure(col, idx.bySlug.get(col))}
              style:--a={p === undefined ? 0 : washOf(col) === 'blue' ? washAlpha(p) : greyAlpha(p)}
              class:tinted={p !== undefined}
              class:blue={washOf(col) === 'blue'} class:grey={washOf(col) === 'grey'}>{cellText(s, col)}</td>
        {/each}
      </tr>
      {#if expanded.has(s.slug)}
        <tr class="expand" id="detail-{s.slug}"><td colspan={1 + view.columns.length}><DetailPanel shoe={s} {data} columns={view.columns} {stability} /></td></tr>
      {/if}
    {/each}
  </tbody>
</table>
</div>

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
  .h-units { font-family: var(--font-mono); font-size: var(--t-xs); font-weight: 400; color: var(--text-dim); min-height: 1em; }
  th.fig, td.fig { text-align: right; }
  th.fig button { align-items: flex-end; }
  td { border-bottom: 1px solid var(--border-soft); padding: var(--s2); }
  td.fig { font-family: var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  /* No `overflow` here, deliberately: it would make the wrapper a scrollport and detach the sticky
     `thead`, which is the failure `.content` already documents. The consequence is that the sticky
     header paints over the wrapper's top corners — the same trade the phone panel makes explicitly
     (docs/app.md §Two renderings, and only one of them mounted). */
  .tblwrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md);
             box-shadow: var(--shadow-panel); }
  /* The surface belongs to the ROW, and the wash travels inward from it (docs/app.md §Theming).
     On the cell it would be replaced by the translucent wash, which `td.num.tinted` sets at higher
     specificity — and the cell would then composite over the page instead of over the surface. */
  tr.shoe { cursor: pointer; background: var(--surface); }
  /* A background *image* layers over the cell's background colour, so hovering a tinted cell
     dims it rather than replacing the percentile wash with a flat one. */
  tr.shoe:hover td { background-image: linear-gradient(var(--hover-wash), var(--hover-wash)); }
  /* The one exemption from app.css's single focus ring, and it must stay. That ring is a
     `box-shadow`, which draws OUTSIDE the element — on a row that spans the whole table and abuts
     the rows above and below it with no gap, an outside ring paints over both of them. The inset
     outline stays inside the row instead. `app.css` excludes `tr` from the global rule rather than
     relying on this one to win, so the two cannot both draw (docs/app.md §Theming). */
  tr.shoe:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  /* The cell keeps its own opaque background as well as the row's: it is sticky, and the numeric
     cells scroll underneath it rather than behind the row. */
  td.name { min-width: 14rem; background: var(--surface); }
  .name-row { display: flex; gap: var(--s2); align-items: center; }
  /* The plate read "Non-carbon plate", which wrapped to three lines in an auto-sized column and
     made the row heights ragged; the label is now "Non-carbon" and the column asks 39px less, but
     the rule stays because wrapping is what made it ragged, not the length
     (docs/app.md §Table presentation). On the cell rather than the header, deliberately: `nowrap`
     on a `th` makes every column's minimum its longest header, which summed past the viewport
     (docs/app.md §Columns and sorting). */
  td.num:not(.fig) { white-space: nowrap; }
  /* Expandability was signalled by `cursor: pointer` alone, which a touch reader never sees. */
  .chev { display: inline-block; color: var(--text-dim); }
  /* The direction of the sort is still announced by `aria-sort` on the th; the caret is decoration. */
  .caret { display: inline-flex; margin-left: 3px; color: var(--text-dim); opacity: 0; }
  .caret.on { color: var(--accent); opacity: 1; }
  th:hover .caret { opacity: 0.55; }
  th:hover .caret.on { opacity: 1; }
  /* Unconditional, because this component is the desktop rendering: below 700px `Page.svelte`
     mounts `ShoeTableMobile` instead, which has no horizontal scroll to pin against
     (docs/app.md §Columns and sorting). */
  th.name, td.name { position: sticky; left: 0; z-index: 1; }
  thead th.name { z-index: 3; }
  /* Alpha is resolved in lib/wash.ts, where the contrast rule is enforced. Blue may be a podium;
     grey stays linear (docs/app.md §Theming). */
  td.num.tinted.blue { background-color: color-mix(in oklab, var(--wash-blue) calc(var(--a) * 100%), transparent); }
  td.num.tinted.grey { background-color: color-mix(in oklab, var(--wash-grey) calc(var(--a) * 100%), transparent); }
  /* Neutral, not red: this is metadata, and red is error semantics. Dimming the row would argue
     against the `discontinued=only` filter, which exists because those shoes are worth finding. */
  .disc-tag { margin-left: var(--s2); font-size: var(--t-xs); letter-spacing: 0.06em; text-transform: uppercase;
              color: var(--text-dim); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 0 var(--s1); }
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
