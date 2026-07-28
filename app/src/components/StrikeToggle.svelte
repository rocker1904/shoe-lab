<script lang="ts">
  import type { Side } from '../lib/lineage';

  let { strike, onchange }: { strike: Side; onchange: (s: Side) => void } = $props();

  // A peer of the story chips, in the toolbar: the runner layer applies whether or not a story is
  // chosen, and the band it would otherwise sit in disappears the moment a filter is touched
  // (docs/app.md §Presets).
  const SIDES: { v: Side; label: string }[] = [{ v: 'heel', label: 'Heel' }, { v: 'forefoot', label: 'Forefoot' }];
</script>

<div class="strike" role="radiogroup" aria-label="I land on my">
  {#each SIDES as s (s.v)}
    <button type="button" role="radio" aria-checked={strike === s.v} class:on={strike === s.v}
            onclick={() => onchange(s.v)}>{s.label}</button>
  {/each}
</div>

<style>
  .strike { display: flex; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
  button { padding: 0.25rem 0.75rem; border: none; background: none; color: var(--text-dim); cursor: pointer; font-size: 0.85rem; }
  button.on { background: var(--accent-dim); color: var(--text); font-weight: 600; }
</style>
