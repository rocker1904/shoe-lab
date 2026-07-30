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
  .zone { display: inline-flex; border: 1px solid var(--border); border-radius: var(--r-full); overflow: hidden; }
  button { padding: var(--s1) var(--s3); border: none; background: none; color: var(--text-dim); cursor: pointer; font-size: var(--t-sm); }
  button.on { background: var(--accent-dim); color: var(--text); font-weight: 600; }
</style>
