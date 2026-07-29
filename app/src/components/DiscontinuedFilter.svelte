<script lang="ts">
  import type { FilterState } from '../lib/filters';

  let { value, onchange }: {
    value: FilterState['discontinued']; onchange: (v: FilterState['discontinued']) => void;
  } = $props();

  // A radiogroup rather than the checkboxes plate uses: these three are genuinely exclusive
  // (docs/app.md §Filters). Buttons rather than native inputs, so two rendered copies cannot
  // join one document-wide radio group by sharing a `name`.
  const OPTIONS = [
    { v: undefined, label: 'Any' },
    { v: 'hide', label: 'Hide discontinued' },
    { v: 'only', label: 'Only discontinued' },
  ] as const;
</script>

<div class="disc" role="radiogroup" aria-label="Discontinued">
  {#each OPTIONS as o (o.label)}
    <button type="button" role="radio" aria-checked={value === o.v} class:on={value === o.v}
            onclick={() => onchange(o.v)}>{o.label}</button>
  {/each}
</div>

<style>
  .disc { display: flex; border: 1px solid var(--border); border-radius: var(--r-sm); overflow: hidden; }
  button { flex: 1; padding: var(--s1); border: none; background: var(--surface); color: var(--text-dim); cursor: pointer; font-size: var(--t-xs); }
  button.on { background: var(--accent-dim); color: var(--text); font-weight: 600; }
</style>
