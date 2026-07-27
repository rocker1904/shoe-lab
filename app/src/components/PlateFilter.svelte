<script lang="ts">
  type Plate = 'none' | 'plated' | 'carbon' | 'not-carbon';
  let { value, onchange }: { value: Plate | undefined; onchange: (v: Plate | undefined) => void } = $props();
  const options = [
    { v: undefined, label: 'Any' }, { v: 'none', label: 'None' },
    { v: 'plated', label: 'Plated' }, { v: 'carbon', label: 'Carbon' },
    { v: 'not-carbon', label: 'No carbon' },
  ] as const;
</script>

<div class="seg" role="group" aria-label="Plate">
  {#each options as o (o.label)}
    <button type="button" class:active={value === o.v} aria-pressed={value === o.v} onclick={() => onchange(o.v)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg { display: flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  button { flex: 1; padding: 0.3rem 0; border: none; background: var(--surface); color: var(--text-dim); cursor: pointer; }
  button.active { background: var(--accent-dim); color: var(--text); font-weight: 600; }
</style>
