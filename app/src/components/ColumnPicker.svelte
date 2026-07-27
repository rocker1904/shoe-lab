<script lang="ts">
  import type { LabTest } from '../../../shared/types.js';
  let { tests, groups, columns, onchange }: {
    tests: LabTest[]; groups: Record<string, string>; columns: string[]; onchange: (cols: string[]) => void;
  } = $props();
  const NUMERIC = new Set(['float', 'score', 'percent', 'rating']);
  const FIXED = [['releasedAt', 'Release date'], ['score', 'Score'], ['msrpGbp', 'Price'], ['plate', 'Plate']] as const;
  const grouped = $derived.by(() => {
    const m = new Map<string, LabTest[]>();
    for (const t of tests.filter((t) => NUMERIC.has(t.type))) {
      const g = (t.groupId && groups[t.groupId]) || 'Other';
      m.set(g, [...(m.get(g) ?? []), t]);
    }
    return [...m.entries()];
  });
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
    {#each grouped as [group, ts] (group)}
      <h4>{group}</h4>
      {#each ts as t (t.slug)}
        <label><input type="checkbox" checked={columns.includes(t.slug)} onchange={() => toggle(t.slug)} /> {t.name}</label>
      {/each}
    {/each}
  </div>
</details>

<style>
  .picker { position: relative; }
  summary { cursor: pointer; padding: 0.3rem 0.8rem; border: 1px solid var(--border); border-radius: 6px; white-space: nowrap; }
  .panel { position: absolute; right: 0; z-index: 10; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem; max-height: 22rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.2rem; min-width: 16rem; box-shadow: 0 4px 16px rgb(0 0 0 / 0.15); }
  h4 { margin: 0.5rem 0 0.15rem; font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; }
  label { font-size: 0.85rem; }
</style>
