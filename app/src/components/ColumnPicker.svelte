<script lang="ts">
  import type { LabTest, Shoe } from '../../../shared/types.js';
  import { coverageOf } from '../lib/coverage';
  import type { TestIndex } from '../lib/dataset';
  import { metricEntries, type ResolvedMetric } from '../lib/lineage';
  import { EASY_SCORE_KEYS } from '../lib/score';

  let { tests, groups, columns, onchange, population, idx, generations }: {
    tests: LabTest[]; groups: Record<string, string>; columns: string[];
    onchange: (cols: string[]) => void;
    /** Coverage denominator, matching the sidebar's (docs/app.md §Coverage). */
    population: Shoe[]; idx: TestIndex;
    generations: Record<string, string>;
  } = $props();

  /** The two Easy scores sit with the shoe fields rather than among the metrics: they have no
   *  catalogue test, so `metricEntries` never offers them and `coverageOf` would read 0% — and
   *  without a home here the column a story sets could never be unticked. */
  const FIXED: [string, string][] = [['releasedAt', 'Release date'],
    [EASY_SCORE_KEYS.heel, 'Easy heel score'], [EASY_SCORE_KEYS.forefoot, 'Easy forefoot score'],
    ['score', 'Score'], ['msrpGbp', 'Price'], ['plate', 'Plate']];

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
  summary { cursor: pointer; padding: var(--s1) var(--s3); border: 1px solid var(--border); border-radius: var(--r-sm); white-space: nowrap; }
  .panel { position: absolute; right: 0; z-index: 10; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: var(--s3) var(--s4); max-height: 22rem; overflow-y: auto; display: flex; flex-direction: column; gap: var(--s1); min-width: 20rem; box-shadow: var(--shadow-dialog); }
  h4 { margin: var(--s2) 0 var(--s1); font-size: var(--t-xs); color: var(--text-dim); text-transform: uppercase; }
  label { font-size: var(--t-sm); display: grid; grid-template-columns: auto 1fr 3rem 2.2rem; align-items: center; gap: var(--s2); }
  .bar { display: block; height: 6px; border-radius: var(--r-full); background: var(--hist-dim); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--accent); }
  .pct { font-size: var(--t-xs); color: var(--text-dim); text-align: right; font-variant-numeric: tabular-nums; }
</style>
