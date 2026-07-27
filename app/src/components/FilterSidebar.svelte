<script lang="ts" module>
  export const CURATED_RANGE_KEYS = [
    'heel-stack', 'forefoot-stack', 'drop', 'midsole-softness-22', 'energy-return-heel',
    'weight', 'toebox-width-widest-part', 'toebox-width-big-toe', 'toebox-height', 'msrpGbp',
  ];
</script>

<script lang="ts">
  import type { ShoesFile } from '../../../shared/types.js';
  import { FIELD_RANGE_KEYS, NUMERIC_TEST_TYPES, indexTests, isoYearsAgo, numericValue } from '../lib/dataset';
  import type { RangeBound } from '../lib/filters';
  import { histogram } from '../lib/stats';
  import type { ViewState } from '../lib/urlstate';
  import BrandFilter from './BrandFilter.svelte';
  import PlateFilter from './PlateFilter.svelte';
  import RangeFilter from './RangeFilter.svelte';

  let { data, view, onchange, hiddenMissing }: {
    data: ShoesFile; view: ViewState; onchange: (v: ViewState) => void; hiddenMissing: number;
  } = $props();

  const idx = $derived(indexTests(data.tests));

  const labelFor = (key: string): { label: string; units: string } => {
    if (key === 'msrpGbp') return { label: 'Price', units: '£' };
    if (key === 'score') return { label: 'Score', units: '' };
    const t = idx.bySlug.get(key);
    return { label: t?.name ?? key, units: t?.units ?? '' };
  };
  // Numeric tests only: a range over any other type reads as missing for every shoe (docs/app.md §Filters).
  const rangeable = (key: string): boolean => {
    if (FIELD_RANGE_KEYS.has(key)) return true;
    const t = idx.bySlug.get(key);
    return !!t && NUMERIC_TEST_TYPES.has(t.type);
  };
  const availableRangeKeys = $derived(CURATED_RANGE_KEYS.filter(rangeable));
  // A non-curated key already in the view needs its own row, or its filter could never be cleared.
  const extraKeys = $derived(Object.keys(view.filters.ranges).filter((k) => !availableRangeKeys.includes(k)));
  const addableKeys = $derived(data.tests
    .filter((t) => NUMERIC_TEST_TYPES.has(t.type) && !availableRangeKeys.includes(t.slug) && !extraKeys.includes(t.slug))
    .map((t) => t.slug));
  const histFor = (key: string) => histogram(data.shoes.map((s) => numericValue(s, key, idx)).filter((v): v is number => v !== undefined));
  const brandCounts = $derived(data.shoes.reduce((m, s) => (s.brand ? m.set(s.brand, (m.get(s.brand) ?? 0) + 1) : m), new Map<string, number>()));

  function patch(mutate: (v: ViewState) => void) {
    const next: ViewState = structuredClone($state.snapshot(view)) as ViewState;
    mutate(next);
    onchange(next);
  }
  function setRange(key: string, b: RangeBound) {
    patch((v) => {
      const next: RangeBound = {};
      if (b.min !== undefined) next.min = b.min;
      if (b.max !== undefined) next.max = b.max;
      // A curated row renders regardless, so clearing it can drop the key; an extra row exists only while
      // its key does, so it keeps an empty entry (docs/app.md §Filters).
      if (next.min === undefined && next.max === undefined && availableRangeKeys.includes(key)) {
        delete v.filters.ranges[key];
      } else {
        v.filters.ranges[key] = next;
      }
    });
  }
</script>

<aside>
  <input class="search" type="search" placeholder="Search shoes…" aria-label="Search"
         value={view.filters.search ?? ''} oninput={(e) => patch((v) => { v.filters.search = e.currentTarget.value || undefined; })} />

  <section>
    <h3>Released after</h3>
    <input type="date" aria-label="Released after" value={view.filters.releasedAfter ?? ''}
           oninput={(e) => patch((v) => { v.filters.releasedAfter = e.currentTarget.value || undefined; })} />
    <div class="chips">
      {#each [1, 2, 3] as y}
        <button type="button" onclick={() => patch((v) => { v.filters.releasedAfter = isoYearsAgo(new Date(), y); })}>{y}y</button>
      {/each}
    </div>
  </section>

  <section>
    <h3>Plate</h3>
    <PlateFilter value={view.filters.plate} onchange={(p) => patch((v) => { v.filters.plate = p; })} />
  </section>

  <section>
    <BrandFilter counts={brandCounts} selected={view.filters.brands ?? []}
                 onchange={(brands) => patch((v) => { v.filters.brands = brands.length ? brands : undefined; })} />
  </section>

  <section>
    <label class="disc"><input type="checkbox" checked={view.filters.hideDiscontinued ?? false}
      onchange={(e) => patch((v) => { v.filters.hideDiscontinued = e.currentTarget.checked || undefined; })} /> Hide discontinued</label>
  </section>

  {#each [...availableRangeKeys, ...extraKeys] as key (key)}
    {@const { label, units } = labelFor(key)}
    <RangeFilter {label} {units} hist={histFor(key)} bound={view.filters.ranges[key] ?? {}} onchange={(b) => setRange(key, b)} />
  {/each}

  {#if addableKeys.length}
    <select aria-label="Add filter"
            onchange={(e) => { const k = e.currentTarget.value; e.currentTarget.value = ''; if (k) patch((v) => { v.filters.ranges[k] ??= {}; }); }}>
      <option value="">Add filter…</option>
      {#each addableKeys as k (k)}
        <option value={k}>{labelFor(k).label}</option>
      {/each}
    </select>
  {/if}

  {#if hiddenMissing > 0}
    <p class="note">
      {hiddenMissing} {hiddenMissing === 1 ? 'shoe has' : 'shoes have'} no data for the active filters.
    </p>
  {/if}

  <button type="button" class="reset" onclick={() => patch((v) => { v.filters = { ranges: {} }; })}>Reset filters</button>
</aside>

<style>
  aside { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  h3 { font-size: 0.8rem; color: var(--text-dim); margin: 0 0 0.25rem; font-weight: 600; }
  .search { padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
  .chips { display: flex; gap: 0.35rem; margin-top: 0.35rem; }
  .chips button { padding: 0.15rem 0.6rem; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text-dim); cursor: pointer; }
  .note { font-size: 0.8rem; color: var(--text-dim); }
  .reset { align-self: flex-start; padding: 0.3rem 0.8rem; cursor: pointer; }
  .disc { font-size: 0.85rem; }
</style>
