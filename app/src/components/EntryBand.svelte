<script module lang="ts">
  /** Id of the element Page.svelte wraps the table in, so Browse all has somewhere to send the
   *  reader. It carries `tabindex="-1"`: `.focus()` on a plain container is a silent no-op. */
  export const TABLE_ANCHOR_ID = 'shoe-table';
</script>

<script lang="ts">
  import { PRESETS } from '../lib/presets';

  let { counts, total, onapply }: {
    counts: Map<string, number>; total: number; onapply: (id: string) => void;
  } = $props();

  const shoes = (n: number) => `${n} ${n === 1 ? 'shoe' : 'shoes'}`;

  function browseAll() {
    // Deliberately changes no state, and that is not an oversight. The default view already shows
    // every shoe, so there is nothing to apply; and the band cannot collapse itself, because the
    // collapse is derived from view state alone (docs/app.md §Presets) — doing it here would need
    // a stored dismissal flag the design rules out. Do not "fix" this into a filter.
    const table = document.getElementById(TABLE_ANCHOR_ID);
    table?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // preventScroll or focus() jumps instantly and cancels the smooth scroll above.
    table?.focus({ preventScroll: true });
  }
</script>

<section class="band" aria-label="Start with a session" data-testid="entry-band">
  {#each PRESETS as p (p.id)}
    <button type="button" class="card" onclick={() => onapply(p.id)}>
      <span class="name">{p.label}</span>
      <span class="describe">{p.describe}</span>
      <span class="count">{shoes(counts.get(p.id) ?? 0)}</span>
    </button>
  {/each}
  <button type="button" class="card browse" onclick={browseAll}>
    <span class="name">Browse all {shoes(total)}</span>
    <span class="describe">Set your own bounds — every filter is already there</span>
  </button>
</section>

<style>
  .band { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.75rem; padding: 1rem 0 1.25rem; }
  .card {
    display: flex; flex-direction: column; gap: 0.35rem; text-align: left; cursor: pointer;
    padding: 0.9rem 1rem; border: 1px solid var(--border); border-radius: 10px;
    background: var(--surface); color: var(--text); font: inherit;
  }
  .card:hover { border-color: var(--accent); background: var(--accent-dim); }
  .card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .name { font-size: 1.15rem; font-weight: 700; }
  .describe { color: var(--text-dim); font-size: 0.85rem; flex: 1; }
  .count { font-weight: 600; color: var(--accent); }
  /* An escape hatch that reads as a lesser option is not an escape hatch: same size, same weight,
     distinguished only by a dashed edge. */
  .browse { border-style: dashed; }
</style>
