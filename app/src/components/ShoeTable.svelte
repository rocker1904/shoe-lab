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
  import DiscontinuedTag from './DiscontinuedTag.svelte';
  import SortCaret from './SortCaret.svelte';

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
            <span class="h-name">{columnLabel(col, idx.bySlug.get(col))}<SortCaret
              dir={view.sort.key === col ? view.sort.dir : null} /></span>
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
            <div><strong>{s.name}</strong>{#if s.discontinued}<DiscontinuedTag />{/if}</div>
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
     chrome roughly doubles between a desktop width and a phone, so any constant here hides this row
     behind it at every width but one. docs/app.md §Columns and sorting owns the measurements.
     The panel's lid rides on this row for the reason `ShoeTableMobile.svelte`'s `th` sets out in
     full, and the two renderings use the one technique. Where they differ is the cheap half: this
     table's `border-spacing` is 0, so the header row is already a continuous band and a plain
     `border-top` reaches the panel's side borders — the phone's 2px spacing is the only reason its
     lid has to ride in a box-shadow stack. */
  thead th { position: sticky; top: var(--thead-top); z-index: 2; box-shadow: var(--shadow-sticky);
             border-top: 1px solid var(--border); }
  th button { display: flex; flex-direction: column; gap: 1px; background: none; border: none; color: var(--text);
              font: inherit; font-weight: 600; cursor: pointer; padding: 0; text-align: inherit; }
  /* Two lines of name are RESERVED whether or not this column's name needs them, so the pinned
     header's height stops being a function of which columns are ticked and a view of short names
     alone cannot shrink it and shift the whole table under the runner. It is a floor, not a cap:
     a name still takes a third line where its column is short enough, so the reserve buys stability
     against the column set rather than against width. The price is paid at the wide end — once the
     table track reaches 1280px every default name fits on one line, and the second reserved line is
     18px of header pinned above every screenful. It is also what lets the loading placeholder
     reserve a band that matches; `smoke.spec.ts` measures the two against each other on both sides
     of the third-line threshold (docs/app.md §Decisions). Bottom-aligned inside that box, so a
     one-line name reads as extra air above the header rather than as a hole between the name and
     the units under it — and every column's name and unit line then land on a common baseline. */
  .h-name { display: flex; align-items: flex-end; min-height: 2lh; }
  /* `1lh`, not `1em`: the reserve has to be the LINE BOX a unit string would occupy, and at
     `--t-xs` JetBrains Mono renders a 16px line box against a 12px em. A 12px reserve leaves the
     columns that carry no unit — `Released` and `Plate` are both in the default set — 4px short, so
     their names sit 2px below every other column's and the common baseline the reserve above exists
     to produce is not one. */
  .h-units { font-family: var(--font-mono); font-size: var(--t-xs); font-weight: 400; color: var(--text-dim); min-height: 1lh; }
  th.fig, td.fig { text-align: right; }
  th.fig button { align-items: flex-end; }
  /* The caret is drawn in EVERY sortable column, sorted or not, so it always occupies `--caret-w` at
     the end of the name line. Right-aligning both lines to the button's own edge therefore landed
     the unit string under the CARET rather than under the name's last glyph, and the two figures a
     header states — what the column is and what it is measured in — did not share an edge. Reserving
     the caret's width here ends the text column before the mark instead, which leaves the caret
     alone in the gutter to its right (docs/app.md §Table presentation). */
  th.fig .h-units { margin-right: var(--caret-w); }
  td { border-bottom: 1px solid var(--border-soft); padding: var(--s2); }
  td.fig { font-family: var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  /* No `overflow` here, deliberately: it would make the wrapper a scrollport and detach the sticky
     `thead`, which is the failure `.content` already documents.
     Square-topped with no top border, and the lid on the sticky header instead — the same shape and
     the same reasons as the phone panel, which owns the explanation
     (`ShoeTableMobile.svelte`, `.panel`). A `border-radius` here with an opaque `thead th` over it
     was simply a broken corner: the cell painted straight across both arcs. */
  .tblwrap { background: var(--surface); border: 1px solid var(--border); border-top: none;
             border-radius: 0 0 var(--r-md) var(--r-md); box-shadow: var(--shadow-panel); }
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
  /* And the name cell repaints its own share of it. `td.name` is sticky and opaque and therefore
     paints ABOVE the row's outline, so without this the ring is missing for the whole width of the
     name column and reads as three sides with a bite out of them.
     THREE inset edges, not an `outline`: an outline on the cell draws a fourth side at the name
     column's right boundary, which lands a 2px accent bar down the middle of the row — rendered at
     4x and confirmed. The row's own outline supplies that side already, so the cell paints only
     what it occludes.
     The bottom edge is 1px of shadow over the cell's own recoloured hairline, not 2px of shadow: an
     inset shadow stops at the padding box, so a 2px one lands a pixel high and the ring stepped
     where the sticky column ends. */
  tr.shoe:focus-visible td.name {
    border-bottom-color: var(--accent);
    box-shadow: inset 2px 0 0 var(--accent), inset 0 2px 0 var(--accent), inset 0 -1px 0 var(--accent);
  }
  /* The cell keeps its own opaque background as well as the row's: it is sticky, and the numeric
     cells scroll underneath it rather than behind the row. */
  td.name { min-width: 14rem; background: var(--surface); }
  .name-row { display: flex; gap: var(--s2); align-items: center; }
  /* The plate read "Non-carbon plate", which wrapped to three lines in an auto-sized column and
     made the row heights ragged; the label is now "Non-carbon" and the rule stays anyway, because
     wrapping is what made it ragged rather than the length — what the shorter string buys is
     measured in docs/app.md §Table presentation and lives only there. On the cell rather than the
     header, deliberately: `nowrap`
     on a `th` makes every column's minimum its longest header, which summed past the viewport
     (docs/app.md §Columns and sorting). */
  td.num:not(.fig) { white-space: nowrap; }
  /* Expandability was signalled by `cursor: pointer` alone, which a touch reader never sees. */
  .chev { display: inline-block; color: var(--text-dim); }
  /* Unconditional, because this component is the desktop rendering: below 700px `Page.svelte`
     mounts `ShoeTableMobile` instead, which has no horizontal scroll to pin against
     (docs/app.md §Columns and sorting). */
  th.name, td.name { position: sticky; left: 0; z-index: 1; }
  thead th.name { z-index: 3; }
  /* Alpha is resolved in lib/wash.ts, where the contrast rule is enforced. Blue may be a podium;
     grey stays linear (docs/app.md §Theming). */
  td.num.tinted.blue { background-color: color-mix(in oklab, var(--wash-blue) calc(var(--a) * 100%), transparent); }
  td.num.tinted.grey { background-color: color-mix(in oklab, var(--wash-grey) calc(var(--a) * 100%), transparent); }
  @media (prefers-reduced-motion: no-preference) {
    .chev { transition: transform 120ms ease-out; }
    tr.expand td { animation: reveal 140ms ease-out; }
  }
  /* Outside the query, like the phone rendering's: the turned chevron is STATE, not motion, so it
     must be drawn under `reduce` as well — only the transition into it is a preference. */
  .chev.open { transform: rotate(90deg); }
  @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
</style>
