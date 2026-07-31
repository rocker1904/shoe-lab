<script lang="ts">
  import type { FilterState } from '../lib/filters';
  import { roving } from '../lib/roving';

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

<div class="disc" role="radiogroup" aria-label="Discontinued" use:roving>
  {#each OPTIONS as o (o.label)}
    <button type="button" role="radio" aria-checked={value === o.v} class:on={value === o.v}
            onclick={() => onchange(o.v)}>{o.label}</button>
  {/each}
</div>

<style>
  /* `overflow: visible`, not hidden: the focus ring is a box-shadow (docs/app.md §Theming). */
  .disc { display: flex; background: var(--bg); border: 1px solid var(--border);
          border-radius: var(--r-md); padding: 2px; gap: 2px; overflow: visible; }
  button { flex: 1; padding: var(--s1); border: none; border-radius: var(--r-sm); background: none;
           color: var(--text-dim); cursor: pointer; font-size: var(--t-xs); }
  /* `--accent-solid` carrying `--on-accent`, like the toolbar's pill (docs/app.md §Theming). */
  button.on { background: var(--accent-solid); color: var(--on-accent); font-weight: 600; }
</style>
