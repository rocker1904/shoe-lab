<script lang="ts">
  import { onMount } from 'svelte';

  let { onclose }: { onclose: () => void } = $props();

  let panel = $state<HTMLElement | null>(null);
  let closeBtn = $state<HTMLButtonElement | null>(null);

  /** Mounted on `<body>`: nested in the pinned chrome its z-index would be measured against that
   *  sticky ancestor's children rather than the page (docs/app.md §Stacking order). */
  function toBody(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  onMount(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Close rather than the credit link: this panel is prose with two stops in it, and the one a
    // reader arrives wanting is the way out. Landing on the link would put a keyboard user one Tab
    // from leaving the page instead.
    closeBtn?.focus();
    return () => opener?.focus();
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      // Not stopped: this node lives in `<body>`, so the filter drawer's key handler is not on its
      // bubble path and there is no second dismissal to suppress.
      onclose();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...(panel?.querySelectorAll<HTMLElement>('a, button') ?? [])];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" data-testid="about-scrim" onclick={onclose} use:toBody></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label="About this table"
     onkeydown={onkeydown} bind:this={panel} use:toBody>
  <h2>About this table</h2>
  <!-- The body scrolls and the title and foot do not, so Close is reachable without scrolling to
       it — the panel is prose read whole rather than a list scrolled through. -->
  <div class="body">
    <p class="lede">Shoe Lab compares running shoes on RunRepeat's lab tests.</p>

    <section>
      <h3>Measured at</h3>
      <p>Stack, energy return, shock absorption and midsole width are measured at the heel and at
        the forefoot. Pick which end the table and scoring use — usually the one you land on.</p>
    </section>

    <section>
      <h3>Easy, Tempo and Race</h3>
      <ul>
        <li>Each score transforms and weights the lab metrics that matter for that kind of run, and
          sets the columns to match. All clears them.</li>
        <li>Price and release date are not factored in.</li>
        <li>Expand a row for the breakdown. A shoe missing a metric is unscored, and sorts last.</li>
        <li>The RunRepeat Score column is their verdict, not ours.</li>
      </ul>
    </section>

    <section>
      <h3>Stability</h3>
      <p>Adds midsole width and heel counter stiffness to the Easy and Tempo scores. Not Race: race
        shoes are all tall and narrow.</p>
    </section>
  </div>
  <div class="foot">
    <a href="https://runrepeat.com/catalog/running-shoes" rel="noopener" target="_blank">Lab data by RunRepeat ↗</a>
    <button type="button" class="close" onclick={onclose} bind:this={closeBtn}>Close</button>
  </div>
</div>

<style>
  /* Same layer as the add-filter dialog, for the same reason: over the filter drawer's 30, under
     the skip link's 40 (docs/app.md §Stacking order). `border-box` is load-bearing — `92vw` is
     meant to be the whole dialog, and measured content-box the padding and border land on top of
     it and clip both corners off a 360px screen. */
  .dialog {
    position: fixed; inset: 50% auto auto 50%; transform: translate(-50%, -50%); z-index: 35;
    box-sizing: border-box;
    display: flex; flex-direction: column; gap: var(--s3); width: min(28rem, 92vw); max-height: 80vh;
    padding: var(--s4); background: var(--surface); color: var(--text);
    border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--shadow-dialog);
  }
  .scrim { position: fixed; inset: 0; z-index: 32; background: var(--scrim); }
  @media (prefers-reduced-motion: no-preference) {
    .scrim { animation: fade 200ms ease-out; }
  }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  h2 { margin: 0; font-size: var(--t-lg); }
  .body { overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: var(--s2); }
  section { display: flex; flex-direction: column; gap: 3px; }
  h3 { margin: 0; font-size: var(--t-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-dim); }
  p { margin: 0; font-size: var(--t-sm); line-height: 1.5; }
  .lede { color: var(--text-dim); }
  ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--s1); }
  li { font-size: var(--t-sm); line-height: 1.45; padding-left: 13px; position: relative; }
  li::before { content: ''; position: absolute; left: 3px; top: 8px; width: 4px; height: 4px;
               border-radius: var(--r-full); background: var(--divider); }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: var(--s3);
          border-top: 1px solid var(--border-soft); padding-top: var(--s3); }
  .foot a { font-size: var(--t-xs); color: var(--text-dim); text-decoration: none; }
  .foot a:hover { color: var(--accent); }
  .close { padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
           border-radius: var(--r-sm); background: var(--surface); color: var(--text);
           font: inherit; font-size: var(--t-sm); }
  .close:hover { background: var(--accent-dim); }
</style>
