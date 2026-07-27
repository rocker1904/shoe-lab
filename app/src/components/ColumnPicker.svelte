<script lang="ts">
  import type { LabTest, Shoe } from '../../../shared/types.js';
  import { coverageOf } from '../lib/coverage';
  import type { TestIndex } from '../lib/dataset';
  import { metricEntries, type ResolvedMetric } from '../lib/lineage';

  let { tests, groups, columns, onchange, population, idx, generations }: {
    tests: LabTest[]; groups: Record<string, string>; columns: string[];
    onchange: (cols: string[]) => void;
    /** Coverage denominator, matching the sidebar's (docs/app.md §Coverage). */
    population: Shoe[]; idx: TestIndex;
    generations: Record<string, string>;
  } = $props();

  const FIXED = [['releasedAt', 'Release date'], ['score', 'Score'], ['msrpGbp', 'Price'], ['plate', 'Plate']] as const;

  interface Offer { key: string; label: string }
  // A pair offers whichever generation is chosen and never both; a colocated metric offers both
  // halves, which is what keeps them independently sortable (docs/app.md §Columns and sorting).
  const offersOf = (e: ResolvedMetric): Offer[] => {
    if (e.kind === 'single') return [{ key: e.key, label: e.label }];
    if (e.kind === 'pair') {
      const g = generations[e.current.key] === e.retired.key ? e.retired : e.current;
      return [{ key: g.key, label: `${e.label} (${g.generation})` }];
    }
    return e.parts.map((p) => ({ key: p.key, label: p.label }));
  };
  const grouped = $derived.by(() => {
    const m = new Map<string, Offer[]>();
    for (const e of metricEntries(tests)) {
      const g = (e.groupId && groups[e.groupId]) || 'Other';
      m.set(g, [...(m.get(g) ?? []), ...offersOf(e)]);
    }
    return [...m.entries()];
  });
  const pct = (key: string) => Math.round(coverageOf(population, key, idx).fraction * 100);
  function toggle(key: string) {
    onchange(columns.includes(key) ? columns.filter((c) => c !== key) : [...columns, key]);
  }
</script>

<details class="picker">
  <summary>Columns ({columns.length})</summary>
  <div class="panel">
    {#each FIXED as [key, label] (key)}
      <label><input type="checkbox" checked={columns.includes(key)} onchange={() => toggle(key)} /> {label}</label>
    {/each}
    {#each grouped as [group, offers] (group)}
      <h4>{group}</h4>
      {#each offers as o (o.key)}
        <label>
          <input type="checkbox" checked={columns.includes(o.key)} onchange={() => toggle(o.key)} />
          <span class="name">{o.label}</span>
          <span class="bar"><span class="fill" style:width="{pct(o.key)}%"></span></span>
          <span class="pct">{pct(o.key)}%</span>
        </label>
      {/each}
    {/each}
  </div>
</details>

<style>
  .picker { position: relative; }
  summary { cursor: pointer; padding: 0.3rem 0.8rem; border: 1px solid var(--border); border-radius: 6px; white-space: nowrap; }
  .panel { position: absolute; right: 0; z-index: 10; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem; max-height: 22rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.2rem; min-width: 20rem; box-shadow: 0 4px 16px rgb(0 0 0 / 0.15); }
  h4 { margin: 0.5rem 0 0.15rem; font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; }
  label { font-size: 0.85rem; display: grid; grid-template-columns: auto 1fr 3rem 2.2rem; align-items: center; gap: 0.4rem; }
  .bar { display: block; height: 6px; border-radius: 3px; background: var(--hist-dim); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--accent); }
  .pct { font-size: 0.72rem; color: var(--text-dim); text-align: right; font-variant-numeric: tabular-nums; }
</style>
