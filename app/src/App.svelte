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
    <div class="head"><i></i></div>
    {#each Array.from({ length: 8 }, (_, i) => i) as i (i)}
      <div class="row"><i></i><i></i><i></i><i></i><i></i><i></i></div>
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
  /* The same chassis as the table it stands in for: a panel with a hairline, rows separated by
     --border-soft at --s2 padding, and a name column the width of the table's own. A skeleton that
     no longer matches causes the jump it exists to prevent. */
  .skeleton { margin: 0 var(--s4); background: var(--surface); border: 1px solid var(--border);
              border-radius: var(--r-md); box-shadow: var(--shadow-panel); overflow: hidden; }
  .skeleton .head { padding: var(--s2); border-bottom: 2px solid var(--border); }
  /* `min-height: 1lh` in the FIGURE face, not a px height: a table row is 8px of padding, one line
     box, and a 1px hairline — and the line box is the mono cells', because JetBrains Mono's metrics
     are a pixel taller than Inter Tight's at this size and the tallest cell sets the row. Reserving
     it this way rather than as a number means the placeholder follows the face and the type scale
     instead of drifting the moment either moves. Measured without it the skeleton row stood 29px
     against the table's 36px, which is exactly the jump this shape exists to prevent
     (docs/app.md §Decisions). */
  .skeleton .row { display: grid; grid-template-columns: 14rem repeat(5, 1fr); gap: var(--s3);
                   padding: var(--s2); border-bottom: 1px solid var(--border-soft); align-items: center;
                   font-family: var(--font-mono); font-size: var(--t-md); min-height: 1lh; }
  .skeleton .row:last-child { border-bottom: 0; }
  .skeleton i { display: block; height: 12px; border-radius: var(--r-sm); background: var(--border-soft); }
  /* The pulse is the only thing that says "still working"; without motion the bars must simply
     sit there rather than be replaced by a second, animation-free design. */
  @media (prefers-reduced-motion: no-preference) {
    .skeleton i { animation: pulse 1.4s ease-in-out infinite; }
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
</style>
