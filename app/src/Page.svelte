<script lang="ts">
  import { untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import type { ShoesFile } from '../../shared/types.js';
  import ColumnPicker from './components/ColumnPicker.svelte';
  import FilterSidebar from './components/FilterSidebar.svelte';
  import Header from './components/Header.svelte';
  import Receipt from './components/Receipt.svelte';
  import SetupStrip from './components/SetupStrip.svelte';
  import ShoeTable from './components/ShoeTable.svelte';
  import ShoeTableMobile from './components/ShoeTableMobile.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import { TABLE_ANCHOR_ID } from './lib/anchor';
  import { exportCsv } from './lib/csv-export';
  import { indexTests } from './lib/dataset';
  import { applyFilters } from './lib/filters';
  import type { Side } from './lib/lineage';
  import { readStoredView, writeStoredView } from './lib/persist';
  import { applyPreset, PRESETS } from './lib/presets';
  import { sortShoes } from './lib/sort';
  import { currentTheme, cycleTheme, type Theme } from './lib/theme';
  import { defaultView, isDefaultView, parseView, sameValue, serializeView, swapStrike, type ViewState } from './lib/urlstate';

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

  const filtered = $derived(applyFilters(data.shoes, view.filters, idx));
  const visibleSorted = $derived(sortShoes(filtered.visible, view.sort, idx));
  const snapshot = $derived($state.snapshot(view) as ViewState);
  const atDefault = $derived(isDefaultView(snapshot));
  /**
   * Derived, never stored: a story reads as selected while the view equals what `applyPreset`
   * would build for it *now*. A stored `preset` field would keep claiming Easy after the runner
   * had filtered it into something else (docs/app.md §Presets).
   */
  const selectedPreset = $derived(
    PRESETS.find((p) => sameValue(snapshot, applyPreset(p.id, data.shoes, idx, snapshot.strike)))?.id ?? null);
  // `All` is a peer of the stories in the bar, so it needs a count in the same map. Three preset
  // applications over a dataset already in memory.
  const presetCounts = $derived(new Map<string, number>([
    ['all', data.shoes.length],
    ...PRESETS.map((p) => [p.id,
      applyFilters(data.shoes, applyPreset(p.id, data.shoes, idx, view.strike).filters, idx).visible.length] as const),
  ]));

  function setView(v: ViewState) {
    view = v;
    const qs = serializeView(v);
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    writeStoredView(qs);
  }
  // A view restored from storage has to reach the URL, or a returning visitor sees a filtered
  // table behind a bare URL and copying the link shares the default view instead. Routed through
  // the one existing write path rather than adding a second URL write site.
  if (initial.restored) setView(initial.view);

  function onPreset(id: string) {
    setView(applyPreset(id, data.shoes, idx, view.strike));
  }
  /**
   * Flipping strike **re-derives** the view (docs/app.md §Presets). Setting the field alone would
   * leave heel-shaped columns behind, so the view would stop equalling its own baseline and the
   * band would collapse on the very control this exists to protect.
   */
  function onStrike(next: Side) {
    if (next === snapshot.strike) return;
    if (atDefault) setView(defaultView(next));
    else if (selectedPreset) setView(applyPreset(selectedPreset, data.shoes, idx, next));
    else setView(swapStrike(snapshot, next));
  }
  // `All` is the baseline rather than a fourth story, so it routes to the same view a Clear
  // button used to produce (docs/app.md §Presets).
  function onStory(id: string) {
    // The strip's own question, answered — the toolbar carries the counts from here, and the only
    // thing the cards held exclusively was the descriptions, which are a first-encounter need.
    stripOpen = false;
    if (id === 'all') setView(defaultView(snapshot.strike));
    else onPreset(id);
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

<!-- Header and toolbar pin together, because every control that changes the view has to stay
     reachable from anywhere in a 25,000px table; the receipt below reports rather than controls,
     so it scrolls (docs/app.md §Columns and sorting). -->
<div class="chrome" bind:clientHeight={chromeHeight}>
  <Header total={data.shoes.length} visible={visibleSorted.length} builtAt={data.builtAt} {theme}
          onexport={onExport} ontheme={onTheme} />
  <Toolbar strike={view.strike} onstrike={onStrike} selected={atDefault ? 'all' : selectedPreset}
           counts={presetCounts} onstory={onStory} {showFilters}
           onfilters={() => (showFilters = !showFilters)}>
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
    <SetupStrip counts={presetCounts} strike={view.strike} selected={atDefault ? 'all' : selectedPreset}
                onstrike={onStrike} onstory={onStory} />
  </div>
{/if}

<div class="layout" class:show-filters={showFilters}>
  <div class="sidebar" id="filter-sidebar" style:--chrome-h="{chromeHeight}px">
    <FilterSidebar {data} {view} onchange={setView} population={filtered.considered} />
  </div>
  <div class="content" style:--thead-top="{chromeHeight}px">
    <Receipt shown={visibleSorted.length} total={filtered.considered.length}
             outsideBounds={filtered.outsideBounds} hiddenMissing={filtered.hiddenMissing}
             showingMissing={view.filters.showMissing ?? false} onshowmissing={onShowMissing} />
    <!-- tabindex so Browse all can move focus here: .focus() on a plain container is a no-op. -->
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
  .empty { padding: var(--s6); text-align: center; color: var(--text-dim); }
  @media (max-width: 800px) {
    .layout { grid-template-columns: minmax(0, 1fr); }
    .sidebar { display: none; position: static; }
    .layout.show-filters .sidebar { display: block; }
  }
</style>
