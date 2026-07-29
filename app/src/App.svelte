<script lang="ts" module>
  /**
   * Long enough that a fetch off a warm cache never shows a placeholder at all — the dataset is a
   * 2MB asset served from the same origin, so most loads are far inside this — and short enough
   * that a genuinely slow one does not look broken. A skeleton that flashes for 200ms is worse
   * than the text it replaced (docs/app.md §Decisions).
   */
  export const SKELETON_AFTER_MS = 300;
</script>

<script lang="ts">
  import type { ShoesFile } from '../../shared/types.js';
  import { loadShoes } from './lib/data';
  import Page from './Page.svelte';

  let data = $state<ShoesFile | null>(null);
  let error = $state<string | null>(null);
  let slow = $state(false);

  async function load() {
    error = null;
    const timer = setTimeout(() => (slow = true), SKELETON_AFTER_MS);
    try {
      data = await loadShoes();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer);
      slow = false;
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
{:else if slow}
  <!-- Shaped like what is coming — a chrome bar over a stack of rows — rather than a spinner,
       so the layout does not jump when the real thing arrives. -->
  <div class="skeleton" role="status" aria-label="Loading shoe data">
    <div class="bar chrome"></div>
    {#each Array.from({ length: 8 }, (_, i) => i) as i (i)}
      <div class="bar row"></div>
    {/each}
  </div>
{/if}

<style>
  .error {
    padding: var(--s6);
    text-align: center;
    color: var(--text-dim);
  }
  button {
    padding: var(--s2) var(--s5);
    cursor: pointer;
  }
  .skeleton { display: flex; flex-direction: column; gap: var(--s2); padding: var(--s4); }
  .bar { background: var(--chrome); border-radius: var(--r-sm); }
  .bar.chrome { height: var(--s6); margin-bottom: var(--s4); }
  .bar.row { height: var(--s5); }
  /* The pulse is the only thing that says "still working"; without motion the bars must simply
     sit there rather than be replaced by a second, animation-free design. */
  @media (prefers-reduced-motion: no-preference) {
    .bar { animation: pulse 1.4s ease-in-out infinite; }
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
</style>
