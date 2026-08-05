<script lang="ts">
  import type { FilterState } from '../lib/filters';
  import SegmentedControl, { type SegmentOption } from './SegmentedControl.svelte';

  let { value, onchange }: {
    value: FilterState['discontinued']; onchange: (v: FilterState['discontinued']) => void;
  } = $props();

  const OPTIONS = [
    { value: 'any', label: 'Any' },
    { value: 'hide', label: 'Hide', accessibleLabel: 'Hide discontinued' },
    { value: 'only', label: 'Only', accessibleLabel: 'Only discontinued' },
  ] satisfies readonly [SegmentOption, ...SegmentOption[]];
</script>

<SegmentedControl mode="radio" options={OPTIONS} value={value ?? 'any'}
                  onchange={(next) => onchange(next === 'any' ? undefined : next as 'hide' | 'only')}
                  ariaLabel="Discontinued" fill />
