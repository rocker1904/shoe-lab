<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { displayNumber, indexTests, numericValue } from '../lib/dataset';
  import { washOf } from '../lib/direction';
  import { greyAlpha, washAlpha } from '../lib/wash';
  import { categoricalValue, isNegativeReading } from '../lib/categorical';
  import { displayReleaseDate } from '../lib/release-date';
  import { chipLabel, columnLabel, shortLabel } from '../lib/labels';
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
  const expanded = new SvelteSet<string>();

  /** The value row is only ever numeric: it is what keeps every chip the same box under a header
   *  that labels it (docs/app.md §Columns and sorting). */
  const cols = $derived(view.columns.filter((c) => isFigure(c, idx.bySlug.get(c))));
  // A shoe whose value row holds nothing still needs a cell to span, so the colspan never hits 0.
  const span = $derived(Math.max(cols.length, 1));
  // The score's wash ranks over the **rendered rows**, like every other column's, or its tint would
  // mean something different from its neighbours' in the same row.
  const percentiles = $derived(new Map(cols.map((c) => [c,
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
    const resolved = scores.get(col);
    if (resolved) {
      const sc = resolved.get(s.slug);
      return sc === undefined ? '—' : displayNumber(sc);
    }
    const v = col === 'score' ? s.score : numericValue(s, col, idx);
    return v === null || v === undefined ? '—' : displayNumber(v);
  }
  /** The columns that hold words, rendered after the name and wrapping rather than truncating.
   *  A shoe with no plate and no date contributes nothing, rather than a row of em dashes.
   *
   *  Each entry carries the column it came from, because that is the only unique thing about it:
   *  two categorical readings both saying "None" is the ordinary case, and keying the strip by its
   *  own text threw on the duplicate and blanked the page (docs/app.md §Categorical columns). */
  function metaOf(s: Shoe): { key: string; text: string }[] {
    const out: { key: string; text: string }[] = [];
    if (view.columns.includes('releasedAt') && s.releasedAt) {
      out.push({ key: 'releasedAt', text: displayReleaseDate(s.releasedAt, s.releaseDateSource) });
    }
    if (view.columns.includes('plate') && s.plate !== 'none') {
      out.push({ key: 'plate', text: s.plate === 'carbon' ? 'Carbon' : 'Non-carbon' });
    }
    // Categorical readings hold words too, so they belong on this line rather than in the numeric
    // value row (docs/app.md §Categorical columns). Two things this line does that a cell does not:
    // it drops an absence, because prose listing what a shoe lacks is noise where a column has a
    // header asking the question; and it names the column, because "Both sides (semi)" on its own
    // answers a question nothing here asked. A bool needs no value at all — naming the feature is
    // the whole reading.
    for (const col of view.columns) {
      const cat = categoricalValue(s, col, idx);
      if (cat === undefined || isNegativeReading(s, col, idx)) continue;
      const test = idx.bySlug.get(col);
      const label = chipLabel(col, test);
      out.push({ key: col, text: test?.type === 'bool' ? label : `${label}: ${cat}` });
    }
    return out;
  }
  async function toggle(slug: string, row: HTMLElement | null) {
    if (expanded.delete(slug)) return;
    expanded.add(slug);
    // The panel opens below the shoe, so a shoe near the fold opens off screen. Awaited so the
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

<!-- Bled most of the way out of `.content`'s inline padding: six 53px columns need 332px, which a
     360px phone can pay for only if the page's own padding is nearly given back — and what is left
     buys the panel its inset (docs/app.md §Columns and sorting). -->
<div class="bleed">
  <div class="panel">
    <table data-testid="shoe-table-mobile" style:--cols={span}>
    <thead>
      <tr>
        {#each cols as col (col)}
          <th aria-sort={view.sort.key === col ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
            <button type="button" onclick={() => setSort(col)}>
              <span class="h-name">{shortLabel(col, columnLabel(col, idx.bySlug.get(col)))}</span><SortCaret
                dir={view.sort.key === col ? view.sort.dir : null} placement="corner" />
              <span class="h-units">{headerUnits(col, idx.bySlug.get(col))}</span>
            </button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each shoes as s, i (s.slug)}
        {#if i > 0}<tr class="rule" aria-hidden="true"><td colspan={span}></td></tr>{/if}
        <!-- `aria-expanded` says the row controls something; `aria-controls` is the only thing
             that says what, and the panel is a sibling row rather than a child of the control.
             Emitted only while it is open: the panel exists only then, and an IDREF naming a node
             that is not in the document is an unresolvable reference rather than a promise of one. -->
        <tr class="shoe" tabindex="0" aria-expanded={expanded.has(s.slug)}
            aria-controls={expanded.has(s.slug) ? `detail-${s.slug}` : undefined}
            onclick={(e) => void toggle(s.slug, e.currentTarget)} onkeydown={(e) => onRowKey(e, s.slug)}>
          <td class="ident" colspan={span}>
            <span class="chev" class:open={expanded.has(s.slug)} aria-hidden="true">›</span>
            <strong>{s.name}</strong>
            {#each metaOf(s) as m (m.key)}<span class="meta">{m.text}</span>{/each}
            {#if s.discontinued}<DiscontinuedTag />{/if}
          </td>
        </tr>
        <tr class="values">
          {#each cols as col (col)}
            {@const p = percentiles.get(col)?.get(s.slug)}
            <td>
              <span class="chip" class:tinted={p !== undefined}
                    style:--a={p === undefined ? 0 : washOf(col) === 'blue' ? washAlpha(p) : greyAlpha(p)}
                    class:blue={washOf(col) === 'blue'} class:grey={washOf(col) === 'grey'}>{cellText(s, col)}</span>
            </td>
          {/each}
        </tr>
        {#if expanded.has(s.slug)}
          <tr class="expand" id="detail-{s.slug}"><td colspan={span}><DetailPanel shoe={s} {data} columns={view.columns} {stability} /></td></tr>
        {/if}
      {/each}
    </tbody>
  </table>
  </div>
</div>

<style>
  .bleed { margin-inline: calc(-1 * var(--s4) + var(--s3)); }
  /* One panel for the table, not one card per shoe. Three planes, and the rule is that elevation
     follows what is PINNED: page, then this panel, then the sticky header on top of it
     (docs/app.md §Theming).
     Square top, rounded bottom, and no top border: the panel sits flush under the full-bleed
     chrome, so a lid here would be a second line beside the sticky header's own — and it could not
     be drawn correctly anyway, because `overflow-x` must stay `visible` and a box that cannot clip
     horizontally cannot clip the square header cell out of a rounded top corner. The header carries
     the lid instead, which is also what stops it scrolling up and out from under the pinned row.
     `overflow-y: clip` rounds the bottom without breaking `position: sticky` — `overflow: hidden`
     makes this a scroll container and the header lands 19px out of place, the same failure mode
     `.content` has with `overflow-x`. Plain `overflow: clip` makes every column past the sixth
     unreachable, which `cross-browser.spec.ts` now asserts. */
  .panel { background: var(--surface);
           border: 1px solid var(--border); border-top: none;
           border-radius: 0 0 var(--r-md) var(--r-md);
           box-shadow: var(--shadow-panel); overflow-x: visible; overflow-y: clip; }
  /* Fixed layout with spacing-derived gaps: content-sized columns made every chip a different
     width and detached each header from the values it labels. The min-width is the six-column
     bound — 53px a column plus the spacing either side of each — so past six columns the geometry
     the labels were validated against holds and the page scrolls instead
     (docs/app.md §Columns and sorting). */
  table {
    table-layout: fixed; border-collapse: separate; border-spacing: 2px 0; width: 100%;
    min-width: calc(var(--cols) * 53px + (var(--cols) + 1) * 2px);
    font-size: var(--t-md);
  }
  /* 2px, deliberately not `--s1`: the token is 4px and would take 4px off a 53px column, which is
     the difference between a name fitting the header and clipping (docs/app.md §Columns and sorting).
     The lid belongs to the thing that is pinned. Square corners, deliberately: a rounded opaque
     cell over scrolling content leaves its corner arcs transparent and a coloured chip passing
     behind shows through as a sliver — and the panel cannot clip that away, because overflow-x is
     visible. The panel is square-topped to match, which is right because it sits flush under the
     chrome (docs/app.md §Two renderings, and only one of them mounted).
     Four shadow layers, and the ORDER is the trick — an earlier shadow paints over a later one:
       · the two --border copies are full height and offset by exactly the border-spacing, so they
         carry both hairlines across each 2px gap and out to the table's edge, where they meet the
         panel's side borders;
       · the two --surface copies sit on top, offset one pixel further out and inset one pixel top
         and bottom (the `-1px` spread), so they cover everything between the two hairlines and
         leave precisely 1px of border showing at each edge — flush with this cell's own
         border-top and border-bottom rather than a pixel above them.
     Without the --surface copies a cell background stops at the cell and scrolled rows show through
     the gaps; without the --border copies the lid is a dashed line. Both are load-bearing. */
  th { padding: var(--s1) 2px; background: var(--surface); vertical-align: bottom;
       position: sticky; top: var(--thead-top); z-index: 2;
       border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
       box-shadow: var(--shadow-sticky),
                   3px 0 0 -1px var(--surface), -3px 0 0 -1px var(--surface),
                   2px 0 0 var(--border), -2px 0 0 var(--border); }
  th button { display: flex; flex-direction: column; align-items: center; gap: 1px; width: 100%;
              background: none; border: none; color: var(--text); font: inherit; font-size: var(--t-xs);
              font-weight: 600; letter-spacing: -0.02em; cursor: pointer; padding: 0; text-align: center; }
  /* The unit line is a figure line like every other (docs/app.md §Table presentation), and the
     desktop header's already is — leaving this one proportional makes one column heading read
     differently on the two renderings. */
  .h-units { font-family: var(--font-mono); font-weight: 400; color: var(--text-dim); min-height: 1em; }
  /* A list, not cards. Proximity does the grouping — there is more space above a name than between
     it and its own chips — and it recovers roughly one shoe per screen, which is the direct price
     docs/app.md flags for the two-row geometry. */
  tr.shoe { cursor: pointer; }
  td.ident { padding: var(--s2) var(--s1) var(--s1); font-size: var(--t-sm); }
  td.ident strong { font-weight: 600; }
  /* The separator belongs to the metadata run, which is prose. The discontinued chip is a bordered
     micro-label owned by `DiscontinuedTag.svelte` and carries its own margin, so a `·` in front of
     it would punctuate a box. */
  .meta::before { content: '·'; margin: 0 var(--s1); color: var(--text-dim); }
  .meta { color: var(--text-dim); font-size: var(--t-xs); }
  tr.values td { padding: 0 0 var(--s2); }
  /* One hairline between shoes, drawn by its own row so it spans the border-spacing gaps. */
  tr.rule td { border-top: 1px solid var(--border-soft); height: 0; padding: 0; }
  /* --well, not --surface: the same elevation rule the desktop expanded row follows. A panel that
     is raised on the phone and recessed on the desktop is two answers to one question. */
  tr.expand td { background: var(--well); }
  /* Exempt from app.css's single focus ring, which is `:not(tr)` for these two rows. A box-shadow
     ring draws OUTSIDE the box: on a full-width row it would paint over the row above and below,
     and inside this panel `overflow-y: clip` would cut it off completely on the first and last
     shoe. The inset outline stays within the row. `tr.values` never takes focus itself — it is the
     same shoe's second row — so it needs no rule, only the same exclusion (docs/app.md §Theming). */
  tr.shoe:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  /* Inset rather than full-bleed: at this density edge-to-edge cells read as a solid band of
     colour, far louder than the desktop table (docs/app.md §Theming). */
  /* Values stay centred: at this density the wash does most of the parsing work, and centred is
     the more composed object with fixed equal columns (docs/app.md §Columns and sorting). */
  .chip { display: block; margin: 0 var(--s1); padding: var(--s1) 0; border-radius: var(--r-sm);
          text-align: center; font-family: var(--font-mono); font-size: var(--t-xs);
          letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
  .chip.tinted.blue { background-color: color-mix(in oklab, var(--wash-blue) calc(var(--a) * 100%), transparent); }
  .chip.tinted.grey { background-color: color-mix(in oklab, var(--wash-grey) calc(var(--a) * 100%), transparent); }
  /* The name's size, not the metadata's: it is the affordance for the whole shoe. */
  .chev { display: inline-block; color: var(--text-dim); }
  @media (prefers-reduced-motion: no-preference) {
    .chev { transition: transform 120ms ease-out; }
    tr.expand td { animation: reveal 140ms ease-out; }
  }
  .chev.open { transform: rotate(90deg); }
  @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
</style>
