<script lang="ts">
  import type { Shoe, ShoesFile } from '../../../shared/types.js';
  import { coverageOf, oldestReading } from '../lib/coverage';
  import { indexTests, isoYearsAgo, numericValue } from '../lib/dataset';
  import type { RangeBound } from '../lib/filters';
  import { CURATED_RANGE_KEYS, metricEntries, type ResolvedMetric, type Side } from '../lib/lineage';
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
  const SIDE_LABEL: Record<Side, string> = { forefoot: 'Forefoot', heel: 'Heel' };

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

  const held = (key: string) => key in view.filters.ranges || view.rows.includes(key);
  const chosenKey = (e: ResolvedMetric): string => {
    if (e.kind === 'single') return e.key;
    if (e.kind === 'colocated') return e.parts[0]!.key;
    const explicit = view.generations[e.current.key];
    if (explicit) return explicit;
    // A hand-written URL can carry a lone range on the retired generation; presenting the pair as
    // switched to it is what keeps that filter visible and clearable.
    return held(e.retired.key) && !held(e.current.key) ? e.retired.key : e.current.key;
  };
  /** **Every** part of a side pair gets a row, always: the sidebar must not change shape with the
   *  strike (docs/app.md §Filters). A superseded pair still offers one generation at a time. */
  const rowKeysOf = (e: ResolvedMetric): string[] =>
    e.kind === 'colocated' ? e.parts.map((p) => p.key) : [chosenKey(e)];

  const curated = $derived.by(() => {
    const out: ResolvedMetric[] = [];
    for (const k of CURATED_RANGE_KEYS) {
      const e = byKey.get(k);
      if (e && !out.includes(e)) out.push(e);
    }
    return out;
  });
  // A hand-added row, or a non-curated key already bounded by a link, needs a row of its own or its
  // filter could never be cleared. Curated first, so the order above is what the runner sees.
  const extras = $derived.by(() => {
    const out: ResolvedMetric[] = [];
    for (const k of [...view.rows, ...Object.keys(view.filters.ranges)]) {
      const e = byKey.get(k);
      if (e && !curated.includes(e) && !out.includes(e)) out.push(e);
    }
    return out;
  });
  const shown = $derived([...curated, ...extras]);

  /** Heading **and** side: two rows both called "Forefoot" would share an accessible name. */
  const nameFor = (e: ResolvedMetric, key: string): string => {
    if (e.kind === 'single') return e.units ? `${e.label} (${e.units})` : e.label;
    if (e.kind === 'pair') return `${e.label} — ${(key === e.current.key ? e.current : e.retired).generation}`;
    const p = e.parts.find((x) => x.key === key)!;
    if (p.side) return `${e.label} — ${SIDE_LABEL[p.side]}`;
    return p.units ? `${p.label} (${p.units})` : p.label;
  };

  const pctOf = (key: string) => `${Math.round(coverageOf(population, key, idx).fraction * 100)}%`;
  const addable = $derived(entries.flatMap((e) => {
    const rows = shown.includes(e) ? rowKeysOf(e) : [];
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
      // Clearing always deletes the key. Leaving `{}` behind would mean `isDefaultView` never
      // returned true again and the entry band could never re-open; the row survives because it is
      // listed in `view.rows`, not because a hollow key props it up (docs/app.md §Filters).
      if (next.min === undefined && next.max === undefined) delete v.filters.ranges[key];
      else v.filters.ranges[key] = next;
    });
  }
  const removable = (key: string) => view.rows.includes(key);
  function removeRow(key: string) {
    patch((v) => {
      v.rows = v.rows.filter((k) => k !== key);
      delete v.filters.ranges[key];
    });
  }
  function addRow(key: string) {
    patch((v) => { if (!v.rows.includes(key)) v.rows.push(key); });
  }
  function choose(e: ResolvedMetric, key: string) {
    if (e.kind !== 'pair') return;
    patch((v) => {
      const sibling = key === e.current.key ? e.retired.key : e.current.key;
      if (key === e.current.key) delete v.generations[e.current.key];
      else v.generations[e.current.key] = key;
      // Selecting one generation releases the other. Readings are not comparable across a
      // supersession, so the bound is dropped rather than carried over (docs/app.md §URL encoding).
      delete v.filters.ranges[sibling];
      v.columns = v.columns.filter((c) => c !== sibling);
      // A hand-added pair follows its row across the switch; a curated one renders regardless.
      v.rows = v.rows.map((k) => (k === sibling ? key : k));
    });
  }
</script>

<aside>
  <section>
    <h3>Search</h3>
    <input class="search" type="search" placeholder="Search shoes…" aria-label="Search"
           value={view.filters.search ?? ''} oninput={(e) => patch((v) => { v.filters.search = e.currentTarget.value || undefined; })} />
  </section>

  <section>
    <h3>Released after</h3>
    <input type="date" aria-label="Released after" value={view.filters.releasedAfter ?? ''}
           oninput={(e) => patch((v) => { v.filters.releasedAfter = e.currentTarget.value || undefined; })} />
    <div class="chips">
      <!-- The only way to unset a date the chips set: a chip that sets one cannot also clear it. -->
      <button type="button" onclick={() => patch((v) => { v.filters.releasedAfter = undefined; })}>Any</button>
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
    <h3>Brand</h3>
    <BrandFilter counts={brandCounts} selected={view.filters.brands ?? []}
                 onchange={(brands) => patch((v) => { v.filters.brands = brands.length ? brands : undefined; })} />
  </section>

  <section>
    <h3>Discontinued</h3>
    <DiscontinuedFilter value={view.filters.discontinued} onchange={(d) => patch((v) => { v.filters.discontinued = d; })} />
  </section>

  {#each shown as e (keysOf(e)[0])}
    <section class="metric">
      <MetricRow metric={e} chosen={chosenKey(e)} onchoose={(k) => choose(e, k)} strike={view.strike}
                 coverage={(k) => coverageOf(population, k, idx)}
                 oldest={(k) => oldestReading(population, k, idx)} />
      {#each rowKeysOf(e) as key (key)}
        <RangeFilter label="" units="" name={nameFor(e, key)} hist={histFor(key)}
                     bound={view.filters.ranges[key] ?? {}} onchange={(b) => setRange(key, b)}
                     onremove={removable(key) ? () => removeRow(key) : undefined} />
      {/each}
    </section>
  {/each}

  {#if addable.length}
    <!-- A bar cannot render inside an `option`, so the menu carries the percentage alone (docs/app.md §Coverage). -->
    <select aria-label="Add filter"
            onchange={(e) => { const k = e.currentTarget.value; e.currentTarget.value = ''; if (k) addRow(k); }}>
      <option value="">Add filter…</option>
      {#each addable as a (a.key)}
        <option value={a.key}>{a.label}</option>
      {/each}
    </select>
  {/if}

  <button type="button" class="reset" onclick={() => patch((v) => { v.filters = { ranges: {} }; v.generations = {}; v.rows = []; })}>Reset filters</button>
</aside>

<style>
  aside { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  h3 { font-size: 0.8rem; color: var(--text-dim); margin: 0 0 0.25rem; font-weight: 600; }
  .search { padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); width: 100%; box-sizing: border-box; }
  .chips { display: flex; gap: 0.35rem; margin-top: 0.35rem; }
  .chips button { padding: 0.15rem 0.6rem; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text-dim); cursor: pointer; }
  .metric { display: flex; flex-direction: column; gap: 0.3rem; }
  .reset { align-self: flex-start; padding: 0.3rem 0.8rem; cursor: pointer; }
</style>
