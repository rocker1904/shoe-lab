<script lang="ts">
  let { counts, selected, onchange }: {
    counts: Map<string, number>; selected: string[]; onchange: (brands: string[]) => void;
  } = $props();
  const brands = $derived([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  function toggle(brand: string) {
    onchange(selected.includes(brand) ? selected.filter((b) => b !== brand) : [...selected, brand]);
  }
</script>

<details>
  <summary>Brand{selected.length ? ` (${selected.length})` : ''}</summary>
  <ul>
    {#each brands as [brand, n] (brand)}
      <li><label><input type="checkbox" checked={selected.includes(brand)} onchange={() => toggle(brand)} /> {brand} ({n})</label></li>
    {/each}
  </ul>
</details>

<style>
  summary { cursor: pointer; font-size: 0.85rem; color: var(--text-dim); }
  ul { list-style: none; padding: 0.25rem 0 0; margin: 0; max-height: 14rem; overflow-y: auto; }
  li { font-size: 0.85rem; padding: 0.1rem 0; }
</style>
