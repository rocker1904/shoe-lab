<script lang="ts">
  import type { ShoesFile } from '../../shared/types.js';
  import { loadShoes } from './lib/data';
  import Page from './Page.svelte';

  let data = $state<ShoesFile | null>(null);
  let error = $state<string | null>(null);

  async function load() {
    error = null;
    try {
      data = await loadShoes();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  load();
</script>

{#if error}
  <div class="error" role="alert">
    <p>Could not load shoe data. {error}</p>
    <button onclick={load}>Retry</button>
  </div>
{:else if data}
  <Page {data} />
{:else}
  <p class="loading">Loading shoe data…</p>
{/if}

<style>
  .error,
  .loading {
    padding: 3rem;
    text-align: center;
    color: var(--text-dim);
  }
  button {
    padding: 0.5rem 1.25rem;
    cursor: pointer;
  }
</style>
