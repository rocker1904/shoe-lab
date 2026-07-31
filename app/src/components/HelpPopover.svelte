<script lang="ts">
  import { tick } from 'svelte';
  import { dismissOnOutsidePress } from '../lib/dismiss';

  let { label, body }: { label: string; body: string } = $props();

  let open = $state(false);
  let trigger = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLElement | null>(null);
  /** The trigger and the panel together: a press on the `?` is not an outside press, or the button
   *  could never shut the panel it opened. */
  let anchor = $state<HTMLElement | null>(null);
  /** Pixels to pull the panel left so it stays inside the viewport; see `place` below. */
  let shift = $state(0);

  /**
   * One mechanism on every device, and a click rather than a hover: a `title` tooltip is exactly
   * what this pass removes, and it has no touch path at all (docs/app.md §Presets).
   */
  async function toggle() {
    open = !open;
    if (!open) return;
    await tick();
    place();
    panel?.querySelector('button')?.focus();
  }
  function close() {
    open = false;
    // Focus goes back to what opened the panel, or it lands on `<body>` and the reader loses
    // their place in the strip.
    trigger?.focus();
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    // Stopped because this popover is mounted inside other people's boxes — the toolbar today, a
    // filter row in the plan that puts one on every metric (BACKLOG.md) — and one of those is
    // inside the focus-trapping drawer, which answers Escape itself. One press, one dismissal
    // (docs/app.md §Filters).
    e.stopPropagation();
    close();
  }
  /** Dismissal by pointer is a separate path from `close`, and deliberately does NOT pull focus
   *  back to the `?`: the reader has just pressed something else, and that is where they are
   *  going. Escape and the Close button are the two that hand focus back. */
  $effect(() => {
    if (!open) return;
    return dismissOnOutsidePress(() => anchor, () => (open = false));
  });
  /**
   * Edge-aware in the only direction it can overflow: the panel is anchored to the left of a `?`
   * that may itself be two thirds of the way across the strip. Below 700px it is a bottom sheet,
   * where the offset means nothing — `getBoundingClientRect` reports zeroes in jsdom, so the
   * arithmetic is guarded rather than the environment.
   */
  function place() {
    if (!panel) return;
    const box = panel.getBoundingClientRect();
    const overflow = box.right - (window.innerWidth - 8);
    shift = overflow > 0 ? overflow : 0;
  }
</script>

<span class="anchor" bind:this={anchor}>
  <button type="button" class="q" bind:this={trigger} aria-expanded={open}
          aria-label="About {label}" onclick={toggle}>?</button>
  {#if open}
    <!-- `tabindex="-1"` because Escape is handled here: a key event only reaches this node if
         focus is inside it, and focus starts on the Close button within. -->
    <div class="pop" role="dialog" tabindex="-1" aria-label={label} bind:this={panel}
         style:--shift="{shift}px" onkeydown={onkeydown}>
      <p>{body}</p>
      <button type="button" class="close" onclick={close}>Close</button>
    </div>
  {/if}
</span>

<style>
  .anchor { position: relative; display: inline-flex; }
  .q {
    display: inline-flex; align-items: center; justify-content: center; width: 1.25em; height: 1.25em;
    padding: 0; border: 1px solid var(--border); border-radius: var(--r-full);
    background: var(--surface); color: var(--text-dim); font: inherit; font-size: var(--t-xs); cursor: pointer;
  }
  .q:hover { color: var(--accent); border-color: var(--accent); }
  .pop {
    position: absolute; top: calc(100% + var(--s2)); left: calc(0px - var(--shift)); z-index: 20;
    width: min(24rem, calc(100vw - var(--s6))); padding: var(--s4);
    display: flex; flex-direction: column; gap: var(--s3);
    background: var(--surface); color: var(--text); border: 1px solid var(--border);
    border-radius: var(--r-md); box-shadow: var(--shadow-dialog); text-align: left;
  }
  .pop p { margin: 0; font-size: var(--t-sm); line-height: 1.5; font-weight: 400; }
  .close { align-self: flex-end; padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
           border-radius: var(--r-sm); background: var(--surface); color: var(--text); font: inherit; font-size: var(--t-sm); }
  /* A popover anchored to a card label has nowhere to go on a phone, so the same mechanism lands
     as a bottom sheet instead of growing a second one (docs/app.md §Presets). */
  @media (max-width: 699px) {
    .pop { position: fixed; inset: auto 0 0 0; width: auto; left: 0;
           border-radius: var(--r-md) var(--r-md) 0 0; border-width: 1px 0 0; }
  }
</style>
