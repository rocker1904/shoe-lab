<script lang="ts" module>
  export const CURATED_RANGE_KEYS = [
    'heel-stack', 'forefoot-stack', 'drop', 'midsole-softness-22', 'energy-return-heel',
    'weight', 'toebox-width-widest-part', 'toebox-width-big-toe', 'toebox-height', 'msrpGbp',
  ];
</script>

<script lang="ts">
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { coverageOf, oldestReading } from '../lib/coverage';
  import { indexTests, isoYearsAgo, numericValue } from '../lib/dataset';
  import type { RangeBound } from '../lib/filters';
  import { metricEntries, type ResolvedMetric } from '../lib/lineage';
  import { histogram } from '../lib/stats';
  import type { ViewState } from '../lib/urlstate';
  import BrandFilter from './BrandFilter.svelte';
  import DiscontinuedFilter from './DiscontinuedFilter.svelte';
  import MetricRow from './MetricRow.svelte';
  import PlateFilter from './PlateFilter.svelte';
  import RangeFilter from './RangeFilter.svelte';

  let { data, view, onchange, population }: {
    data: ShoesFile; view: ViewState; onchange: (v: ViewState) => void;
    /** Coverage denominator: the shoes left by the non-range filters (docs/app.md §Coverage). */
    population: Shoe[];
  } = $props();

  const idx = $derived(indexTests(data.tests));

  /** `score` and `msrpGbp` are shoe fields, not catalogue tests, so `metricEntries` cannot emit
   *  them — and leaving them out would take the price filter with them (docs/app.md §Filters). */
  const FIELD_METRICS: ResolvedMetric[] = [
    { kind: 'single', key: 'msrpGbp', label: 'Price', units: '£', groupId: null },
    { kind: 'single', key: 'score', label: 'Score', units: '', groupId: null },
  ];
  const entries = $derived([...metricEntries(data.tests), ...FIELD_METRICS]);
  const keysOf = (e: ResolvedMetric): string[] =>
    e.kind === 'single' ? [e.key] : e.kind === 'pair' ? [e.current.key, e.retired.key] : e.parts.map((p) => p.key);
  const byKey = $derived(new Map(entries.flatMap((e) => keysOf(e).map((k) => [k, e] as const))));

  const curated = $derived.by(() => {
    const out: ResolvedMetric[] = [];
    for (const k of CURATED_RANGE_KEYS) {
      const e = byKey.get(k);
      if (e && !out.includes(e)) out.push(e);
    }
    return out;
  });
  // A non-curated key already in the view needs its own row, or its filter could never be cleared.
  const extras = $derived.by(() => {
    const out: ResolvedMetric[] = [];
    for (const k of Object.keys(view.filters.ranges)) {
      const e = byKey.get(k);
      if (e && !curated.includes(e) && !out.includes(e)) out.push(e);
    }
    return out;
  });
  const shown = $derived([...curated, ...extras]);

  const chosenKey = (e: ResolvedMetric): string => {
    if (e.kind === 'single') return e.key;
    if (e.kind === 'colocated') return e.parts[0]!.key;
    const explicit = view.generations[e.current.key];
    if (explicit) return explicit;
    // A hand-written URL can carry a lone range on the retired generation; presenting the pair as
    // switched to it is what keeps that filter visible and clearable.
    return view.filters.ranges[e.retired.key] && !view.filters.ranges[e.current.key] ? e.retired.key : e.current.key;
  };
  // A pair offers one bound at a time; a colocated metric's halves stay independent, so each gets
  // a row once it is curated or active.
  const rowKeys = (e: ResolvedMetric): string[] =>
    e.kind === 'colocated'
      ? e.parts.map((p) => p.key).filter((k) => CURATED_RANGE_KEYS.includes(k) || k in view.filters.ranges)
      : [chosenKey(e)];
  const nameFor = (e: ResolvedMetric, key: string): string => {
    if (e.kind === 'single') return e.units ? `${e.label} (${e.units})` : e.label;
    if (e.kind === 'pair') return `${e.label} — ${(key === e.current.key ? e.current : e.retired).generation}`;
    const p = e.parts.find((x) => x.key === key)!;
    return p.units ? `${p.label} (${p.units})` : p.label;
  };

  const alwaysShown = $derived(new Set(curated.flatMap(rowKeys)));
  const pctOf = (key: string) => `${Math.round(coverageOf(population, key, idx).fraction * 100)}%`;
  const addable = $derived(entries.flatMap((e) => {
    const rows = shown.includes(e) ? rowKeys(e) : [];
    return (e.kind === 'colocated' ? e.parts.map((p) => p.key) : [chosenKey(e)])
      .filter((k) => !rows.includes(k))
      .map((k) => ({ key: k, label: `${nameFor(e, k)} — ${pctOf(k)}` }));
  }));

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
      // A row that renders regardless can drop its key when cleared; a row that exists only while
      // its key does keeps an empty entry (docs/app.md §Filters).
      if (next.min === undefined && next.max === undefined && alwaysShown.has(key)) {
        delete v.filters.ranges[key];
      } else {
        v.filters.ranges[key] = next;
      }
    });
  }
  function choose(e: ResolvedMetric, key: string) {
    patch((v) => {
      if (e.kind !== 'pair') { v.filters.ranges[key] ??= {}; return; }
      const sibling = key === e.current.key ? e.retired.key : e.current.key;
      if (key === e.current.key) delete v.generations[e.current.key];
      else v.generations[e.current.key] = key;
      // Selecting one generation releases the other. Readings are not comparable across a
      // supersession, so the bound is dropped rather than carried over (docs/app.md §URL encoding).
      const held = v.filters.ranges[sibling] !== undefined;
      delete v.filters.ranges[sibling];
      v.columns = v.columns.filter((c) => c !== sibling);
      if (held) v.filters.ranges[key] ??= {};
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
      {#each [1, 2, 3] as y (y)}
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
    <h3>Discontinued</h3>
    <DiscontinuedFilter value={view.filters.discontinued} onchange={(d) => patch((v) => { v.filters.discontinued = d; })} />
  </section>

  {#each shown as e (keysOf(e)[0])}
    <section class="metric">
      <MetricRow metric={e} chosen={chosenKey(e)} onchoose={(k) => choose(e, k)}
                 coverage={(k) => coverageOf(population, k, idx)}
                 oldest={(k) => oldestReading(population, k, idx)} />
      {#each rowKeys(e) as key (key)}
        <RangeFilter label="" units="" name={nameFor(e, key)} hist={histFor(key)}
                     bound={view.filters.ranges[key] ?? {}} onchange={(b) => setRange(key, b)} />
      {/each}
    </section>
  {/each}

  {#if addable.length}
    <!-- A bar cannot render inside an `option`, so the menu carries the percentage alone (docs/app.md §Coverage). -->
    <select aria-label="Add filter"
            onchange={(e) => { const k = e.currentTarget.value; e.currentTarget.value = ''; if (k) patch((v) => { v.filters.ranges[k] ??= {}; }); }}>
      <option value="">Add filter…</option>
      {#each addable as a (a.key)}
        <option value={a.key}>{a.label}</option>
      {/each}
    </select>
  {/if}

  <button type="button" class="reset" onclick={() => patch((v) => { v.filters = { ranges: {} }; v.generations = {}; })}>Reset filters</button>
</aside>

<style>
  aside { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  h3 { font-size: 0.8rem; color: var(--text-dim); margin: 0 0 0.25rem; font-weight: 600; }
  .search { padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
  .chips { display: flex; gap: 0.35rem; margin-top: 0.35rem; }
  .chips button { padding: 0.15rem 0.6rem; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text-dim); cursor: pointer; }
  .metric { display: flex; flex-direction: column; gap: 0.3rem; }
  .reset { align-self: flex-start; padding: 0.3rem 0.8rem; cursor: pointer; }
</style>
