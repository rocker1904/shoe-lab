<script lang="ts">
  import type { Snippet } from 'svelte';

  type CategoricalDisclosureProps = {
    label: string;
    summary: string;
    children: Snippet;
  };

  let { label, summary, children }: CategoricalDisclosureProps = $props();
</script>

<!-- `details` maps to role=group, so it needs a name of its own or it joins the sidebar's range
     groups as an unnamed one. -->
<details aria-label={label}>
  <!-- The marker is drawn instead of inherited from the UA so every categorical disclosure has
       the same affordance (docs/app.md §Filters). -->
  <summary>{summary}
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </summary>
  {@render children()}
</details>

<style>
  summary { cursor: pointer; font-size: var(--t-sm); color: var(--text-dim); list-style: none;
            display: inline-flex; align-items: center; gap: var(--s2); }
  summary::-webkit-details-marker { display: none; }
  details :global(li) { font-size: var(--t-sm); padding: 0.1rem 0; }
  details :global(li.empty) { color: var(--text-dim); }
</style>
