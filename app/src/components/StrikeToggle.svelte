<script lang="ts">
  import type { Side } from '../lib/lineage';

  let { strike, onchange }: { strike: Side; onchange: (s: Side) => void } = $props();

  // A peer of the story chips, in the toolbar: the runner layer applies whether or not a story is
  // chosen, and the band it would otherwise sit in disappears the moment a filter is touched
  // (docs/app.md §Presets).
  const SIDES: { v: Side; label: string }[] = [{ v: 'heel', label: 'Heel' }, { v: 'forefoot', label: 'Forefoot' }];
</script>

<!-- The label is visible, not just an aria-label: two unexplained words beside a Clear button
     read as part of it, and this is the control that states who the runner is. -->
<span class="wrap">
  <span class="lede" id="strike-lede">I land on my</span>
  <span class="strike" role="radiogroup" aria-labelledby="strike-lede">
    {#each SIDES as s (s.v)}
      <button type="button" role="radio" aria-checked={strike === s.v} class:on={strike === s.v}
              onclick={() => onchange(s.v)}>{s.label}</button>
    {/each}
  </span>
</span>

<style>
  .wrap { display: inline-flex; align-items: center; gap: var(--s2); }
  .lede { font-size: var(--t-xs); color: var(--text-dim); white-space: nowrap; }
  .strike { display: inline-flex; border: 1px solid var(--border); border-radius: var(--r-full); overflow: hidden; }
  button { padding: var(--s1) var(--s3); border: none; background: none; color: var(--text-dim); cursor: pointer; font-size: var(--t-sm); }
  button.on { background: var(--accent-dim); color: var(--text); font-weight: 600; }
</style>
