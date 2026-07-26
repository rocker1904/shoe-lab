<script lang="ts">
  import { PRESETS } from '../lib/presets';
  let { onapply }: { onapply: (id: string) => void } = $props();
</script>

<div class="chips" role="group" aria-label="Presets">
  {#each PRESETS as p (p.id)}
    <button type="button" title={p.describe} onclick={() => onapply(p.id)}>{p.label}</button>
  {/each}
</div>

<style>
  .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  button { padding: 0.25rem 0.75rem; border: 1px solid var(--accent); color: var(--accent); background: none; border-radius: 999px; cursor: pointer; font-size: 0.85rem; }
  button:hover { background: var(--accent-dim); }
</style>
