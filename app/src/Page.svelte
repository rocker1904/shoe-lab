<script lang="ts" module>
  /**
   * Long enough that a drag or a typed word is one write, short enough that a runner who copies
   * the address bar straight after a click gets what is on screen
   * (docs/app.md §View and URL ownership).
   */
  export const VIEW_WRITE_MS = 200;
</script>

<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import type { ShoesFile } from '../../shared/types.js';
  import ColumnPicker from './components/ColumnPicker.svelte';
  import FilterSidebar from './components/FilterSidebar.svelte';
  import Header from './components/Header.svelte';
  import Receipt from './components/Receipt.svelte';
  import SetupStrip from './components/SetupStrip.svelte';
  import ShoeTable from './components/ShoeTable.svelte';
  import ShoeTableMobile from './components/ShoeTableMobile.svelte';
  import SkipLink from './components/SkipLink.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import { TABLE_ANCHOR_ID } from './lib/anchor';
  import { exportCsv } from './lib/csv-export';
  import { indexTests } from './lib/dataset';
  import { debounce } from './lib/debounce';
  import { applyFilters, EMPTY_FILTERS } from './lib/filters';
  import type { Side } from './lib/lineage';
  import { readStoredView, writeStoredView } from './lib/persist';
  import { applyPreset, PRESETS } from './lib/presets';
  import { projectSide, sideOf } from './lib/side';
  import { sortShoes } from './lib/sort';
  import { currentTheme, cycleTheme, type Theme } from './lib/theme';
  import { DEFAULT_SIDE, defaultColumns, defaultView, parseView, sameValue, serializeView, type ViewState } from './lib/urlstate';

  let { data }: { data: ShoesFile } = $props();

  const idx = $derived(indexTests(data.tests));
  // Parsed once; from here the view is the source of truth and the URL is write-only
  // (docs/app.md §View and URL ownership). A shared link always beats a previous session, so the
  // query string wins outright and storage is only consulted when there is none.
  const initial = untrack(() => {
    const qs = location.search.replace(/^\?/, '');
    const stored = qs ? null : readStoredView();
    return { view: parseView(qs || stored || '', indexTests(data.tests)), restored: stored !== null,
             bare: !qs && stored === null };
  });
  let view = $state<ViewState>(initial.view);
  let showFilters = $state(false);
  /**
   * Ephemeral, never serialised and never persisted: the strip asks both questions on a genuine
   * first arrival — no query string and no stored view — and hands over to the toolbar for good
   * once a story is picked. A *stored* dismissal flag is what docs/app.md §Presets rules out; the
   * property it protects, that a bare link opens expanded and a filtered link collapsed, is this.
   */
  let stripOpen = $state(initial.bare);
  /** A JS transition cannot be wrapped in an `@media` block, so the query is asked here instead.
   *  jsdom implements no `matchMedia` beyond the suite's stub, hence the optional call. */
  const collapseMs = untrack(() =>
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) ? 0 : 200);
  /**
   * Measured, never assumed: the header wraps to two lines below 800px and the toolbar to two
   * below 880px, so the pinned `thead` and the sticky sidebar both sit under a box whose height
   * is a function of the viewport. A hard-coded offset put the table's header row *behind* the
   * chrome on every width where the chrome grew (docs/app.md §Columns and sorting).
   */
  let chromeHeight = $state(0);

  /**
   * Which table renders is a query the script asks, not a `@media` rule, because **only one may be
   * in the DOM at a time**: a `display: none` table is still queryable, and two tables' headers
   * would be two answers to "what are the columns?" for assistive tech and for the suite alike
   * (docs/app.md §Columns and sorting). Read once at init so the first paint is already right,
   * then kept live for a rotation or a resized window.
   */
  const PHONE_QUERY = '(max-width: 699px)';
  let phone = $state(untrack(() => window.matchMedia?.(PHONE_QUERY).matches ?? false));
  $effect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY);
    if (!mq) return;
    const sync = () => (phone = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  /**
   * The sidebar is a drawer only below 800px; above it, it is simply part of the page. One left
   * open across a resize would carry its focus trap into a layout where nothing is modal, so the
   * width at which it stops being a drawer is the width that closes it.
   */
  $effect(() => {
    const mq = window.matchMedia?.('(max-width: 800px)');
    if (!mq) return;
    const sync = () => { if (!mq.matches) showFilters = false; };
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  let drawerEl = $state<HTMLElement>();
  /** Everything inside the drawer that can hold focus, in document order. */
  const drawerStops = (): HTMLElement[] =>
    [...(drawerEl?.querySelectorAll<HTMLElement>('input, button, select, a[href]') ?? [])]
      .filter((el) => !el.hasAttribute('disabled'));

  async function openFilters() {
    showFilters = true;
    // Awaited: until the class lands the drawer is still translated off-canvas and
    // `visibility: hidden`, and a hidden element cannot take focus.
    await tick();
    drawerStops()[0]?.focus();
  }
  function closeFilters() {
    showFilters = false;
    // The control that owns the drawer declares itself with `aria-controls`, so it can be found by
    // that contract rather than by threading a binding back up through the toolbar.
    document.querySelector<HTMLElement>('[aria-controls="filter-sidebar"]')?.focus();
  }
  function onDrawerKey(e: KeyboardEvent) {
    if (!showFilters) return;
    if (e.key === 'Escape') { closeFilters(); return; }
    if (e.key !== 'Tab') return;
    // An open drawer covers the page it sits over, so without a trap Tab walks straight out into
    // controls the runner cannot see (docs/app.md §Filters).
    const stops = drawerStops();
    const first = stops[0];
    const last = stops.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const filtered = $derived(applyFilters(data.shoes, view.filters, idx));
  const visibleSorted = $derived(sortShoes(filtered.visible, view.sort, idx));
  const snapshot = $derived($state.snapshot(view) as ViewState);
  const sideMark = $derived(sideOf(snapshot));
  /** Somewhere to stand when the view names no side: the stories each bind one half, so applying
   *  one has to pick, and the baseline's own half is the least surprising pick. */
  const workingSide = $derived(sideMark ?? DEFAULT_SIDE);

  /**
   * What `All` produces — and, because the mark is `sameValue(v, allView(v))`, also what lights it.
   * One function rather than an action and a matching predicate, so "marked means pressing it
   * changes nothing" is true by construction and cannot drift (docs/app.md §Presets).
   *
   * `All` speaks for the story group and means "all paces". With a side to work from it restores
   * that side's plain table; with none — a deliberately mixed view — it clears the filters and
   * leaves the table's shape alone, because there is no defensible column set to impose and a row
   * the runner added is not a filter.
   */
  function allView(v: ViewState, side: Side | null): ViewState {
    if (side !== null) return { ...defaultView(), columns: defaultColumns(side) };
    const next = structuredClone(v) as ViewState;
    next.filters = { ...EMPTY_FILTERS, ranges: {} };
    return next;
  }

  const atAll = $derived(sameValue(snapshot, allView(snapshot, sideMark)));
  /**
   * Derived, never stored: a story reads as selected while the view equals what `applyPreset`
   * would build for it *now*. A stored `preset` field would keep claiming Easy after the runner
   * had filtered it into something else (docs/app.md §Presets).
   */
  const storyMark = $derived(
    sideMark === null ? null
    : PRESETS.find((p) => sameValue(snapshot, applyPreset(p.id, data.shoes, idx, sideMark)))?.id ?? null);
  const selected = $derived(atAll ? 'all' : storyMark);
  // `All` is a peer of the stories in the bar, so it needs a count in the same map. Three preset
  // applications over a dataset already in memory.
  const presetCounts = $derived(new Map<string, number>([
    ['all', data.shoes.length],
    ...PRESETS.map((p) => [p.id,
      applyFilters(data.shoes, applyPreset(p.id, data.shoes, idx, workingSide).filters, idx).visible.length] as const),
  ]));

  /**
   * Still the one write path, now asynchronous. A drag fires about sixty view updates a second, so
   * writing on each would make a two-second gesture 120 `replaceState` calls — past Safari's
   * throttle inside a single drag — plus 120 synchronous storage writes. The state assignment in
   * `setView` stays immediate, so the table filters live (docs/app.md §View and URL ownership).
   */
  const writeView = debounce((qs: string) => {
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    writeStoredView(qs);
  }, VIEW_WRITE_MS);
  // A page being torn down cannot wait out a timer, and `pagehide` is the last event a bfcache
  // navigation reliably delivers.
  const flushView = () => writeView.flush();
  window.addEventListener('pagehide', flushView);
  onDestroy(() => {
    window.removeEventListener('pagehide', flushView);
    flushView();
  });

  function setView(v: ViewState) {
    view = v;
    writeView(serializeView(v));
  }
  // A view restored from storage has to reach the URL, or a returning visitor sees a filtered
  // table behind a bare URL and copying the link shares the default view instead. Routed through
  // the one existing write path rather than adding a second URL write site, then flushed: this is
  // a one-off at init, not part of a burst, and a bare URL for 200ms is a link worth copying.
  if (initial.restored) { setView(initial.view); flushView(); }

  /**
   * A side click makes the view about that side (docs/app.md §Presets). A view that is a story is
   * rebuilt as that story on the new side, so its bounds re-resolve at the new side's percentiles;
   * anything else is projected, which moves the columns and sort and drops the other half's bounds.
   */
  function onSide(next: Side) {
    if (next === sideMark) return;   // already there: a no-op click must not rebuild the view
    setView(storyMark ? applyPreset(storyMark, data.shoes, idx, next) : projectSide(snapshot, next));
  }
  function onStory(id: string) {
    // The strip's own question, answered — the toolbar carries the counts from here, and the only
    // thing the cards held exclusively was the descriptions, which are a first-encounter need.
    stripOpen = false;
    setView(id === 'all' ? allView(snapshot, sideMark) : applyPreset(id, data.shoes, idx, workingSide));
  }
  function onShowMissing() {
    const next = structuredClone($state.snapshot(view)) as ViewState;
    next.filters.showMissing = next.filters.showMissing ? undefined : true;
    setView(next);
  }
  function onExport() {
    const blob = new Blob([exportCsv(visibleSorted, view.columns, idx)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shoe-lab-export.csv';
    a.click();
    // Revoking in the same tick can cancel the download before the browser has taken its own
    // reference to the blob; yielding once is enough.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  // Reads back what main.ts already put on the DOM at boot (docs/app.md §Theming).
  let theme = $state<Theme>(currentTheme());
  function onTheme() {
    theme = cycleTheme();
  }
</script>

<!-- First in the document, because a skip link that is not the first tab stop skips nothing: it is
     49 stops from here to the first table row (docs/app.md §Columns and sorting). -->
<SkipLink />

<!-- Header and toolbar pin together, because every control that changes the view has to stay
     reachable from anywhere in a 25,000px table; the receipt below reports rather than controls,
     so it scrolls (docs/app.md §Columns and sorting). -->
<div class="chrome" bind:clientHeight={chromeHeight}>
  <Header total={data.shoes.length} visible={visibleSorted.length} builtAt={data.builtAt} {theme}
          onexport={onExport} ontheme={onTheme} />
  <!-- The strip asks both questions in words while it is up, so the bar carries only its own
       actions until it has been handed them (docs/app.md §Presets). -->
  <Toolbar side={sideMark} onside={onSide} {selected}
           counts={presetCounts} onstory={onStory} {showFilters} showGroups={!stripOpen}
           onfilters={() => (showFilters ? closeFilters() : void openFilters())}>
    {#snippet columns()}
      <ColumnPicker tests={data.tests} groups={data.groups} columns={view.columns}
                    population={filtered.considered} {idx} generations={view.generations}
                    onchange={(cols) => setView({ ...($state.snapshot(view) as ViewState), columns: cols })} />
    {/snippet}
  </Toolbar>
</div>

<!-- Outside .layout so it precedes the sidebar in the tab order: the strip is the default path
     into the tool, and inside .content a keyboard user reaches it only after every filter control. -->
{#if stripOpen}
  <div transition:slide={{ duration: collapseMs }}>
    <SetupStrip counts={presetCounts} side={sideMark} {selected}
                onside={onSide} onstory={onStory} />
  </div>
{/if}

<div class="layout" class:show-filters={showFilters}>
  <!-- The handler is a key trap for the panel below 800px, not a control: giving this box a role
       would announce a landmark that is only a drawer at one width. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sidebar" id="filter-sidebar" data-testid="filter-drawer" bind:this={drawerEl}
       style:--chrome-h="{chromeHeight}px" onkeydown={onDrawerKey}>
    <FilterSidebar {data} {view} onchange={setView} population={filtered.considered} />
  </div>
  <div class="content" style:--thead-top="{chromeHeight}px">
    <Receipt shown={visibleSorted.length} total={filtered.considered.length}
             outsideBounds={filtered.outsideBounds} hiddenMissing={filtered.hiddenMissing}
             showingMissing={view.filters.showMissing ?? false} onshowmissing={onShowMissing} />
    <!-- tabindex so the skip link can move focus here: .focus() on a plain container is a no-op. -->
    <div id={TABLE_ANCHOR_ID} tabindex="-1">
      {#if phone}
        <ShoeTableMobile shoes={visibleSorted} {data} {view} onchange={setView} />
      {:else}
        <ShoeTable shoes={visibleSorted} {data} {view} onchange={setView} />
      {/if}
    </div>
    {#if visibleSorted.length === 0}
      <!-- The table still renders: its headers keep the sort controls reachable. -->
      <p class="empty">No shoes match these filters.</p>
    {/if}
  </div>
</div>

<style>
  .chrome { position: sticky; top: 0; z-index: 5; }
  /* `minmax(0, 1fr)`, not `1fr`: a bare `1fr` track takes an automatic minimum of min-content, and
     the table's 14rem name column plus its nowrap headers inflate that past the viewport, so the
     whole document scrolled sideways at desktop widths. */
  .layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); align-items: start; }
  /* A sticky column taller than the viewport can never scroll to its own bottom, and ten range
     filters easily outgrow it — give the sidebar its own scrollbar. The offset is the measured
     chrome, not the header alone: the toolbar pins too, and is two lines tall below 880px. */
  .sidebar { position: sticky; top: var(--chrome-h); max-height: calc(100vh - var(--chrome-h)); overflow-y: auto; }
  /* No `overflow-x` here, deliberately. It would make `.content` a scrollport — `overflow-x: auto`
     forces `overflow-y` to compute to `auto` — so the table's sticky `thead` would stick to a box
     that never scrolls vertically and ride off with the page. Horizontal overflow falls to the
     page instead, which only bites well past the default six columns and is the only structure in
     which the pinned header works at all (docs/app.md §Columns and sorting). */
  .content { padding: 0 var(--s4) var(--s6); }
  /* The skip link scrolls the anchor to the top of the scrollport, and the top of the scrollport is
     behind the pinned chrome — without this the runner arrives looking at the third row
     (docs/app.md §Columns and sorting). The table's own header row then sits exactly where it
     sticks, so the first row is the first thing under it. */
  #shoe-table { scroll-margin-top: var(--thead-top); }
  .empty { padding: var(--s6); text-align: center; color: var(--text-dim); }
  @media (max-width: 800px) {
    .layout { grid-template-columns: minmax(0, 1fr); }
    /* Off-canvas rather than `display: none`: display cannot be animated, so the drawer appeared
       and vanished with no sense of where it came from. `visibility` is what keeps a closed drawer
       out of the tab order — a panel that is merely translated away is still focusable — and it is
       one of the few properties that can be transitioned alongside a transform without fading. */
    .sidebar {
      position: fixed; top: 0; bottom: 0; left: 0; z-index: 30; width: min(20rem, 88vw);
      max-height: none; background: var(--surface); border-right: 1px solid var(--border);
      box-shadow: var(--shadow-dialog); transform: translateX(-100%); visibility: hidden;
    }
    .layout.show-filters .sidebar { transform: none; visibility: visible; }
    /* `visibility` cannot be interpolated, so it is switched at whichever end of the slide is
       right: immediately on the way in, or the panel is still hidden when it is handed focus, and
       200ms late on the way out, so the slide is seen before it leaves the tab order. */
    @media (prefers-reduced-motion: no-preference) {
      .sidebar { transition: transform 200ms ease-out, visibility 0s linear 200ms; }
      .layout.show-filters .sidebar { transition: transform 200ms ease-out, visibility 0s; }
    }
  }
</style>
