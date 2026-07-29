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
  .chips { display: flex; gap: var(--s2); flex-wrap: wrap; }
  button { padding: var(--s1) var(--s3); border: 1px solid var(--accent); color: var(--accent); background: none; border-radius: var(--r-full); cursor: pointer; font-size: var(--t-sm); }
  button:hover { background: var(--accent-dim); }
</style>
