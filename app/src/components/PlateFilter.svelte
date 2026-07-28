<script lang="ts">
  import type { Plate } from '../../../shared/types.js';
  import { PLATES } from '../lib/urlstate';

  let { value, onchange }: { value: Plate[] | undefined; onchange: (v: Plate[] | undefined) => void } = $props();

  /** `plated-other` is never shown to a human under its dataset name (docs/app.md §Columns and sorting). */
  const LABELS: Record<Plate, string> = { none: 'None', 'plated-other': 'Non-carbon plate', carbon: 'Carbon' };

  function toggle(p: Plate) {
    const held = new Set(value ?? []);
    if (held.has(p)) held.delete(p);
    else held.add(p);
    // Emitted in declared order rather than click order: a selection is compared to a story's by
    // value, so `[carbon, none]` would never equal the `[none, carbon]` a preset builds.
    const next = PLATES.filter((x) => held.has(x));
    onchange(next.length ? next : undefined);
  }
</script>

<div class="plates" role="group" aria-label="Plate">
  {#each PLATES as p (p)}
    <label><input type="checkbox" checked={value?.includes(p) ?? false} onchange={() => toggle(p)} /> {LABELS[p]}</label>
  {/each}
</div>

<style>
  .plates { display: flex; flex-direction: column; gap: 0.15rem; }
  label { font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }
</style>
