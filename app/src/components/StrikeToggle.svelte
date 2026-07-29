<script lang="ts">
  import type { Side } from '../lib/lineage';

  let { strike, onchange }: { strike: Side; onchange: (s: Side) => void } = $props();

  // A peer of the story pills, in the toolbar: the strike applies whether or not a story is
  // chosen, and the setup strip that carries the visible wording is gone the moment one is
  // (docs/app.md §Presets).
  const SIDES: { v: Side; label: string }[] = [{ v: 'heel', label: 'Heel' }, { v: 'forefoot', label: 'Forefoot' }];
</script>

<!-- No visible lede: the toolbar is two segmented groups in one language, and the setup strip is
     where the question gets asked in words (docs/app.md §Presets). -->
<span class="strike" role="radiogroup" aria-label="Measurements from">
  {#each SIDES as s (s.v)}
    <button type="button" role="radio" aria-checked={strike === s.v} class:on={strike === s.v}
            onclick={() => onchange(s.v)}>{s.label}</button>
  {/each}
</span>

<style>
  .strike { display: inline-flex; border: 1px solid var(--border); border-radius: var(--r-full); overflow: hidden; }
  button { padding: var(--s1) var(--s3); border: none; background: none; color: var(--text-dim); cursor: pointer; font-size: var(--t-sm); }
  button.on { background: var(--accent-dim); color: var(--text); font-weight: 600; }
</style>
