<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { displayNumber, indexTests, numericValue } from '../lib/dataset';
  import { washOf } from '../lib/direction';
  import { DEFAULT_PAINT, washCellClass, type WashPaint } from '../lib/wash';
  import { categoricalValue, PLATE_LABELS } from '../lib/categorical';
  import { displayReleaseDate } from '../lib/release-date';
  import { columnWidths, fitModel } from '../lib/fit';
  import { columnLabel } from '../lib/labels';
  import { createRowHeights, type NameEntry } from '../lib/row-height';
  import type { ScoreColumns } from '../lib/score';
  import { nextSort } from '../lib/sort';
  import { percentileMap, rankMap } from '../lib/stats';
  import { headerUnits, isFigure } from '../lib/units';
  import type { ViewState } from '../lib/view';
  import { OVERSCAN_PX, virtualPlan, type VirtualEntry, type VirtualItem } from '../lib/virtual';
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

  /**
   * The track the columns are shared out over, read off the PANEL rather than computed from the
   * window. `fit.ts` answers what the panel has to be *given* — a question about the whole page,
   * gutters and sidebar included, and one it must answer before anything is mounted — while this is
   * the box the table was actually handed, and only the box knows. The two must not be confused:
   * the widths declared below have to sum to what `width: 100%` resolves to, or fixed layout
   * redistributes the difference and the rule that shared them stops being the one on screen.
   *
   * `.tblwrap` is a block in a `minmax(0, 1fr)` grid track (`Page.svelte`), so its width is the
   * page's decision and never the table's — no feedback loop, whatever the columns do.
   *
   * Zero until the first measurement, and under jsdom for ever. `columnWidths` reads that as no
   * slack and hands every column its own minimum, which is the honest answer wherever the app
   * cannot measure — the same fallback `fit.ts` already takes
   * (docs/app.md §Two renderings, and only one of them mounted).
   */
  let trackPx = $state(0);
  /** Its own `$derived`, not an argument built in place: it depends on the dataset alone, which
   *  changes once, where the line below re-runs on every frame of a window drag. `fitModel` hands
   *  back the ONE model per dataset, so this is the same object `Page.svelte` decides the rendering
   *  with rather than a second copy of the same arithmetic over the same fleet. */
  const fit = $derived(fitModel(data));
  const widths = $derived(columnWidths(view.columns, trackPx, fit));

  /* ---------------------------------------------------------------------------------------------
   * The window: what is on screen, plus what the runner has claimed.
   * docs/app.md §Table presentation owns the design; `lib/virtual.ts` owns the plan and
   * `lib/row-height.ts` owns the heights. This is the seam between the three and the DOM.
   * ------------------------------------------------------------------------------------------- */

  /** The `<tbody>`, which is both what the plan fills and the box every offset below is read off. */
  let body = $state<HTMLElement | null>(null);

  /**
   * The whole fleet's names, and **one array for the life of the dataset**.
   *
   * `RowHeights.heights` compares `names` by IDENTITY, so a caller that rebuilds the array per
   * render misses the cache every time and pays the whole 455-name measurement per keystroke — the
   * exact cost the cache exists to remove (`lib/row-height.ts`). `data` is a prop that changes once,
   * where `shoes` is a new array on every frame of a drag, so the fleet is what is measured and the
   * filtered list is what is looked up out of it.
   */
  const fleetNames = $derived<NameEntry[]>(
    data.shoes.map((s) => ({ name: s.name, discontinued: !!s.discontinued })));

  /** A face settling invalidates every height without moving any width, so it cannot be a key. */
  let facesEpoch = $state(0);
  const rowHeights = createRowHeights(() => facesEpoch++);
  onDestroy(() => rowHeights.destroy());

  /**
   * The measured row heights, **held rather than dropped when the measurement declines**.
   *
   * `null` means *cannot measure*, and the caller's honest answer to it is to render everything —
   * which is what happens before the first successful measurement and under jsdom for ever. But
   * after one has succeeded, falling back to the whole fleet on a later `null` is an oscillation
   * rather than a fallback: a resize drag keys on the declared width and so misses the cache on
   * every frame, and a body that alternated between a windowful and 455 rows would re-render the
   * fleet every other frame for the length of the gesture. Holding the last measurement is stale by
   * at most the width that has just moved, and the next frame that can measure replaces it.
   */
  let measured = $state<number[] | null>(null);
  $effect(() => {
    // Named dependencies rather than incidental ones: the declared widths, and a face settling.
    void widths;
    void facesEpoch;
    let live = true;
    // **Awaited, and that is the whole of what makes the measurement current.** The cache keys on
    // the width read back off the DOM rather than on the one in hand, because a measurement lays
    // names out inside the live cell and what it is filed under has to be what that cell was
    // actually laid out at (`lib/row-height.ts`). But an effect can run with the model already moved
    // and the `<colgroup>` not yet rewritten: measured on arrival, the model said 372.76px while the
    // `<col>` still said 240px, so every name was laid out 133px narrow, the answer was filed under
    // `240px` — correctly — and nothing asked again, because the model's width never moved after
    // that. That is a table 3,000px taller than the shoes in it, in every engine, healed only where
    // an unrelated `loadingdone` happened to fire afterwards (`.hunt/task6/probe8-when.ts`). `tick`
    // puts this after the DOM has caught up, so the two widths are one width.
    void tick().then(() => {
      if (!live) return;
      const next = rowHeights.heights(fleetNames);
      if (next) measured = next;
    });
    return () => { live = false; };
  });

  /** Keyed by slug, because the measurement is over the FLEET and the plan is over what is shown. */
  const heightBySlug = $derived.by(() => {
    const out = new Map<string, number>();
    if (measured) data.shoes.forEach((s, i) => out.set(s.slug, measured![i] ?? 0));
    return out;
  });

  /**
   * What an open shoe's panel is actually rendering at, read off the DOM because nothing models it.
   *
   * A shoe is one item, and an open one is a row PLUS a panel — 843–1005px of it. Left out of the
   * item's height every row below an open one would sit that far from where the plan believes it is,
   * and the window computed for a scroll position past it would select rows that are nowhere near
   * the screen: a blank body rather than a subtle error. It never reaches a spacer, because an open
   * shoe is always rendered and a spacer stands only for shoes that are not — so this is measured
   * rather than estimated, and it is measured for exactly the rows that are on the page.
   *
   * **A closed shoe's entry is kept, and that is the one thing here that accumulates.** It is
   * bounded by the fleet and inert while it sits there — `items` reads this only under `open.has` —
   * and what keeping it buys is the frame after a reopen: the shoe is planned at the height it was
   * last measured at rather than as a bare row waiting for a `ResizeObserver` delivery.
   */
  let panelPx = $state<Record<string, number>>({});
  $effect(() => {
    // The open set is the dependency, spread rather than counted so that swapping one open shoe for
    // another re-observes rather than looking unchanged.
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

  /**
   * Where the viewport is **in the items' own space**, where 0 is the top of the first shoe.
   *
   * Not the page's `scrollY`, which counts the chrome, the receipt, the ordering note and the header
   * row as well. The body's own offset is exactly `-rect.top` — one subtraction, in one place, so
   * there is no second spelling of it anywhere in the component. A NEGATIVE value is the ordinary
   * desktop resting state, the table starting below the fold, and it is taken literally rather than
   * clamped: a wrong offset then shows up as a blank body rather than as rows quietly a screenful
   * out of place (`lib/virtual.ts`).
   */
  let scrollTopPx = $state(0);
  let viewportPx = $state(0);
  function readWindow(): void {
    const rect = body?.getBoundingClientRect();
    if (!rect) return;
    scrollTopPx = -rect.top;
    viewportPx = window.innerHeight;
  }
  $effect(() => {
    readWindow();
    const onMove = () => readWindow();
    // Passive: this only reads, and a non-passive scroll listener on the window blocks the
    // compositor for the length of the gesture.
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
    };
  });

  /**
   * The shoe the keyboard is on, kept in the plan wherever it is.
   *
   * Unmounting a focused row drops `activeElement` to `<body>`: no ring anywhere, and the next Tab
   * restarts from the top of the document past every filter. Moving focus to the nearest row still
   * on screen was rejected — it changes what Enter would expand without saying so
   * (docs/policies.md §Interaction chrome). Cleared only when focus leaves the body entirely, so the
   * hand-off from one row to the next never has a frame with neither in the plan.
   */
  let focusedSlug = $state<string | null>(null);
  /** The row a reveal has been asked for, pinned so the ask can land on a shoe outside the window. */
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

  /**
   * **The one place the plan's three adjacent numbers are matched to their meanings.**
   * `virtualPlan(items, scrollTop, viewportPx, overscanPx, kept)` takes three unlabelled `number`s
   * in a row, so a transposed viewport and overscan type-checks and passes every case in
   * `virtual.test.ts` — the window is symmetric about the viewport, so only a rendered table could
   * tell them apart. Named fields here make the mapping something read rather than counted.
   */
  function planFor(list: VirtualItem[], w: {
    scrollTopPx: number; viewportPx: number; overscanPx: number; kept: ReadonlySet<string>;
  }): VirtualEntry[] {
    return virtualPlan(list, w.scrollTopPx, w.viewportPx, w.overscanPx, w.kept);
  }

  const plan = $derived(planFor(items, {
    scrollTopPx,
    // **Cannot measure the rows is the same answer as cannot measure the viewport**, and
    // `virtualPlan` already owns it: a non-positive viewport renders every item with no spacers.
    // Stating it here rather than branching keeps one owner for "render everything"
    // (spec §Failure behaviour).
    viewportPx: measured === null ? 0 : viewportPx,
    overscanPx: OVERSCAN_PX,
    kept,
  }));

  /**
   * The plan with the two things the DOM needs and the plan does not carry: a key per entry, and
   * the real row numbers.
   *
   * **A spacer is keyed by the run it stands for, never by its position.** The plan gains and loses
   * spacers as kept shoes split them, so an array index is a gap in one frame and an item in the
   * next, and Svelte would reuse the wrong node. The stable identity is the index of the next item
   * entry — `items.length` for a trailing gap — and it is namespaced away from slugs, or a shoe
   * slugged `3` and the spacer above item 3 would be one key.
   *
   * **`aria-rowindex` counts the rows the table WOULD have**, panels included, which is the whole
   * point of it: the rendered rows are a window and their DOM positions say nothing about where in
   * the fleet they sit. `aria-rowcount` is the same arithmetic totalled, and the header row is 1.
   */
  const planned = $derived.by(() => {
    const rowIndex: number[] = [];
    let n = 2;
    for (const s of shoes) {
      rowIndex.push(n);
      n += open.has(s.slug) ? 2 : 1;
    }
    const out = plan.map((entry, i) => {
      if (entry.kind === 'item') {
        return { key: `s:${shoes[entry.index]!.slug}`, entry, rowIndex: rowIndex[entry.index]! };
      }
      // Two gaps never adjoin — `virtualPlan` emits one per run — so the next entry is the item the
      // run ends at, or nothing at all where the gap trails the fleet.
      const next = plan[i + 1];
      return { key: `g:${next?.kind === 'item' ? next.index : items.length}`, entry, rowIndex: 0 };
    });
    return { entries: out, rowCount: n - 1 };
  });

  // The wash ranks over the **whole filtered set** — `shoes`, never `plan` — like every other
  // column's, or its tint would mean something different from its neighbours' in the same row and
  // something different again at every scroll position (spec §Non-goals).
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

  /**
   * The same landing a click-expand gets, for a row this component did not open. Back and Forward
   * are the only other way one opens, and `Page.svelte` owns which row that is
   * (docs/app.md §View and URL ownership).
   *
   * **By fleet position, not by slug**, and the window is why. `Page.svelte` knows a row's position
   * in the list it handed over; this component knows whether that position is in the plan. Asked for
   * a slug it could only look for a row in the DOM, and a row outside the window is not in the DOM —
   * a `querySelector` that finds nothing scrolls nowhere and says nothing. Given the index it can
   * put the shoe in the plan first and then land on it. The pin outlives the call by design: the
   * revealed row is one row, and dropping it the moment the scroll finished would unmount the thing
   * that was just scrolled to.
   */
  export async function revealRow(index: number): Promise<void> {
    pinnedSlug = shoes[index]?.slug ?? null;
    if (!pinnedSlug) return;
    await tick();
    // By slug once the row is known to exist: `data-slug` is the row's own identity in the DOM,
    // where the index is the caller's vocabulary for the same shoe.
    reveal(body?.querySelector<HTMLElement>(`tr.shoe[data-slug="${CSS.escape(pinnedSlug)}"]`) ?? null);
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
<div class="tblwrap" style:--head-h="{headHeight}px" bind:clientWidth={trackPx}>
<table aria-rowcount={planned.rowCount}>
  <!-- The widths are DECLARED, and the model declares them. Under `table-layout: auto` every
       column was a function of the rows in the DOM, which is a property this table cannot keep:
       rendering a window of the fleet instead of all of it moves the name column by up to 72px
       (docs/specs/2026-08-03-virtualising-the-table.md §Decisions). One `<col>` per rendered
       column with the name column first, which is the order `columnWidths` returns and the order
       the header row emits. -->
  <colgroup>
    {#each widths as w, i (i)}<col style:width="{w}px" />{/each}
  </colgroup>
  <thead bind:clientHeight={headHeight}>
    <!-- Row 1 of `aria-rowcount`, and the reason the shoe rows start at 2. -->
    <tr aria-rowindex="1">
      <!-- A real sort control, not a label. `name` is a sort key the parser accepts, so a link
           carrying it reordered every row with no `aria-sort` anywhere in the table and nothing that
           could reverse it — the untrue-claim species rather than a nicety
           (docs/app.md §Columns and sorting). Same button, same caret, same contract as every
           figure header; the units line stays empty, because the reserve is what keeps every
           header's name on one baseline. -->
      <th class="name"
          aria-sort={view.sort.key === 'name' ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        <button type="button" onclick={() => setSort('name')}>
          <span class="h-name"><span class="h-line">{columnLabel('name', undefined)}<SortCaret
            dir={view.sort.key === 'name' ? view.sort.dir : null} /></span></span>
          <span class="h-units"></span>
        </button>
      </th>
      {#each view.columns as col (col)}
        {@const fig = isFigure(col, idx.bySlug.get(col))}
        <th class:fig
            aria-sort={view.sort.key === col ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
          <button type="button" onclick={() => setSort(col)}>
            <!-- The mark LEADS the name in a figure column and trails it in a phrase one, which is
                 the same rule stated from the column's own alignment: it goes at the end the text is
                 not aligned to, so the label keeps the edge its figures keep. `.h-line` reverses in
                 CSS rather than here — the mark is `aria-hidden` decoration with no text, so visual
                 order is the only order it has (docs/app.md §Table presentation). -->
            <span class="h-name"><span class="h-line">{columnLabel(col, idx.bySlug.get(col))}<SortCaret
              dir={view.sort.key === col ? view.sort.dir : null} /></span></span>
            <!-- Always rendered, empty or not: vertical is the axis we have spare, and a missing
                 second line would make the header rows different heights. -->
            <span class="h-units">{headerUnits(col, idx.bySlug.get(col))}</span>
          </button>
        </th>
      {/each}
    </tr>
  </thead>
  <!-- The body holds a PLAN, not one entry per shoe: the shoes on screen, the ones the runner has
       claimed, and spacer rows standing for everything left out
       (docs/specs/2026-08-03-virtualising-the-table.md).
       `data-slug` is how `revealRow` finds the row it has just put in the plan.
       The focus listeners are here rather than on the row so that the last row to hold focus stays
       in the plan wherever it has scrolled to: `focusout` fires before the next `focusin`, so
       clearing only on the way OUT OF THE BODY is what stops a hand-off from one row to the next
       having a frame with neither of them mounted. -->
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
        <!-- The spacer, standing for exactly the shoes it replaces and for nothing else.
             `aria-hidden`, because a row that stands for rows is not one: without it the
             accessibility argument for keeping a real table partly defeats itself, and the real
             positions are carried by `aria-rowindex` instead.
             The height goes on the CELL and the cell gives back everything a `td` is given: the
             `--s2` padding and the 1px bottom border below would stand every spacer 17px above the
             run it replaces — every spacer, not only a 0px one — which puts every scroll position
             under it wrong and drifts the scrollbar this design exists to keep honest. -->
        <tr class="spacer" aria-hidden="true"><td colspan={1 + view.columns.length}
          style:height="{p.entry.px}px"></td></tr>
      {:else}
        {@const s = shoes[p.entry.index]!}
        <!-- `aria-expanded` says the row controls something; `aria-controls` is the only thing that
             says what, and the panel is a sibling row rather than a child of the control. Emitted
             only while it is open: the panel exists only then, and an IDREF naming a node that is
             not in the document is an unresolvable reference rather than a promise of one. -->
        <tr class="shoe" tabindex="0" data-slug={s.slug} aria-rowindex={p.rowIndex}
            aria-expanded={open.has(s.slug)}
            aria-controls={open.has(s.slug) ? `detail-${s.slug}` : undefined}
            onclick={(e) => void toggle(s.slug, e.currentTarget)} onkeydown={(e) => onRowKey(e, s.slug)}>
          <!-- The flex lives on a wrapper, not on the cell: `display: flex` on a `td` takes it out
               of the table-cell box, so it stops stretching to the row and leaves a half-height
               block the numeric cells scroll through under the sticky column. -->
          <td class="name">
            <div class="name-row">
              <span class="chev" class:open={open.has(s.slug)} aria-hidden="true">›</span>
              <!-- No brand line: almost every name already begins with its brand, and the handful
                   that do not shorten it rather than drop it — asserted over the committed fleet in
                   `lib/filters.test.ts` (docs/app.md §Columns and sorting). -->
              <div><strong>{s.name}</strong>{#if s.discontinued}<DiscontinuedTag />{/if}</div>
            </div>
          </td>
          {#each view.columns as col (col)}
            {@const p2 = percentiles.get(col)?.get(s.slug)}
            {@const blue = washOf(col) === 'blue'}
            <!-- One class and no value at all: `lib/display.ts` declares what each bucket paints, so
                 a dragged grip never writes a custom property per cell (docs/app.md §Theming). -->
            <td class="num {p2 === undefined ? '' : washCellClass(blue, p2, paint)}"
                class:fig={isFigure(col, idx.bySlug.get(col))}
                class:tinted={p2 !== undefined}
                class:blue={blue} class:grey={washOf(col) === 'grey'}>{cellText(s, col)}</td>
          {/each}
        </tr>
        {#if open.has(s.slug)}
          <!-- `data-slug` here as well as on the row: the panel's own height is part of what the
               shoe occupies, and it is read off this node rather than modelled. -->
          <tr class="expand" id="detail-{s.slug}" data-slug={s.slug} aria-rowindex={p.rowIndex + 1}><td colspan={1 + view.columns.length}><DetailPanel shoe={s} {data} columns={view.columns} {stability} /></td></tr>
        {/if}
      {/if}
    {/each}
  </tbody>
</table>
<!-- **The prototype the measurement is taken off, and the whole reason it is here is that the plan
     can never take it away.** `measureDesktopRowHeights` clones a row for its replica and copies a
     `DiscontinuedTag`'s markup, and both used to come from whichever shoe happened to be in the DOM
     — which under a window is a fact about the scroll position: the window can hold no discontinued
     shoe, and past either end of the fleet it holds no shoe at all. Each of those made the
     measurement decline, the caller render everything, the prototype reappear and the measurement
     succeed, which is a loop rather than a fallback (`lib/row-height.ts`).
     One row, a cell per rendered column so the row's floor is the one the table really draws — the
     figure cells are set in the mono face and a taller line box there is what sets a row — and the
     same `<colgroup>` and width as the table beside it, so nothing about it is a second model of
     the first. Out of flow and off to the left, which is not scrollable in either direction;
     `visibility: hidden` keeps it laid out, which is the whole point, while taking it out of the
     accessibility tree and out of the tab order. -->
<table class="proto" aria-hidden="true" style:width="{trackPx}px">
  <colgroup>
    {#each widths as w, i (i)}<col style:width="{w}px" />{/each}
  </colgroup>
  <tbody>
    <tr>
      <td class="name">
        <div class="name-row">
          <span class="chev" aria-hidden="true">›</span>
          <div><strong>M</strong><DiscontinuedTag /></div>
        </div>
      </td>
      {#each view.columns as col (col)}
        <td class="num" class:fig={isFigure(col, idx.bySlug.get(col))}>0</td>
      {/each}
    </tr>
  </tbody>
</table>
</div>

<style>
  /* Separate rather than collapsed: a collapsed border belongs to the table, not the cell, so it
     does not travel with a sticky header and vanishes the moment the head detaches.
     `fixed`, so the `<colgroup>` above is the whole of the answer and no cell can widen a column.
     Its price is stated here because it is easy to walk into: a declared column width BEATS every
     `min-width` on the cells in it — a `<col>` asking 60px renders 60px in all three engines, the
     floor ignored — so the name column's `14rem` moved into `fit.ts`, which is the only place left
     that can honour it (`NAME_COL_PX`). The `<col>` width is the cell's BORDER box, padding
     included, which is measured in all three engines and is what makes `columnPx`'s own
     padding-inclusive number the right thing to declare. */
  table { table-layout: fixed; border-collapse: separate; border-spacing: 0; width: 100%;
          font-size: var(--t-md); }
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
  /* The name's own box, and the reason there are two: `.h-name` is the 2lh RESERVE and bottom-aligns
     what is in it, so centring the mark against THAT box would centre it against the reserve —
     which for a one-line name in a two-line box lands the mark a whole line above the text it marks.
     `.h-line` hugs the text instead, so `align-items: center` here means centred on the name, at one
     line or three.
     A FLEX box and not a block with the mark in the text's own flow, which was tried: the mark is an
     atomic inline, UAX #14 gives a break opportunity either side of one, and at min-content all
     three engines took it — `Price` laid out on two lines with the mark alone on the first, in a
     header that is pinned and therefore paid by every screenful. A U+2060 word joiner beside it did
     not prohibit that break in any engine. Flex items cannot break apart at all, which also keeps
     `fit.ts`'s arithmetic additive: a header's minimum is its longest word PLUS the mark. The price
     is that a WRAPPED name's box fills the cell, so the mark stands off the right-aligned ink by
     whatever slack is left — about 25px at 1440px, and nothing at the widths where the name fits one
     line (docs/app.md §Table presentation). */
  .h-line { display: flex; align-items: center; }
  /* `1lh`, not `1em`: the reserve has to be the LINE BOX a unit string would occupy, and at
     `--t-xs` JetBrains Mono renders a 16px line box against a 12px em. A 12px reserve leaves the
     columns that carry no unit — `Released` and `Plate` are both in the default set — 4px short, so
     their names sit 2px below every other column's and the common baseline the reserve above exists
     to produce is not one. */
  .h-units { font-family: var(--font-mono); font-size: var(--t-xs); font-weight: 400; color: var(--text-dim); min-height: 1lh; }
  th.fig, td.fig { text-align: right; }
  th.fig button { align-items: flex-end; }
  /* The mark LEADS the name here, which is the whole of what a figure column does differently.
     `row-reverse` and not a reordered template: main-start becomes the right edge, so the name — the
     first child — keeps that edge and the mark falls to its left, which is exactly the pair of facts
     this column needs. The unit line then reserves NOTHING, because nothing sits at the end either
     line is aligned to, and both run flush to the edge the figures keep
     (docs/app.md §Table presentation). */
  th.fig .h-line { flex-direction: row-reverse; }
  /* And the air inside the mark's box follows it to that end. The box is `--caret-w` against a 9px
     glyph, and `SortCaret` packs the glyph to the box's END — which puts the 3px of slack between
     glyph and name where the mark TRAILS, and on the far side where it leads, so a figure column's
     mark touched its first letter while a phrase column's stood 3px off. Reversing the packing with
     the direction keeps the slack on the name's side in both, which is the only place it reads as
     air rather than as a gap in the header (docs/app.md §Table presentation).
     Written here beside the rule it belongs to rather than in `SortCaret`: which end the mark takes
     is this table's decision, and the air is the same decision seen from inside the box. */
  th.fig .h-line :global(.caret) { justify-content: flex-start; }
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
  /* **A spacer is its height and nothing else.** Every `td` above takes `--s2` of padding and a 1px
     bottom border, so a spacer that inherited them would stand 17px taller than the run of shoes it
     replaces — on EVERY spacer, not only a 0px one — and every scroll position below it would be
     that much out, per spacer, which is exactly the scrollbar drift measured heights were chosen to
     avoid (docs/app.md §Table presentation). */
  tr.spacer td { padding: 0; border: 0; }
  /* **Scroll anchoring off, over the rows.** Both engines pick an anchor node and hold it still when
     content is added or removed above the viewport — which is what a windowed body does on every
     scroll frame, so the engine would fight the plan for the scroll position all the way down the
     table. Declared on the `tbody`, which is the subtree that changes; anchoring elsewhere on the
     page is left alone, and WebKit implements none of it either way. */
  tbody { overflow-anchor: none; }
  /* The measurement's prototype row (see the markup). Out of flow so it costs the table no height,
     and to the LEFT because content overflowing the inline start is not scrollable — the same trick
     `row-height.ts`'s own replica uses, and the reason neither shows up in `scrollWidth`.
     `visibility: hidden` rather than `display: none`: the row has to be LAID OUT, because what is
     measured off it is geometry — a `display: none` prototype reports a chevron 5px wide as 0 and
     lays every name out against a container of nothing. It is out of the accessibility tree and out
     of the tab order for the same declaration, with `aria-hidden` stating it as well. */
  table.proto { position: absolute; top: 0; left: -10000px; visibility: hidden;
                pointer-events: none; }
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
     cells scroll underneath it rather than behind the row.
     No `min-width` here any more, and its absence is not an oversight: under the declared widths
     above a cell's own floor is inert in every engine, so `14rem` would have read as a guarantee
     nothing honours. `fit.ts`'s `NAME_COL_PX` is the one home for that floor now, and it reaches
     the column through the `<col>` like every other width. */
  td.name { background: var(--surface); }
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
  /* No cell rule here: the wash is one class per cell, declared in the generated bucket stylesheet
     (`lib/display.ts`) because both renderings share the grammar and a scoped selector would reach
     only this one (docs/app.md §Theming). */
  @media (prefers-reduced-motion: no-preference) {
    .chev { transition: transform 120ms ease-out; }
    tr.expand td { animation: reveal 140ms ease-out; }
  }
  /* Outside the query, like the phone rendering's: the turned chevron is STATE, not motion, so it
     must be drawn under `reduce` as well — only the transition into it is a preference. */
  .chev.open { transform: rotate(90deg); }
  @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
</style>
