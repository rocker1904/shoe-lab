<script lang="ts">
  import { tick } from 'svelte';
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { displayNumber, indexTests, numericValue } from '../lib/dataset';
  import { washOf } from '../lib/direction';
  import { DEFAULT_PAINT, greyAlpha, rankedAlpha, rankedMix, type WashPaint } from '../lib/wash';
  import { categoricalValue, PLATE_LABELS } from '../lib/categorical';
  import { displayReleaseDate } from '../lib/release-date';
  import { columnLabel } from '../lib/labels';
  import type { ScoreColumns } from '../lib/score';
  import { nextSort } from '../lib/sort';
  import { percentileMap, rankMap } from '../lib/stats';
  import { headerUnits, isFigure } from '../lib/units';
  import type { ViewState } from '../lib/urlstate';
  import DetailPanel from './DetailPanel.svelte';
  import DiscontinuedTag from './DiscontinuedTag.svelte';
  import SortCaret from './SortCaret.svelte';

  let { shoes, data, view, scores, stability, open, ontoggle, onchange, paint = DEFAULT_PAINT }: {
    shoes: Shoe[]; data: ShoesFile; view: ViewState;
    /** Resolved in `Page.svelte` and keyed by column: a score is the one kind of column whose value
     *  depends on the view rather than on the shoe alone, so it arrives ready rather than through
     *  `numericValue` (docs/app.md §The story scores). */
    scores: ScoreColumns;
    /** The preference `scores` were computed with, passed through to the panel so its breakdown
     *  cannot disagree with the value rendered beside it. */
    stability: boolean;
    /** A set, not a single slug: comparing two shoes means having both panels open at once. Owned
     *  by `Page.svelte`, because only one of the two tables is ever mounted and a set owned here
     *  would be dropped whole every time the rendering changed — which a ticked column can now do
     *  at a width that never moved (docs/app.md §Two renderings, and only one of them mounted). */
    open: ReadonlySet<string>;
    ontoggle: (slug: string) => void;
    onchange: (v: ViewState) => void;
    /** Resolved once per preference change in `Page.svelte` — the cell does arithmetic and nothing
     *  else with it, so a dragged grip costs what it always did
     *  (docs/app.md §The display preferences). Defaulted, because most of this component's tests
     *  are about the table rather than about the ramp. */
    paint?: WashPaint;
  } = $props();

  const idx = $derived(indexTests(data.tests));

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
    next.sort = nextSort(view.sort, key);
    onchange(next);
  }
  function cellText(s: Shoe, col: string): string {
    if (col === 'releasedAt') return displayReleaseDate(s.releasedAt, s.releaseDateSource);
    const cat = categoricalValue(s, col, idx);
    if (cat !== undefined) return cat;
    if (col === 'plate') return PLATE_LABELS[s.plate];
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
    const opening = !open.has(slug);
    ontoggle(slug);
    if (!opening) return;
    // The panel opens *below* the row, so a row near the fold opens off screen. Awaited so the
    // panel exists to be measured and scrolled to.
    await tick();
    reveal(row);
  }

  let body = $state<HTMLElement | null>(null);
  /**
   * The same landing a click-expand gets, for a row this component did not open. Back and Forward
   * are the only other way one opens, and `Page.svelte` owns which row that is
   * (docs/app.md §View and URL ownership) — it has a slug off the address and no element, so the
   * row is looked up here rather than passed in.
   */
  export async function revealRow(slug: string): Promise<void> {
    await tick();
    reveal(body?.querySelector<HTMLElement>(`tr.shoe[data-slug="${CSS.escape(slug)}"]`) ?? null);
  }

  /** jsdom implements no layout and defines neither `scrollIntoView` nor `matchMedia`, hence the
   *  optional calls throughout. */
  function reveal(row: HTMLElement | null) {
    const panel = row?.nextElementSibling;
    if (!row || !panel) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const behavior = reduced ? 'auto' : 'smooth';
    /*
     * The ROW is the scroll target once the panel is taller than the window, not the panel. Aligning
     * a too-tall panel's top with the top of the scrollport puts the row — which still holds focus
     * and carries `aria-expanded` — entirely BEHIND the pinned chrome: measured at six places, six
     * of six landed above the chrome's lower edge with focus still on them, and `elementFromPoint`
     * at the row's own corner returned the header. Pressing Enter on a shoe made that shoe
     * disappear, which is a WCAG 2.4.11 failure (docs/app.md §Table presentation).
     *
     * `scroll-margin-top` on the row is the measured chrome PLUS the measured header row, so
     * `start` lands the row flush under both rather than under the viewport's top edge — aligning
     * it to the chrome alone left it behind the pinned header, which paints over the rows sliding
     * under it. A panel that DOES fit is still scrolled by `nearest`, which moves the least and
     * leaves the row where the runner left it.
     */
    if ((panel.getBoundingClientRect?.().bottom ?? 0) <= window.innerHeight) {
      panel.scrollIntoView?.({ behavior, block: 'nearest' });
      return;
    }
    row.scrollIntoView?.({ behavior, block: 'start' });
  }
  /** The pinned header's measured height; see the markup below for why it cannot be a constant. */
  let headHeight = $state(0);
  function onRowKey(e: KeyboardEvent, slug: string) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    void toggle(slug, e.currentTarget as HTMLElement);
  }
