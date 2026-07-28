<script lang="ts">
  import { untrack } from 'svelte';
  import type { ShoesFile } from '../../shared/types.js';
  import ColumnPicker from './components/ColumnPicker.svelte';
  import EntryBand, { TABLE_ANCHOR_ID } from './components/EntryBand.svelte';
  import FilterSidebar from './components/FilterSidebar.svelte';
  import Header from './components/Header.svelte';
  import PresetChips from './components/PresetChips.svelte';
  import Receipt from './components/Receipt.svelte';
  import ShoeTable from './components/ShoeTable.svelte';
  import StrikeToggle from './components/StrikeToggle.svelte';
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
    return { view: parseView(qs || stored || '', indexTests(data.tests)), restored: stored !== null };
  });
  let view = $state<ViewState>(initial.view);
  let showFilters = $state(false);

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
  // The band shows while the view is a clean state — this runner's baseline, or some story.
  const bandOpen = $derived(atDefault || selectedPreset !== null);
  // Three preset applications over the fleet, and only when the band is on screen — $derived is
  // pull-based, so a collapsed band computes nothing.
  const presetCounts = $derived(new Map(PRESETS.map((p) =>
    [p.id, applyFilters(data.shoes, applyPreset(p.id, data.shoes, idx, view.strike).filters, idx).visible.length])));

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
  function onClear() {
    setView(defaultView(snapshot.strike));
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

<Header total={data.shoes.length} visible={visibleSorted.length} builtAt={data.builtAt} {theme}
        onexport={onExport} ontheme={onTheme} />

<div class="toolbar">
  <button type="button" class="filters-toggle" aria-expanded={showFilters} aria-controls="filter-sidebar"
          onclick={() => (showFilters = !showFilters)}>Filters</button>
  <!-- Peers of the story chips, and present in both states: a control that resets a hand-edited
       view has to be reachable *from* one, and the band is gone by then (docs/app.md §Presets). -->
  <StrikeToggle strike={view.strike} onchange={onStrike} />
  <button type="button" class="clear" onclick={onClear}>Clear</button>
  {#if !bandOpen}<PresetChips onapply={onPreset} />{/if}
  <span class="spacer"></span>
  <ColumnPicker tests={data.tests} groups={data.groups} columns={view.columns}
                population={filtered.considered} {idx} generations={view.generations}
                onchange={(cols) => setView({ ...($state.snapshot(view) as ViewState), columns: cols })} />
</div>

<!-- Outside .layout so it precedes the sidebar in the tab order. The band is the default path
     into the tool; inside .content a keyboard user reaches it only after every filter control. -->
{#if bandOpen}
  <EntryBand counts={presetCounts} total={data.shoes.length} onapply={onPreset} selected={selectedPreset} />
{/if}

<div class="layout" class:show-filters={showFilters}>
  <div class="sidebar" id="filter-sidebar">
    <FilterSidebar {data} {view} onchange={setView} population={filtered.considered} />
  </div>
  <div class="content">
    <Receipt shown={visibleSorted.length} total={filtered.considered.length}
             outsideBounds={filtered.outsideBounds} hiddenMissing={filtered.hiddenMissing}
             showingMissing={view.filters.showMissing ?? false} onshowmissing={onShowMissing} />
    <!-- tabindex so Browse all can move focus here: .focus() on a plain container is a no-op. -->
    <div id={TABLE_ANCHOR_ID} tabindex="-1">
      <ShoeTable shoes={visibleSorted} {data} {view} onchange={setView} />
    </div>
    {#if visibleSorted.length === 0}
      <!-- The table still renders: its headers keep the sort controls reachable. -->
      <p class="empty">No shoes match these filters.</p>
    {/if}
  </div>
</div>

<style>
  .toolbar { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1.25rem; }
  .spacer { flex: 1; }
  .layout { display: grid; grid-template-columns: 260px 1fr; align-items: start; }
  /* A sticky column taller than the viewport can never scroll to its own bottom, and ten range
     filters easily outgrow it — give the sidebar its own scrollbar. */
  .sidebar { position: sticky; top: 3.2rem; max-height: calc(100vh - 3.2rem); overflow-y: auto; }
  .content { overflow-x: auto; padding: 0 1rem 2rem; }
  .empty { padding: 2rem; text-align: center; color: var(--text-dim); }
  .filters-toggle { display: none; padding: 0.3rem 0.8rem; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 6px; }
  .clear { padding: 0.25rem 0.75rem; cursor: pointer; border: 1px solid var(--border); background: none; color: var(--text-dim); border-radius: 999px; font-size: 0.85rem; }
  .clear:hover { color: var(--text); border-color: var(--accent); }
  @media (max-width: 800px) {
    .toolbar { flex-wrap: wrap; padding: 0.5rem 0.75rem; }
    .layout { grid-template-columns: 1fr; }
    .sidebar { display: none; position: static; }
    .layout.show-filters .sidebar { display: block; }
    .filters-toggle { display: inline-block; }
  }
</style>
