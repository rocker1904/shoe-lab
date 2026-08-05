<script lang="ts" module>
  let nextId = 0;
  let active: { owner: number; close: () => void } | undefined;
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import { dismissOnFocusLeave, dismissOnOutsidePress } from '../lib/dismiss';
  import { metricHelpOf, metricInterpretation } from '../lib/metric-help';

  let { metricKey, label }: { metricKey: string; label: string } = $props();

  const owner = ++nextId;
  const panelId = `metric-help-${owner}`;
  const fact = $derived(metricHelpOf(metricKey));
  const interpretation = $derived(metricInterpretation(metricKey));
  let trigger = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLElement | null>(null);
  let source = $state<HTMLAnchorElement | null>(null);
  let open = $state(false);
  let pinned = $state(false);
  let overTrigger = false;
  let overPanel = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let left = $state(0);
  let top = $state(0);
  let corridorLeft = $state(0);
  let corridorTop = $state(0);
  let corridorWidth = $state(0);
  let corridorHeight = $state(0);

  function close(returnFocus = false) {
    clearTimeout(closeTimer);
    if ((returnFocus || panel?.contains(document.activeElement)) && document.activeElement !== trigger) {
      trigger?.focus();
    }
    open = false;
    pinned = false;
    if (active?.owner === owner) active = undefined;
  }

  function reveal(pin: boolean) {
    clearTimeout(closeTimer);
    if (!open) {
      active?.close();
      active = { owner, close: () => close() };
      open = true;
    }
    if (pin) pinned = true;
  }

  function togglePin() {
    if (pinned) close();
    else reveal(true);
  }

  const containsFocus = () =>
    [trigger, panel].some((node) => node?.contains(document.activeElement));

  function schedulePreviewClose() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (!pinned && !overTrigger && !overPanel && !containsFocus()) close();
    }, 80);
  }

  function place() {
    if (!trigger || !panel) return;
    const edge = 8;
    const gap = 8;
    const anchor = trigger.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    // WebKit can expose the newly shown top-layer box as 0×0 for its first focus event. The
    // measured catalogue maximum is 154px; this first-frame allowance keeps collision selection
    // safe until ResizeObserver supplies the real box on the next layout.
    const panelWidth = box.width || panel.offsetWidth || Math.min(288, window.innerWidth - edge * 2);
    const panelHeight = Math.max(box.height, panel.offsetHeight, panel.scrollHeight, 160);
    const renderedPanelHeight = box.height || panel.offsetHeight || panel.scrollHeight || panelHeight;
    const placedLeft = Math.min(
      Math.max(edge, anchor.left + anchor.width / 2 - panelWidth / 2),
      Math.max(edge, window.innerWidth - edge - panelWidth),
    );
    const below = anchor.bottom + gap;
    const above = anchor.top - gap - panelHeight;
    const roomBelow = window.innerHeight - edge - below;
    const roomAbove = anchor.top - gap - edge;
    const placedTop = panelHeight <= roomBelow || roomBelow >= roomAbove
      ? Math.min(below, Math.max(edge, window.innerHeight - edge - panelHeight))
      : Math.max(edge, above);
    left = placedLeft;
    top = placedTop;
    corridorLeft = Math.min(anchor.left, placedLeft);
    corridorWidth = Math.max(anchor.right, placedLeft + panelWidth) - corridorLeft;
    if (placedTop >= anchor.bottom) {
      corridorTop = anchor.bottom;
      corridorHeight = placedTop - anchor.bottom;
    } else {
      corridorTop = placedTop + renderedPanelHeight;
      corridorHeight = Math.max(0, anchor.top - corridorTop);
    }
  }

  $effect(() => {
    if (!open || !panel) return;
    const surface = panel;
    surface.showPopover();
    place();
    const firstLayout = requestAnimationFrame(place);
    const reposition = () => place();
    const enter = () => { overPanel = true; clearTimeout(closeTimer); };
    const leave = () => { overPanel = false; schedulePreviewClose(); };
    const resize = new ResizeObserver(place);
    const mutations = new MutationObserver(place);
    resize.observe(surface);
    if (trigger) resize.observe(trigger);
    mutations.observe(document.body, { childList: true, subtree: true, characterData: true });
    surface.addEventListener('pointerenter', enter);
    surface.addEventListener('pointerleave', leave);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      surface.removeEventListener('pointerenter', enter);
      surface.removeEventListener('pointerleave', leave);
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(firstLayout);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      surface.hidePopover();
    };
  });

  $effect(() => {
    if (!open || !panel) return;
    const boundary = () => [trigger, panel].filter((node): node is HTMLElement => node !== null);
    const dismiss = () => close();
    const stops = [dismissOnOutsidePress(boundary, dismiss), dismissOnFocusLeave(boundary, dismiss)];
    return () => stops.forEach((stop) => stop());
  });

  function onkeydown(event: KeyboardEvent) {
    if (!open) return;
    // WebKit scrolls the sidebar DOM ancestor when Tab focuses a link in its top-layer descendant,
    // even though that ancestor cannot clip the popover. Move this one step explicitly so the
    // anchor and collision direction remain still.
    if (event.key === 'Tab' && !event.shiftKey && event.currentTarget === trigger && source) {
      event.preventDefault();
      // The trigger's delegated focus scroll may only have reached layout after the opening effect.
      // Re-read that settled anchor before moving focus into the independent top layer.
      place();
      source.focus({ preventScroll: true });
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  }

  onDestroy(() => {
    clearTimeout(closeTimer);
    if (active?.owner === owner) active = undefined;
  });
</script>

{#if fact}
  <span class="metric-help">
    <button bind:this={trigger} type="button" aria-label={`Help for ${label}`}
            aria-expanded={open} aria-controls={panelId}
            onfocus={() => reveal(false)} onclick={togglePin} onkeydown={onkeydown}
            onpointerenter={() => { overTrigger = true; reveal(false); }}
            onpointerleave={() => { overTrigger = false; schedulePreviewClose(); }}>?</button>
    {#if open}
      <aside bind:this={panel} id={panelId} class="panel" popover="manual" role="note"
             aria-label={`${label} metric help`} style:left={`${left}px`} style:top={`${top}px`}>
        <span class="hover-corridor" aria-hidden="true"
              style:left={`${corridorLeft}px`} style:top={`${corridorTop}px`}
              style:width={`${corridorWidth}px`} style:height={`${corridorHeight}px`}></span>
        <p>{fact.text}</p>
        <p class="interpretation">{interpretation}</p>
        {#if fact.source}
          <a bind:this={source} href={fact.source.href} target="_blank" rel="noopener"
             onkeydown={onkeydown}>{fact.source.label} ↗</a>
        {/if}
      </aside>
    {/if}
  </span>
{/if}

<style>
  .metric-help { display: inline-flex; flex: none; vertical-align: middle; }
  button { display: inline-flex; align-items: center; justify-content: center; width: 1.15rem;
           height: 1.15rem; padding: 0; border: 1px solid var(--border); border-radius: 50%;
           background: var(--surface); color: var(--text-dim); font: 650 var(--t-xs)/1 var(--font-ui);
           cursor: help; }
  button:hover { color: var(--text); border-color: var(--accent); background: var(--accent-dim); }
  .panel { position: fixed; inset: auto; box-sizing: border-box; width: min(18rem, calc(100vw - 16px));
           margin: 0; padding: var(--s3);
           border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface);
           color: var(--text); box-shadow: var(--shadow-dialog); font-size: var(--t-sm);
           line-height: 1.4; text-align: left; }
  .hover-corridor { position: fixed; }
  .panel:popover-open { display: flex; flex-direction: column; gap: var(--s2); }
  p { margin: 0; }
  .interpretation { color: var(--text-dim); }
  a { width: fit-content; color: var(--accent); }
</style>
