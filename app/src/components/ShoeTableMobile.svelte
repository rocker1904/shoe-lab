<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { displayNumber, indexTests, numericValue } from '../lib/dataset';
  import { washOf } from '../lib/direction';
  import { DEFAULT_PAINT, washCellClass, type WashPaint } from '../lib/wash';
  import { categoricalValue, isNegativeReading, PLATE_LABELS } from '../lib/categorical';
  import { displayReleaseDate } from '../lib/release-date';
  import { chipLabel, columnLabel, shortLabel } from '../lib/labels';
  import {
    createRowHeights,
    measurePhoneGroupHeights,
    type PhoneHeightEntry,
    type RowHeightEnvironment,
  } from '../lib/row-height';
  import type { ScoreColumns } from '../lib/score';
  import { nextSort } from '../lib/sort';
  import { percentileMap, rankMap } from '../lib/stats';
  import { headerUnits, isFigure } from '../lib/units';
  import type { ViewState } from '../lib/view';
  import { PHONE_OVERSCAN_PX, virtualPlan, type VirtualEntry, type VirtualItem } from '../lib/virtual';
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
  /** The floor over a zero-column view, and it is **unobservable**: measured with it and without,
   *  every rendered box is identical to the pixel. Nothing asserts it, deliberately — a test on an
   *  inert attribute would fire for a change that breaks nothing — so do not read it as load-bearing
   *  and do not restore it if it goes. BACKLOG.md holds the measurement, the engines it was taken
   *  in, and the deletion. */
  const span = $derived(Math.max(cols.length, 1));
  // The score's wash ranks over the whole filtered set, never the window, or its tint would change
  // as the runner scrolls.
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

  /* The window is planned in whole phone groups: leading rule, name row and value row. The fleet is
   * measured rather than the filtered result so a filter drag is a cache hit, and the array stays
   * stable until either the dataset or the metadata-producing column set changes. */
  let entriesData: ShoesFile | null = null;
  let entriesColumns = '';
  let entriesCache: PhoneHeightEntry[] = [];
  const fleetEntries = $derived.by(() => {
    const columns = view.columns.join('\0');
    if (data !== entriesData || columns !== entriesColumns) {
      entriesData = data;
      entriesColumns = columns;
      entriesCache = data.shoes.map((s) => ({
        name: s.name,
        discontinued: !!s.discontinued,
        metadata: metaOf(s).map((m) => m.text),
      }));
    }
    return entriesCache;
  });

  let body = $state<HTMLElement | null>(null);
  let liveTable = $state<HTMLTableElement | null>(null);
  let prototype = $state<HTMLElement | null>(null);
  const phoneEnvironment: RowHeightEnvironment = {
    layoutKey: () => {
      const width = liveTable?.getBoundingClientRect().width ?? 0;
      return width > 0 ? `${width}:${span}` : null;
    },
    faceElement: () => prototype?.querySelector('.face-ruler') ?? null,
  };
  let facesEpoch = $state(0);
  const groupHeights = createRowHeights(
    () => facesEpoch++, measurePhoneGroupHeights, phoneEnvironment);
  onDestroy(() => groupHeights.destroy());

  // Hold the last good answer across a resize frame where the new DOM has not become measurable
  // yet. Dropping it would alternate between a window and the whole fleet during the gesture.
  let measured = $state<number[] | null>(null);
  $effect(() => {
    void fleetEntries;
    void span;
    void facesEpoch;
    let live = true;
    void tick().then(() => {
      if (!live) return;
      const next = groupHeights.heights(fleetEntries);
      if (next) measured = next;
    });
    return () => { live = false; };
  });

  const heightBySlug = $derived.by(() => {
    const out = new Map<string, number>();
    if (measured) data.shoes.forEach((s, i) => out.set(s.slug, measured![i] ?? 0));
    return out;
  });

  // Panels are live, potentially very tall boxes. Open groups are always kept, so their observed
  // height can be added exactly and can never be folded into a spacer.
  let panelPx = $state<Record<string, number>>({});
  $effect(() => {
    const openSlugs = [...open];
    if (!body || !openSlugs.length) return;
    const ro = new ResizeObserver((entries) => {
      let next: Record<string, number> | null = null;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const slug = el.dataset['slug'];
        const px = el.getBoundingClientRect().height;
        if (!slug || panelPx[slug] === px) continue;
        next ??= { ...panelPx };
        next[slug] = px;
      }
      if (next) panelPx = next;
    });
    for (const el of body.querySelectorAll<HTMLElement>('tr.expand[data-slug]')) ro.observe(el);
    return () => ro.disconnect();
  });

  /** The pinned header is content-sized, so its own face/label changes move the body offset. */
  let headHeight = $state(0);
  let scrollTopPx = $state(0);
  let viewportPx = $state(0);
  function readWindow(): void {
    const rect = body?.getBoundingClientRect();
    if (!rect) return;
    scrollTopPx = -rect.top;
    viewportPx = window.innerHeight;
  }
  $effect(() => {
    void headHeight;
    readWindow();
    const onMove = () => readWindow();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
    };
  });

  let focusedSlug = $state<string | null>(null);
  let pinnedSlug = $state<string | null>(null);
  const kept = $derived.by(() => {
    const out = new Set<string>(open);
    if (focusedSlug) out.add(focusedSlug);
    if (pinnedSlug) out.add(pinnedSlug);
    return out;
  });
  const items = $derived.by<VirtualItem[]>(() => shoes.map((s) => ({
    key: s.slug,
    height: (heightBySlug.get(s.slug) ?? 0) + (open.has(s.slug) ? (panelPx[s.slug] ?? 0) : 0),
  })));
  function planFor(list: VirtualItem[], window: {
    scrollTopPx: number; viewportPx: number; overscanPx: number; kept: ReadonlySet<string>;
  }): VirtualEntry[] {
    return virtualPlan(list, window.scrollTopPx, window.viewportPx, window.overscanPx, window.kept);
  }
  const plan = $derived(planFor(items, {
    scrollTopPx,
    viewportPx: measured === null ? 0 : viewportPx,
    overscanPx: PHONE_OVERSCAN_PX,
    kept,
  }));

  // Rules are visual separators, not rows in the accessibility model. Each closed shoe contributes
  // two semantic rows; an open detail panel contributes a third.
  const planned = $derived.by(() => {
    const rowIndex: number[] = [];
    let n = 2;
    for (const s of shoes) {
      rowIndex.push(n);
      n += 2 + (open.has(s.slug) ? 1 : 0);
    }
    const entries = plan.map((entry, i) => {
      if (entry.kind === 'item') {
        return { key: `s:${shoes[entry.index]!.slug}`, entry, rowIndex: rowIndex[entry.index]! };
      }
      const next = plan[i + 1];
      return { key: `g:${next?.kind === 'item' ? next.index : items.length}`, entry, rowIndex: 0 };
    });
    return { entries, rowCount: n - 1 };
  });

  async function toggle(slug: string, row: HTMLElement | null) {
    const opening = !open.has(slug);
    ontoggle(slug);
    if (!opening) return;
    // The panel opens below the shoe, so a shoe near the fold opens off screen. Awaited so the
    // panel exists to be measured.
    await tick();
    reveal(row);
  }

  /**
   * The same landing a tap gets, for a row this component did not open. Back and Forward are the
   * only other way one opens, and `Page.svelte` owns which row that is
   * (docs/app.md §View and URL ownership) — it holds a position in the list it handed over and no
   * element, so the row is looked up here rather than passed in.
   *
   * **A fleet position rather than a slug**, because the row may be outside the DOM until this
   * component pins its group in the plan.
   */
  export async function revealRow(index: number): Promise<void> {
    pinnedSlug = shoes[index]?.slug ?? null;
    if (!pinnedSlug) return;
    await tick();
    reveal(body?.querySelector<HTMLElement>(
      `tr.shoe[data-slug="${CSS.escape(pinnedSlug)}"]`) ?? null);
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
    <!-- Permanent, styled source rows for measurement. It is outside the plan and the accessibility
         tree, so neither an empty window nor the current mix of metadata/discontinued shoes can
         remove a shape the height measurement needs. -->
    <div class="mobile-proto" bind:this={prototype} aria-hidden="true">
      <!-- Both faces can move a group: prose wraps the ident row and the mono face sets the values
           row. WebKit emits no `loadingdone`, so the observer must see either one settle. -->
      <span class="face-ruler"><span>MMMMMMMMMMMMMMMM</span><span
        class="face-figures">0000000000000000</span></span>
      <table class="proto" aria-hidden="true">
        <tbody>
          <tr class="rule"><td colspan={span}></td></tr>
          <tr class="shoe">
            <td class="ident" colspan={span}>
              <span class="chev" aria-hidden="true">›</span>
              <strong>M</strong><span class="meta">M</span><DiscontinuedTag />
            </td>
          </tr>
          <tr class="values">
            {#each cols as col (col)}<td><span class="chip">0</span></td>{/each}
          </tr>
        </tbody>
      </table>
    </div>

    <table bind:this={liveTable} data-testid="shoe-table-mobile" aria-rowcount={planned.rowCount}>
    <thead bind:clientHeight={headHeight}>
      <tr aria-rowindex="1">
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
    <tbody bind:this={body}
           onfocusin={(e) => {
             const row = (e.target as HTMLElement | null)?.closest?.('tr.shoe');
             if (row) focusedSlug = (row as HTMLElement).dataset['slug'] ?? null;
           }}
           onfocusout={(e) => {
             if (!body?.contains(e.relatedTarget as Node | null)) focusedSlug = null;
           }}>
      {#each planned.entries as p (p.key)}
        {#if p.entry.kind === 'gap'}
          <tr class="spacer" aria-hidden="true"><td colspan={span}
            style:height="{p.entry.px}px"></td></tr>
        {:else}
          {@const s = shoes[p.entry.index]!}
          <!-- The leading rule is part of this shoe's measured group, including when a spacer
               precedes it. It is decorative and therefore does not consume an ARIA row index. -->
          {#if p.entry.index > 0}<tr class="rule" aria-hidden="true"><td colspan={span}></td></tr>{/if}
          <tr class="shoe" tabindex="0" data-slug={s.slug} aria-rowindex={p.rowIndex}
              aria-expanded={open.has(s.slug)}
              aria-controls={open.has(s.slug) ? `detail-${s.slug}` : undefined}
              onclick={(e) => void toggle(s.slug, e.currentTarget)} onkeydown={(e) => onRowKey(e, s.slug)}>
            <td class="ident" colspan={span}>
              <span class="chev" class:open={open.has(s.slug)} aria-hidden="true">›</span>
              <strong>{s.name}</strong>
              {#each metaOf(s) as m (m.key)}<span class="meta">{m.text}</span>{/each}
              {#if s.discontinued}<DiscontinuedTag />{/if}
            </td>
          </tr>
          <tr class="values" aria-rowindex={p.rowIndex + 1}>
            {#each cols as col (col)}
              {@const percentile = percentiles.get(col)?.get(s.slug)}
              {@const blue = washOf(col) === 'blue'}
              <td>
                <span class="chip {percentile === undefined ? '' : washCellClass(blue, percentile, paint)}"
                      class:tinted={percentile !== undefined}
                      class:blue={blue} class:grey={washOf(col) === 'grey'}>{cellText(s, col)}</span>
              </td>
            {/each}
          </tr>
          {#if open.has(s.slug)}
            <tr class="expand" id="detail-{s.slug}" data-slug={s.slug}
                aria-rowindex={p.rowIndex + 2}><td colspan={span}><DetailPanel shoe={s} {data} columns={view.columns} {stability} /></td></tr>
          {/if}
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
  .panel { position: relative; background: var(--surface); box-sizing: border-box;
           min-width: calc(var(--table-w) + 2px);
           border: 1px solid var(--border); border-top: none;
           border-radius: 0 0 var(--r-md) var(--r-md);
           box-shadow: var(--shadow-panel); overflow-x: visible; overflow-y: clip; }
  /* A real styled table, but permanently out of flow and out of sight. The measuring function
     clones these rows, so it inherits this component's scoped selectors instead of restating them. */
  .mobile-proto { position: absolute; inset: 0 auto auto 0; width: 100%;
                  visibility: hidden; pointer-events: none; }
  .mobile-proto .face-ruler { position: absolute; display: inline-flex; width: max-content;
                              font-size: var(--t-sm); font-weight: 600; white-space: nowrap; }
  .mobile-proto .face-figures { font-family: var(--font-mono); font-weight: 400; }
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
  tbody { overflow-anchor: none; }
  tr.spacer td { padding: 0; border: 0; }
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
