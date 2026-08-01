<script lang="ts">
  import type { Zone } from '../lib/lineage';
  import { roving } from '../lib/roving';

  let { zone, onchange }: {
    /** Derived in `Page.svelte`, never stored: null once the view names both halves or neither,
     *  exactly as the story mark is null once the view is no story (docs/app.md §Presets). */
    zone: Zone | null; onchange: (s: Zone) => void;
  } = $props();

  // A peer of the story pills, in the toolbar: the zone applies whether or not a story is
  // chosen, and the setup strip that carries the visible wording is gone the moment one is
  // (docs/app.md §Presets).
  const ZONES: { v: Zone; label: string }[] = [{ v: 'heel', label: 'Heel' }, { v: 'forefoot', label: 'Forefoot' }];
</script>

<!-- No visible lede: the toolbar is two segmented groups in one language, and the setup strip is
     where the question gets asked in words (docs/app.md §Presets). -->
<span class="zone" role="radiogroup" aria-label="Measured at" use:roving>
  {#each ZONES as s (s.v)}
    <button type="button" role="radio" aria-checked={zone === s.v} class:on={zone === s.v}
            onclick={() => onchange(s.v)}>{s.label}</button>
  {/each}
</span>

<style>
  /* `overflow: visible`, not hidden: the focus ring is a box-shadow (docs/app.md §Theming). */
  .zone { display: inline-flex; background: var(--bg); border: 1px solid var(--border);
          border-radius: var(--r-md); padding: 2px; gap: 2px; overflow: visible; }
  button { padding: var(--s1) var(--s3); border: none; border-radius: var(--r-sm); background: none;
           color: var(--text-dim); cursor: pointer; font-size: var(--t-sm); }
  /* `--accent-solid` carrying `--on-accent`, like the toolbar's pill (docs/app.md §Theming). */
  button.on { background: var(--accent-solid); color: var(--on-accent); font-weight: 600; }
  /* The bar steps every pill on its setup row at both of its boundaries, and this group's buttons
     are two of them — but their padding is authored here, so `Toolbar.svelte`'s `.s` rule has never
     reached them. Stated twice because Svelte's scoping gives it no choice; the numbers and the
     reasons are docs/app.md §The chrome bands', and a zone pill left a step behind its neighbours
     is one group padded differently from the two it stands with. */
  @media (max-width: 800px) {
    button { padding-inline: var(--s2); }
  }
  @media (max-width: 429.98px) {
    button { padding-inline: var(--s1); }
  }
</style>
