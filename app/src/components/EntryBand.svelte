<script module lang="ts">
  /** Id of the element Page.svelte wraps the table in, so Browse all has somewhere to send the
   *  reader. It carries `tabindex="-1"`: `.focus()` on a plain container is a silent no-op. */
  export const TABLE_ANCHOR_ID = 'shoe-table';
</script>

<script lang="ts">
  import { PRESETS } from '../lib/presets';

  let { counts, total, onapply, selected }: {
    counts: Map<string, number>; total: number; onapply: (id: string) => void;
    /** Derived in `Page.svelte`, never stored: a story is selected while the view equals what
     *  `applyPreset` would build for it right now (docs/app.md §Presets). */
    selected: string | null;
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
    <!-- The sentence stays on the type and reaches the reader as a tooltip: the cards exist to make
         three counts comparable, and three paragraphs is what stopped that reading at a glance. -->
    <button type="button" class="card" title={p.describe} aria-pressed={selected === p.id}
            class:on={selected === p.id} onclick={() => onapply(p.id)}>
      <span class="name">{p.label}</span>
      <span class="count">{shoes(counts.get(p.id) ?? 0)}</span>
    </button>
  {/each}
  <button type="button" class="card browse" onclick={browseAll}>
    <span class="name">Browse all {shoes(total)}</span>
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
  /* Not colour alone: the selected card is also the only one carrying aria-pressed. */
  .card.on { border-color: var(--accent); border-width: 2px; background: var(--accent-dim); }
  .name { font-size: 1.15rem; font-weight: 700; }
  .count { font-weight: 600; color: var(--accent); }
  /* An escape hatch that reads as a lesser option is not an escape hatch: same size, same weight,
     distinguished only by a dashed edge. */
  .browse { border-style: dashed; }
</style>
