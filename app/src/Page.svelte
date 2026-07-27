<script lang="ts">
  import { untrack } from 'svelte';
  import type { ShoesFile } from '../../shared/types.js';
  import ColumnPicker from './components/ColumnPicker.svelte';
  import FilterSidebar from './components/FilterSidebar.svelte';
  import Header from './components/Header.svelte';
  import PresetChips from './components/PresetChips.svelte';
  import Receipt from './components/Receipt.svelte';
  import ShoeTable from './components/ShoeTable.svelte';
  import { exportCsv } from './lib/csv-export';
  import { indexTests } from './lib/dataset';
  import { applyFilters } from './lib/filters';
  import { applyPreset } from './lib/presets';
  import { sortShoes } from './lib/sort';
  import { currentTheme, cycleTheme, type Theme } from './lib/theme';
  import { parseView, serializeView, type ViewState } from './lib/urlstate';

  let { data }: { data: ShoesFile } = $props();

  const idx = $derived(indexTests(data.tests));
  // Parsed once; from here the view is the source of truth and the URL is write-only
  // (docs/app.md §View and URL ownership).
  let view = $state<ViewState>(untrack(() => parseView(location.search.replace(/^\?/, ''), indexTests(data.tests))));
  let showFilters = $state(false);

  const filtered = $derived(applyFilters(data.shoes, view.filters, idx));
  const visibleSorted = $derived(sortShoes(filtered.visible, view.sort, idx));

  function setView(v: ViewState) {
    view = v;
    const qs = serializeView(v);
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }
  function onPreset(id: string) {
    setView(applyPreset(id, data.shoes, idx, new Date()));
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
  <PresetChips onapply={onPreset} />
  <span class="spacer"></span>
  <ColumnPicker tests={data.tests} groups={data.groups} columns={view.columns}
                population={filtered.considered} {idx} generations={view.generations}
                onchange={(cols) => setView({ ...($state.snapshot(view) as ViewState), columns: cols })} />
</div>

<div class="layout" class:show-filters={showFilters}>
  <div class="sidebar" id="filter-sidebar">
    <FilterSidebar {data} {view} onchange={setView} population={filtered.considered} />
  </div>
  <div class="content">
    <Receipt shown={visibleSorted.length} total={filtered.considered.length}
             outsideBounds={filtered.outsideBounds} hiddenMissing={filtered.hiddenMissing}
             showingMissing={view.filters.showMissing ?? false} onshowmissing={onShowMissing} />
    <ShoeTable shoes={visibleSorted} {data} {view} onchange={setView} />
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
  @media (max-width: 800px) {
    .toolbar { flex-wrap: wrap; padding: 0.5rem 0.75rem; }
    .layout { grid-template-columns: 1fr; }
    .sidebar { display: none; position: static; }
    .layout.show-filters .sidebar { display: block; }
    .filters-toggle { display: inline-block; }
  }
</style>
