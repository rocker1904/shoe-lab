<script lang="ts">
  import type { Zone } from '../lib/lineage';
  import SegmentedControl, { type SegmentOption } from './SegmentedControl.svelte';

  let { zone, onchange }: {
    /** Derived in `Page.svelte`, never stored: null once the view names both halves or neither,
     *  exactly as the story mark is null once the view is no story (docs/app.md §Presets). */
    zone: Zone | null; onchange: (s: Zone) => void;
  } = $props();

  // A peer of the story pills, in the toolbar: the zone applies whether or not a story is
  // chosen, and the setup strip that carries the visible wording is gone the moment one is
  // (docs/app.md §Presets).
  const ZONES = [
    { value: 'heel', label: 'Heel' },
    { value: 'forefoot', label: 'Forefoot' },
  ] satisfies readonly [SegmentOption, ...SegmentOption[]];
</script>

<!-- No visible lede: the toolbar is two segmented groups in one language, and the setup strip is
     where the question gets asked in words (docs/app.md §Presets). -->
<SegmentedControl mode="radio" options={ZONES} value={zone}
                  onchange={(value) => onchange(value as Zone)} ariaLabel="Measured at"
                  scale="toolbar" />