</script>

<!-- `--head-h` is the pinned header's own height, measured the way `Page.svelte` measures the
     chrome and for the same reason: the headers wrap, so it is a function of the width and of the
     face that has loaded, and a constant is right at one width only. It is what a row's
     `scroll-margin-top` adds to `--thead-top` (docs/app.md §Table presentation). -->
<div class="tblwrap" style:--head-h="{headHeight}px">
<table>
  <thead bind:clientHeight={headHeight}>
    <tr>
      <!-- A real sort control, not a label. `name` is a sort key the parser accepts, so a link
           carrying it reordered 450 rows with no `aria-sort` anywhere in the table and nothing that
           could reverse it — the untrue-claim species rather than a nicety
           (docs/app.md §Columns and sorting). Same button, same caret, same contract as every
           figure header; the units line stays empty, because the reserve is what keeps every
           header's name on one baseline. -->
      <th class="name"
          aria-sort={view.sort.key === 'name' ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        <button type="button" onclick={() => setSort('name')}>
          <span class="h-name">{columnLabel('name', undefined)}<SortCaret
            dir={view.sort.key === 'name' ? view.sort.dir : null} /></span>
          <span class="h-units"></span>
        </button>
      </th>
      {#each view.columns as col (col)}
        {@const fig = isFigure(col, idx.bySlug.get(col))}
        <th class:fig
            aria-sort={view.sort.key === col ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
          <button type="button" onclick={() => setSort(col)}>
            <!-- The mark leaves the flow in a FIGURE column only. Its name and unit lines are
                 right-aligned to the edge the figures keep, so inline it ends the text a
                 `--caret-w` short of the numbers below and the header stops lining up with its own
                 column. A phrase column is left-aligned, where a trailing mark is exactly where a
                 mark belongs and costs that edge nothing (docs/app.md §Table presentation). -->
            <span class="h-name">{columnLabel(col, idx.bySlug.get(col))}<SortCaret
              dir={view.sort.key === col ? view.sort.dir : null}
              placement={fig ? 'corner-start' : 'inline'} /></span>
            <!-- Always rendered, empty or not: vertical is the axis we have spare, and a missing
                 second line would make the header rows different heights. -->
            <span class="h-units">{headerUnits(col, idx.bySlug.get(col))}</span>
          </button>
        </th>
      {/each}
    </tr>
  </thead>
  <!-- `data-slug` is how `revealRow` finds a row Back or Forward opened, which arrives as a slug
       off the address rather than as an element. -->
  <tbody bind:this={body}>
    {#each shoes as s (s.slug)}
      <!-- `aria-expanded` says the row controls something; `aria-controls` is the only thing that
           says what, and the panel is a sibling row rather than a child of the control. Emitted only
           while it is open: the panel exists only then, and an IDREF naming a node that is not in
           the document is an unresolvable reference rather than a promise of one. -->
      <tr class="shoe" tabindex="0" data-slug={s.slug} aria-expanded={open.has(s.slug)}
          aria-controls={open.has(s.slug) ? `detail-${s.slug}` : undefined}
          onclick={(e) => void toggle(s.slug, e.currentTarget)} onkeydown={(e) => onRowKey(e, s.slug)}>
        <!-- The flex lives on a wrapper, not on the cell: `display: flex` on a `td` takes it out of
             the table-cell box, so it stops stretching to the row and leaves a half-height block the
             numeric cells scroll through under the sticky column. -->
        <td class="name">
          <div class="name-row">
            <span class="chev" class:open={open.has(s.slug)} aria-hidden="true">›</span>
            <!-- No brand line: 442 of 450 names already begin with their brand, and the other 8
                 shorten it rather than drop it (docs/app.md §Columns and sorting). -->
            <div><strong>{s.name}</strong>{#if s.discontinued}<DiscontinuedTag />{/if}</div>
          </div>
        </td>
        {#each view.columns as col (col)}
          {@const p = percentiles.get(col)?.get(s.slug)}
          {@const blue = washOf(col) === 'blue'}
          <td class="num" class:fig={isFigure(col, idx.bySlug.get(col))}
              style:--a={p === undefined ? 0 : blue ? rankedAlpha(p, paint) : greyAlpha(p)}
              style:--w={p !== undefined && blue && paint.dual ? rankedMix(p, paint) : undefined}
              class:tinted={p !== undefined}
              class:blue={blue} class:grey={washOf(col) === 'grey'}>{cellText(s, col)}</td>
        {/each}
      </tr>
      {#if open.has(s.slug)}
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
  /* `width: 100%` is what makes `text-align` on the `th` reach this at all, and its absence was a
     silent misalignment for every viewport with slack in it. `display: flex` blockifies the button,
     but a `<button>`'s auto width still resolves to fit-content — so it is a BLOCK-LEVEL box
     narrower than its cell, and `text-align` moves inline-level content only and cannot touch it.
     It therefore sat at the cell's inline start with the slack piled to its right, and a figure
     column's right-aligned header read as left-aligned: measured 8px from the left edge in every
     column at 1700px and above, against figures 128px away at 2560px. Below ~1500px the default
     columns are at their minimum, the button fills the cell exactly, and the bug has nowhere to
     show — which is why one width could not find it and `smoke.spec.ts` now sweeps three.
     Filling the cell also makes the whole header the sort target rather than just its text
     (docs/app.md §Columns and sorting). */
  th button { display: flex; flex-direction: column; gap: 1px; width: 100%; background: none; border: none; color: var(--text);
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
  /* The reserve the out-of-flow mark is owed, and it is on the LEFT because that is the corner
     `corner-start` puts it in — the one a right-aligned header grows away from. In flow rather than
     bounded by a constant: the browser then sizes the column to keep it, so a long unit string
     widens its column instead of sliding under the mark, and `fit.ts` states the same 12px as
     `CARET_PX` on the units term of `headerMinPx`.
     It used to be `margin-right`, reserving a gutter the mark sat in inline. That kept the name and
     unit lines on one edge — which they still are, and `smoke.spec.ts` still asserts — but it put
     that shared edge a `--caret-w` inside the figures' own, so the header lined up with itself and
     with nothing else (docs/app.md §Table presentation). */
  th.fig .h-units { margin-left: var(--caret-w); }
  td { border-bottom: 1px solid var(--border-soft); padding: var(--s2); }
  /* THE PANEL IS THE RECESSED SURFACE, so nothing may be drawn around it. This cell took the
     figures' own `--s2` and paints nothing itself, which framed the `--well` panel in 8px of the
     table's `--surface` on every side — a raised border around a thing whose whole point is to sit
     BELOW the row (docs/app.md §The expanded row). Measured 8/8/8/9px, both engines, both themes;
     subtler in dark, where the frame is `#1a1d21` against the panel's `#16191d`, and the same
     defect. The panel owns every pixel of its own spacing, so the cell has nothing to add: the
     phone rendering answers the same question by painting its cell `--well` instead, because there
     the panel does not span it. */
  tr.expand td { padding: 0; }
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
  /* What "scrolled to" means for a row: below the pinned chrome, not under it. `--thead-top` is the
     chrome's measured height and the one home for it (docs/app.md §Columns and sorting) — the same
     token the pinned header row and the skip link's anchor already read. On the panel as well as the
     row, so any scroll that ever targets it clears the chrome too.
     The header row is part of that band: it pins UNDER the chrome and paints over the rows sliding
     beneath it, so a row aligned to `--thead-top` alone lands behind it — measured, and it is what
     `elementFromPoint` at the row's own corner returned. */
  tr.shoe, tr.expand { scroll-margin-top: calc(var(--thead-top) + var(--head-h, 0px)); }
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
  /* Unconditional, because this component is the desktop rendering: wherever it would not fit
     `Page.svelte` mounts `ShoeTableMobile` instead, which has no horizontal scroll to pin against
     (docs/app.md §Columns and sorting). */
  th.name, td.name { position: sticky; left: 0; z-index: 1; }
  thead th.name { z-index: 3; }
  /* Alpha is resolved in lib/wash.ts, where the contrast rule is enforced. Blue may be a podium;
     grey stays linear (docs/app.md §Theming). */
  td.num.tinted.blue { background-color: color-mix(in oklab, var(--wash-blue) calc(var(--a) * 100%), transparent); }
  td.num.tinted.grey { background-color: color-mix(in oklab, var(--wash-grey) calc(var(--a) * 100%), transparent); }
  /* Base colour on: alpha is flat, so the COLOUR carries the magnitude and the cell mixes
     base → better by `--w` before it is composited. A SECOND rule rather than a parameterised
     first one — the single-colour declaration has to stay untouched for a runner who never opened
     the menu to get exactly what they always got (docs/app.md §The display preferences). */
  :global(:root[data-wash='dual']) td.num.tinted.blue {
    background-color: color-mix(in oklab,
      color-mix(in oklab, var(--wash-blue) calc(var(--w) * 100%), var(--wash-base))
      calc(var(--a) * 100%), transparent);
  }
  @media (prefers-reduced-motion: no-preference) {
    .chev { transition: transform 120ms ease-out; }
    tr.expand td { animation: reveal 140ms ease-out; }
  }
  /* Outside the query, like the phone rendering's: the turned chevron is STATE, not motion, so it
     must be drawn under `reduce` as well — only the transition into it is a preference. */
  .chev.open { transform: rotate(90deg); }
  @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
</style>
