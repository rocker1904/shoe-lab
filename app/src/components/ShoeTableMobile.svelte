<script lang="ts">
  import { tick } from 'svelte';
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { displayNumber, indexTests, numericValue } from '../lib/dataset';
  import { washOf } from '../lib/direction';
  import { DEFAULT_PAINT, washCellClass, type WashPaint } from '../lib/wash';
  import { categoricalValue, isNegativeReading, PLATE_LABELS } from '../lib/categorical';
  import { displayReleaseDate } from '../lib/release-date';
  import { chipLabel, columnLabel, shortLabel } from '../lib/labels';
  import type { ScoreColumns } from '../lib/score';
  import { nextSort } from '../lib/sort';
  import { percentileMap, rankMap } from '../lib/stats';
  import { headerUnits, isFigure } from '../lib/units';
  import type { ViewState } from '../lib/view';
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
    /** Resolved once per preference change in `Page.svelte` — the chip does arithmetic and nothing
     *  else with it, so a dragged grip costs what it always did
     *  (docs/app.md §The display preferences). Defaulted, because most of this component's tests
     *  are about the table rather than about the ramp. */
    paint?: WashPaint;
  } = $props();

  const idx = $derived(indexTests(data.tests));

  /** The value row is only ever numeric: it is what keeps every chip the same box under a header
   *  that labels it (docs/app.md §Columns and sorting). */
  const cols = $derived(view.columns.filter((c) => isFigure(c, idx.bySlug.get(c))));
  /**
   * The floor over a zero-column view, and it is **unobservable** — measured in Chromium and
   * Firefox at 360px and 375px rather than argued. It changes two things and neither reaches the
   * screen: the `colspan` attribute from `"0"` to `"1"`, which both engines clamp to 1 either way
   * (`colSpan` reflects 1 on both, HTML5 having dropped HTML4's "every remaining cell" meaning for
   * `colspan`, keeping it only for `rowspan`); and the table's `min-width` from the bare
   * border-spacing to one column's worth, which never binds, because the table is `width: 100%`
   * inside a bleed 336px wide at the narrowest supported layout
   * (docs/app.md §The narrowest supported width is 360px). Every rendered box —
   * bleed, panel, table, identity cell — is identical to the pixel with the floor and without.
   *
   * So this is a candidate for deletion rather than a guard, recorded here because the reason it
   * was believed to be load-bearing was wrong rather than merely stale. ShoeTableMobile.test.ts
   * pins the attribute it writes, so removing it is a deliberate act and not an accident.
   */
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
    // `lib/sort.ts` owns which way a first press goes, so the two renderings cannot disagree about
    // what pressing a header means (docs/app.md §Columns and sorting).
    next.sort = nextSort(view.sort, key);
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
      out.push({ key: 'plate', text: PLATE_LABELS[s.plate] });
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
    const opening = !open.has(slug);
    ontoggle(slug);
    if (!opening) return;
    // The panel opens below the shoe, so a shoe near the fold opens off screen. Awaited so the
    // panel exists to be measured.
    await tick();
    reveal(row);
  }

  let body = $state<HTMLElement | null>(null);
  /**
   * The same landing a tap gets, for a row this component did not open. Back and Forward are the
   * only other way one opens, and `Page.svelte` owns which row that is
   * (docs/app.md §View and URL ownership) — it holds a slug off the address and no element, so the
   * row is looked up here rather than passed in.
   */
  export async function revealRow(slug: string): Promise<void> {
    await tick();
    reveal(body?.querySelector<HTMLElement>(`tr.shoe[data-slug="${CSS.escape(slug)}"]`) ?? null);
  }

  /** jsdom lays nothing out and defines neither `matchMedia` nor a real `scrollTo`, hence the
   *  guards and the optional call. */
  function reveal(row: HTMLElement | null) {
    // The name row, then the values row, then the panel.
    const panel = row?.nextElementSibling?.nextElementSibling;
    if (!row || !panel) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const behavior = reduced ? 'auto' : 'smooth';
    /*
     * The scroll is COMPUTED rather than asked for, which is the call `lib/focus-scroll.ts` already
     * makes and which has a second reason here: `scrollIntoView` has no axis restriction and every
     * row in this table carries `colspan`, so past six columns opening a shoe also dragged the page
     * 94px sideways and cut the first 77px off every line of the review prose. A `scrollTo` carrying
     * only a `top` leaves the horizontal position where the runner put it.
     *
     * WHICH box is scrolled to is the desktop's rule (docs/app.md §Table presentation), with the
     * phone's own two heights: a panel that fits is moved the least that brings it on screen, and
     * one taller than the window cannot be scrolled to without putting the shoe's own NAME row off
     * the top — which was the failure, 150px of panel behind the chrome and the pinned list header
     * with nothing on screen saying which shoe had been opened. The room to leave is read back off
     * the row's own `scroll-margin-top`, so the two measured heights stay stated once, in CSS.
     */
    const panelBox = panel.getBoundingClientRect();
    const room = parseFloat(getComputedStyle(row).scrollMarginTop) || 0;
    const top = panelBox.height <= window.innerHeight - room
      ? window.scrollY + Math.max(0, panelBox.bottom - window.innerHeight)
      : window.scrollY + row.getBoundingClientRect().top - room;
    window.scrollTo?.({ top, behavior });
  }
  /** The pinned header's measured height; see the markup below for why it cannot be a constant. */
  let headHeight = $state(0);
  function onRowKey(e: KeyboardEvent, slug: string) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    void toggle(slug, e.currentTarget as HTMLElement);
  }
