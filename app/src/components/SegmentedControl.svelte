<script module lang="ts">
  export type SegmentOption = Readonly<{
    value: string;
    label: string;
    accessibleLabel?: string;
    disabled?: boolean;
  }>;

  type GroupName =
    | { ariaLabel: string; ariaLabelledby?: never }
    | { ariaLabel?: never; ariaLabelledby: string };

  export type SegmentedControlProps =
    | ({
        mode: 'radio';
        options: readonly [SegmentOption, ...SegmentOption[]];
        value: string | null;
        onchange: (value: string) => void;
        scale?: 'compact' | 'toolbar';
        fill?: boolean;
      } & GroupName)
    | {
        mode: 'toggle';
        label: string;
        accessibleLabel?: string;
        pressed: boolean;
        onchange: (pressed: boolean) => void;
        scale?: 'compact' | 'toolbar';
      };
</script>

<script lang="ts">
  import { roving } from '../lib/roving';

  let props: SegmentedControlProps = $props();
</script>

{#if props.mode === 'radio'}
  <span class:toolbar={props.scale === 'toolbar'} class:fill={props.fill}
        class="track" role="radiogroup" aria-label={props.ariaLabel}
        aria-labelledby={props.ariaLabelledby} data-segmented-control use:roving>
    {#each props.options as option (option.value)}
      <button type="button" role="radio" aria-checked={props.value === option.value}
              aria-label={option.accessibleLabel} disabled={option.disabled}
              class:on={props.value === option.value} data-label={option.label} data-segment={option.value}
              onclick={() => props.onchange(option.value)}>{option.label}</button>
    {/each}
  </span>
{:else}
  <span class:toolbar={props.scale === 'toolbar'} class="track" data-segmented-control>
    <button type="button" aria-pressed={props.pressed} aria-label={props.accessibleLabel}
            class:on={props.pressed} data-label={props.label} data-segment
            onclick={() => props.onchange(!props.pressed)}>{props.label}</button>
  </span>
{/if}

<style>
  /* Focus rings sit outside each segment, so the recessed track must never clip them. */
  .track { display: inline-flex; box-sizing: border-box; padding: 2px; gap: 2px;
           background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-md);
           overflow: visible; }
  button { display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
           box-sizing: border-box; min-width: 24px; min-height: 24px;
           padding: 2px var(--s1); border: none; border-radius: var(--r-sm);
           background: none; color: var(--text-dim); cursor: pointer;
           font: inherit; font-size: var(--t-xs); white-space: nowrap; }
  button.on { background: var(--accent-solid); color: var(--on-accent); font-weight: 600; }
  button:disabled { cursor: not-allowed; opacity: 0.5; }
  /* Reserve the selected weight so choosing a segment never redistributes its siblings. */
  button::after { content: attr(data-label); height: 0; overflow: hidden; visibility: hidden;
                  pointer-events: none; font-weight: 600; }
  .toolbar button { font-size: var(--t-sm); }
  .fill { width: 100%; }
  .fill button { flex: 1; }

  @media (hover: none) {
    button { min-height: 32px; }
  }
</style>
