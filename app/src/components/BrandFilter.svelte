<script lang="ts">
  let { counts, selected, onchange }: {
    counts: Map<string, number>; selected: string[]; onchange: (brands: string[]) => void;
  } = $props();

  let query = $state('');
  const brands = $derived([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? brands.filter(([b]) => b.toLowerCase().includes(q)) : brands;
  });
  function toggle(brand: string) {
    onchange(selected.includes(brand) ? selected.filter((b) => b !== brand) : [...selected, brand]);
  }
</script>

<!-- `details` maps to role=group, so it needs a name of its own or it joins the sidebar's
     range groups as an unnamed one. -->
<details aria-label="Brand">
  <!-- Marker suppressed and drawn instead, exactly as `ColumnPicker.svelte` does it: the two are the
       only `<details>` in the app, and one of them showing the UA triangle read as an oversight. -->
  <summary>{selected.length ? `${selected.length} selected` : 'Any brand'}
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </summary>
  <!-- The whole fleet's brands in a 14rem scroll box is a list you scroll rather than read. -->
  <input class="q" type="search" aria-label="Search brands" placeholder="Search brands…" bind:value={query} />
  <ul class="scrollport">
    {#each shown as [brand, n] (brand)}
      <!-- A brand at zero stays, greyed and still clickable: the list must not reflow under the
           cursor, and a 0 is an answer (docs/app.md §Filters). -->
      <li class:empty={n === 0}>
        <label><input type="checkbox" checked={selected.includes(brand)} onchange={() => toggle(brand)} /> {brand} ({n})</label>
      </li>
    {/each}
  </ul>
  {#if shown.length === 0}<p class="none">No brands match “{query}”.</p>{/if}
</details>

<style>
  summary { cursor: pointer; font-size: var(--t-sm); color: var(--text-dim); list-style: none;
            display: inline-flex; align-items: center; gap: var(--s2); }
  summary::-webkit-details-marker { display: none; }
  .q { width: 100%; box-sizing: border-box; margin-top: var(--s1); padding: var(--s1) var(--s2);
       border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface); color: var(--text); font-size: var(--t-sm); }
  /* The touch tier pays 16px for the reason `RangeFilter.svelte` states and docs/app.md §Filters
     owns: this box lives inside the drawer, so it is one of the four that has to. */
  @media (hover: none) {
    .q { font-size: 16px; }
  }
  /* `.scrollport` in `app.css` reserves the focus ring's room; the negative inline margin gives it
     back to the section's own padding, so the rows stay flush with the search box above them
     (docs/app.md §Theming). */
  ul { list-style: none; margin: var(--s1) calc(-1 * var(--ring-room)) 0; max-height: 14rem;
       overflow-y: auto; }
  li { font-size: var(--t-sm); padding: 0.1rem 0; }
  li.empty { color: var(--text-dim); }
  .none { margin: var(--s2) 0 0; font-size: var(--t-xs); color: var(--text-dim); }
</style>