</script>

<!-- Bled most of the way out of `.content`'s inline padding: six 53px columns need 332px, which a
     360px phone can pay for only if the page's own padding is nearly given back — and what is left
     buys the panel its inset (docs/app.md §Columns and sorting). -->
<!-- `--head-h` is the pinned header's own height, measured the way `Page.svelte` measures the
     chrome and for the same reason: the labels wrap, so it is a function of the width and of the
     face that has loaded, and a constant is right at one width only. It is what a row's
     `scroll-margin-top` adds to `--thead-top` (docs/app.md §Table presentation). -->
<div class="bleed" style:--head-h="{headHeight}px" style:--cols={span}>
  <div class="panel">
    <table data-testid="shoe-table-mobile">
    <thead bind:clientHeight={headHeight}>
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
    <!-- `data-slug` is how `revealRow` finds a row Back or Forward opened, which arrives as a slug
         off the address rather than as an element. -->
    <tbody bind:this={body}>
      {#each shoes as s, i (s.slug)}
        {#if i > 0}<tr class="rule" aria-hidden="true"><td colspan={span}></td></tr>{/if}
        <!-- `aria-expanded` says the row controls something; `aria-controls` is the only thing
             that says what, and the panel is a sibling row rather than a child of the control.
             Emitted only while it is open: the panel exists only then, and an IDREF naming a node
             that is not in the document is an unresolvable reference rather than a promise of one. -->
        <tr class="shoe" tabindex="0" data-slug={s.slug} aria-expanded={open.has(s.slug)}
            aria-controls={open.has(s.slug) ? `detail-${s.slug}` : undefined}
            onclick={(e) => void toggle(s.slug, e.currentTarget)} onkeydown={(e) => onRowKey(e, s.slug)}>
          <td class="ident" colspan={span}>
            <span class="chev" class:open={open.has(s.slug)} aria-hidden="true">›</span>
            <strong>{s.name}</strong>
            {#each metaOf(s) as m (m.key)}<span class="meta">{m.text}</span>{/each}
            {#if s.discontinued}<DiscontinuedTag />{/if}
          </td>
        </tr>
        <tr class="values">
          {#each cols as col (col)}
            {@const p = percentiles.get(col)?.get(s.slug)}
            {@const blue = washOf(col) === 'blue'}
            <td>
              <!-- The desktop table's grammar exactly: one bucket class, no value at all
                   (docs/app.md §Theming). -->
              <span class="chip {p === undefined ? '' : washCellClass(blue, p, paint)}"
                    class:tinted={p !== undefined}
                    class:blue={blue} class:grey={washOf(col) === 'grey'}>{cellText(s, col)}</span>
            </td>
          {/each}
        </tr>
        {#if open.has(s.slug)}
          <tr class="expand" id="detail-{s.slug}"><td colspan={span}><DetailPanel shoe={s} {data} columns={view.columns} {stability} /></td></tr>
        {/if}
      {/each}
    </tbody>
  </table>
  </div>
</div>

<style>
  /* The six-column bound, as arithmetic rather than as a number in two places: 53px a column plus
     the border-spacing either side of each. The table takes it as its `min-width` and the panel
     takes it plus its own two side borders, which is what makes the card the table's container at
     EVERY column count (docs/app.md §Two renderings, and only one of them mounted). */
  .bleed { --table-w: calc(var(--cols) * 53px + (var(--cols) + 1) * 2px);
           margin-inline: calc(-1 * var(--s4) + var(--s3)); }
  /* What "scrolled to" means for a shoe here: below the pinned chrome AND below this list's own
     sticky header, which paints over the rows sliding beneath it. Both are measured — `--thead-top`
     by `Page.svelte`, `--head-h` above — because either alone leaves the shoe's name row behind the
     other (docs/app.md §Table presentation). `toggle()` reads this back rather than restating it. */
  tr.shoe, tr.expand { scroll-margin-top: calc(var(--thead-top, 0px) + var(--head-h, 0px)); }
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
  .panel { background: var(--surface); box-sizing: border-box; min-width: calc(var(--table-w) + 2px);
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
    min-width: var(--table-w);
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
     differently on the two renderings. `1lh` for the same reason it is `1lh` there: the reserve is
     the line box a unit string occupies, and the mono face renders that taller than its em, so a
     `1em` floor drops a unitless column's name below its neighbours'. */
  .h-units { font-family: var(--font-mono); font-weight: 400; color: var(--text-dim); min-height: 1lh; }
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
  /* Exempt from app.css's single focus ring, which is `:not(tr)` for these two rows. That ring is an
     OUTSIDE box-shadow: on a full-width row it would paint over the row above and below, and inside
     this panel `overflow-y: clip` would cut it off completely on the first and last shoe. These stay
     inset (docs/app.md §Theming).
     The ring encloses the SHOE, which is two rows here — the name and its chips. `aria-expanded`
     sits on `tr.shoe` and both rows are that one control, so a ring around the first alone stops
     halfway down the thing it describes. Drawn as three inset edges per row rather than an outline
     on each, because two outlines draw a line between the rows and read as two rings: the name row
     takes top, left and right, the chip row takes left, right and bottom, and they meet. */
  tr.shoe:focus-visible {
    /* `app.css` clears the UA ring for everything it styles, and that rule excludes `tr` — so a row
       that stops using `outline` has to say so itself or the browser's own ring draws outside both. */
    outline: none;
    box-shadow: inset 0 2px 0 var(--accent), inset 2px 0 0 var(--accent), inset -2px 0 0 var(--accent);
  }
  tr.shoe:focus-visible + tr.values {
    box-shadow: inset 2px 0 0 var(--accent), inset -2px 0 0 var(--accent), inset 0 -2px 0 var(--accent);
  }
  /* Inset rather than full-bleed: at this density edge-to-edge cells read as a solid band of
     colour, far louder than the desktop table (docs/app.md §Theming). */
  /* Values stay centred: at this density the wash does most of the parsing work, and centred is
     the more composed object with fixed equal columns (docs/app.md §Columns and sorting). */
  .chip { display: block; margin: 0 var(--s1); padding: var(--s1) 0; border-radius: var(--r-sm);
          text-align: center; font-family: var(--font-mono); font-size: var(--t-xs);
          letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
  /* No chip rule here: the wash is one class per chip, declared in the generated bucket stylesheet
     (`lib/display.ts`), which is the same grammar the desktop table paints from
     (docs/app.md §Theming). */
  /* The name's size, not the metadata's: it is the affordance for the whole shoe. */
  .chev { display: inline-block; color: var(--text-dim); }
  @media (prefers-reduced-motion: no-preference) {
    .chev { transition: transform 120ms ease-out; }
    tr.expand td { animation: reveal 140ms ease-out; }
  }
  .chev.open { transform: rotate(90deg); }
  @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
</style>
