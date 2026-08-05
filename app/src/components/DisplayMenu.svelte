<script lang="ts">
  import { dismissOnFocusLeave, dismissOnOutsidePress } from '../lib/dismiss';
  import { DISPLAY_BOUNDS } from '../lib/display';
  import { THEMES, type Theme } from '../lib/theme';
  import { DISPLAY_DEFAULTS, type DisplayPrefs, type ResolvedWash } from '../lib/wash';
  import { ICON_PATHS } from './icons';
  import SegmentedControl, { type SegmentOption } from './SegmentedControl.svelte';

  let { prefs, resolved, onchange, theme, ontheme, worded, open, onopen }: {
    prefs: DisplayPrefs;
    /** Resolved once per change in `Page.svelte`: the panel reports the guard, it does not run it. */
    resolved: ResolvedWash;
    onchange: (p: DisplayPrefs) => void;
    theme: Theme;
    ontheme: (t: Theme) => void;
    /** The masthead band spells the control out; the toolbar band draws it
     *  (docs/app.md §Where the utilities live). */
    worded: boolean;
    /**
     * Whether the panel is up — the CALLER's state, not this component's. The utilities snippet
     * changes host at the chrome boundary, so this component is destroyed and rebuilt on a
     * crossing and anything it owned locally would die with it: a runner who rotated a phone with
     * the panel open watched it shut itself (docs/app.md §Where the utilities live).
     */
    open: boolean;
    onopen: (next: boolean) => void;
  } = $props();

  /**
   * A button and a conditional panel, not a `<details>` like the column picker's. Two reasons, and
   * the second is the one that decided it: `<summary>` has no implicit ARIA role, so no role query
   * ever matches it however it is labelled (docs/app.md §Where the utilities live) — and this
   * control stands among `Copy link` and `Export CSV`, which are buttons. And a closed `<details>`
   * still renders its children, where nothing invisible may pay for itself
   * (docs/app.md §What a drag may recompute): eleven controls and two swatches is not free.
   */
  let box = $state<HTMLElement | null>(null);
  let trigger = $state<HTMLElement | null>(null);

  // Guarded on the whole control, so the trigger is INSIDE for both dismissals: its press is left
  // to the toggle below rather than closing and immediately reopening, and Escape's hand-back of
  // focus to it is not a departure. `lib/dismiss.ts` owns the rest.
  $effect(() => {
    if (!open) return;
    const stops = [dismissOnOutsidePress(() => box, () => onopen(false)),
                   dismissOnFocusLeave(() => box, () => onopen(false))];
    return () => stops.forEach((s) => s());
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !open) return;
    onopen(false);
    // Back to the trigger, or focus lands on `<body>` and a keyboard user loses the bar.
    trigger?.focus();
  }

  const set = (patch: Partial<DisplayPrefs>) => onchange({ ...prefs, ...patch });
  const num = (e: Event) => +(e.currentTarget as HTMLInputElement).value;

  const THEME_WORD: Record<Theme, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  const THEME_OPTIONS = (THEMES.map((value) => ({ value, label: THEME_WORD[value] })) as
    [SegmentOption, ...SegmentOption[]]);
  // The floor says where the ramp starts, and with the base on there is no bare end to start from.
  // Disabled rather than hidden: a control that vanishes reads as a bug, and the panel is a place
  // where "this does nothing here" is worth saying (docs/app.md §The display preferences).
  const floorOff = $derived(prefs.baseOn);
</script>

<svelte:window onkeydown={onkeydown} />

<span class="display" bind:this={box}>
  <button type="button" bind:this={trigger} class:icon={!worded} data-testid="display-trigger"
          aria-expanded={open} aria-haspopup="true" aria-label="Display"
          title={worded ? undefined : 'Display'} onclick={() => onopen(!open)}>
    {#if worded}Display{:else}
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d={ICON_PATHS.displayRails} stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        <path d={ICON_PATHS.displayGrips} stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
    {/if}
  </button>

  {#if open}
    <!-- Anchored, non-modal and with no scrim, because the live preview IS the control: the table
         has to stay visible and repaint as a grip moves (docs/app.md §The display preferences). -->
    <div class="panel" role="group" aria-label="Display settings">
      <div class="head">
        <h2>Display</h2>
        <button type="button" class="link" onclick={() => onchange({ ...DISPLAY_DEFAULTS })}>Reset</button>
      </div>

      <div class="body scrollport">
        <!-- The app's segmented language, exactly as the toolbar's zone and story groups draw it:
             one tab stop, arrows move AND activate, `aria-checked` carries the state
             (docs/app.md §Theming). Three named pills rather than a cycle — a cycle makes the
             runner press twice to reach the third state and never says what the other two are. -->
        <div class="row theme">
          <span class="lbl" id="d-theme">Theme</span>
          <span class="theme-control">
            <SegmentedControl mode="radio" options={THEME_OPTIONS} value={theme}
                              onchange={(value) => ontheme(value as Theme)} ariaLabelledby="d-theme" />
          </span>
        </div>

        <!-- One colour, and it is the app's: the tint the leaders carry AND the accent family the
             chrome is drawn in, derived per theme with every token's lightness solved against its
             own contract (docs/app.md §Theming). -->
        <fieldset>
          <legend>Primary colour <span class="swatch better"></span></legend>
          <div class="row">
            <label for="d-bh">Hue</label>
            <input id="d-bh" class="hue" type="range" min="0" max="360" step="1"
                   value={prefs.primaryHue} oninput={(e) => set({ primaryHue: num(e) })} />
            <output for="d-bh">{Math.round(prefs.primaryHue)}°</output>
          </div>
          <div class="row">
            <label for="d-bc">Vividness</label>
            <input id="d-bc" type="range" min={DISPLAY_BOUNDS.primaryChroma[0]}
                   max={DISPLAY_BOUNDS.primaryChroma[1]} step="0.001"
                   value={prefs.primaryChroma} oninput={(e) => set({ primaryChroma: num(e) })} />
            <output for="d-bc">{prefs.primaryChroma.toFixed(3)}</output>
          </div>
        </fieldset>

        <fieldset>
          <legend>Base colour {#if prefs.baseOn}<span class="swatch base"></span>{/if}</legend>
          <label class="check">
            <input type="checkbox" checked={prefs.baseOn} onchange={(e) => set({ baseOn: e.currentTarget.checked })} />
            <span>Tint every ranked cell</span>
          </label>
          {#if prefs.baseOn}
            <div class="row">
              <label for="d-ah">Hue</label>
              <input id="d-ah" class="hue" type="range" min="0" max="360" step="1"
                     value={prefs.baseHue} oninput={(e) => set({ baseHue: num(e) })} />
              <output for="d-ah">{Math.round(prefs.baseHue)}°</output>
            </div>
            <div class="row">
              <label for="d-ac">Vividness</label>
              <input id="d-ac" type="range" min={DISPLAY_BOUNDS.baseChroma[0]}
                     max={DISPLAY_BOUNDS.baseChroma[1]} step="0.001"
                     value={prefs.baseChroma} oninput={(e) => set({ baseChroma: num(e) })} />
              <output for="d-ac">{prefs.baseChroma.toFixed(3)}</output>
            </div>
          {/if}
        </fieldset>

        <fieldset>
          <legend>Curve</legend>
          <div class="row">
            <label for="d-s">Strength</label>
            <input id="d-s" type="range" min="0" max="1" step="0.01"
                   value={prefs.strength} oninput={(e) => set({ strength: num(e) })} />
            <output for="d-s">{prefs.strength.toFixed(2)}</output>
          </div>
          <div class="row">
            <label for="d-c">Emphasis</label>
            <input id="d-c" type="range" min={DISPLAY_BOUNDS.curve[0]} max={DISPLAY_BOUNDS.curve[1]} step="0.05"
                   value={prefs.curve} oninput={(e) => set({ curve: num(e) })} />
            <output for="d-c">{prefs.curve.toFixed(2)}</output>
          </div>
          <div class="row" class:off={floorOff}>
            <label for="d-f">Starts at</label>
            <input id="d-f" type="range" min="0" max={DISPLAY_BOUNDS.floor[1]} step="0.01" disabled={floorOff}
                   value={prefs.floor} oninput={(e) => set({ floor: num(e) })} />
            <output for="d-f">{floorOff ? '—' : `p ${prefs.floor.toFixed(2)}`}</output>
          </div>
        </fieldset>

        <!-- Text, never a live region: a grip emits sixty changes a second and the range input
             already speaks its own value (docs/app.md §The display preferences). -->
        {#if resolved.capped}
          <p class="note">Capped at <span class="mono">{resolved.cap.toFixed(2)}</span> for this colour
            — the {resolved.binding} theme's ink binds first.</p>
        {/if}
        {#if resolved.hueOnly}
          <p class="note warn">Every cell is the same lightness here, so only hue says which is better.</p>
        {/if}
      </div>
    </div>
  {/if}
</span>

<style>
  .display { position: relative; display: inline-flex; }
  /* The trigger is one of the utilities and takes their treatment from `Page.svelte`'s scope, which
     does not reach in here — so the one secondary-button treatment is restated
     (docs/app.md §Theming). The three beside it are one flex row; this one owns a panel, so it
     needs a containing block of its own and cannot be a bare button in that row. */
  .display > button { padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
                      background: var(--surface); color: var(--text); border-radius: var(--r-sm);
                      font-size: var(--t-sm); font-family: inherit; }
  .display > button:hover { background: var(--accent-dim); }
  .display > button.icon { display: inline-flex; align-items: center; justify-content: center; }

  /* Sized against the VIEWPORT and border-box, so an anchored panel can never be wider than the
     screen it hangs in — the failure the column picker shipped once and the reason its geometry is
     measured at every width now (docs/app.md §Stacking order). `--s5` of air, not `--s4`: the
     trigger is inset from the edge already, and the panel is right-anchored to it. */
  .panel { position: absolute; top: calc(100% + var(--s2)); right: 0; z-index: 10;
           box-sizing: border-box; width: min(20rem, calc(100vw - var(--s5)));
           background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md);
           box-shadow: var(--shadow-dialog); padding: var(--s3);
           display: flex; flex-direction: column; gap: var(--s2); text-align: left; }
  /* The SCROLLPORT is the body rather than the panel, and that is not arrangement: `:where(.scrollport)`
     carries zero specificity by design, so any padding this component set on the same element would
     silently delete the ring's reservation. The head stays still above it, which also keeps `Reset`
     reachable from a ramp that has been dragged somewhere unreadable
     (docs/app.md §Theming). The negative margin gives the 4px back to the panel's own padding, so
     nothing moved on screen. */
  /* The inline-end pair is the SCROLLBAR's room, not the ring's, and it is the same reservation the
     column picker's list makes for the same reason: every row here ends in an `<output>` at the
     port's right edge, and on a short window this body scrolls. Given straight back as margin, so
     the rows keep their width and only the bar moves out of the numbers
     (docs/app.md §Theming). */
  .body { max-height: min(70vh, 30rem); overflow-y: auto;
          display: flex; flex-direction: column; gap: var(--s2);
          margin-inline: calc(-1 * var(--ring-room)); padding-inline-end: var(--s3);
          margin-inline-end: calc(-1 * var(--s3)); }

  /* Below 800px the trigger is no longer the end of a row that fits: the actions band takes the
     whole width and at 320px the bar's own contents need 331px against 304px, so the control sits
     up to 19px PAST the right edge and a panel anchored to it goes with it. Dropping the containing block hands the
     panel to `.chrome`, which is the viewport's width at every scroll position, and `top: 100%` is
     then the foot of the chrome band rather than the foot of the trigger. The same fix the column
     picker earned, for the same reason, and AFTER the base rule for the same one again: a media
     query carries no extra specificity, so a `right: 0` below it would win
     (docs/app.md §Stacking order). */
  @media (max-width: 800px) {
    .display { position: static; }
    .panel { top: 100%; right: var(--s2); }
  }

  .head { display: flex; align-items: baseline; justify-content: space-between; }
  h2 { margin: 0; font-size: var(--t-sm); font-weight: 650; }
  .link { border: none; background: none; padding: 0; cursor: pointer; color: var(--accent);
          font-size: var(--t-xs); font-family: inherit; }
  fieldset { border: none; margin: 0; padding: var(--s2) 0 0; border-top: 1px solid var(--border);
             display: flex; flex-direction: column; gap: var(--s2); }
  legend { padding: 0; font-size: var(--t-xs); color: var(--text-dim); font-weight: 600;
           display: flex; align-items: center; gap: var(--s2); }
  /* The resolved fill for the theme on screen, read straight off the custom property the engine
     wrote — one home for the colour, and it cannot disagree with what the table is painting. */
  .swatch { width: 0.9em; height: 0.9em; border-radius: var(--r-sm); border: 1px solid var(--border); }
  .swatch.better { background: var(--wash-blue); }
  .swatch.base { background: var(--wash-base); }

  .row { display: grid; grid-template-columns: 5rem 1fr 2.8rem; align-items: center; gap: var(--s2); }
  .row label, .row .lbl { font-size: var(--t-xs); }
  .row output { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text-dim);
                text-align: right; }
  .row.off { opacity: 0.5; }
  .row input[type="range"] { width: 100%; margin: 0; accent-color: var(--accent); }
  /* A hue slider that does not show the hues is a number with a handle. The stops are sRGB
     landmarks rather than the engine's own ramp: the track is an affordance, and the swatch beside
     the legend is what states the colour exactly. */
  .hue { -webkit-appearance: none; appearance: none; height: 0.75em; border-radius: var(--r-full);
         background: linear-gradient(to right, #d75c5c, #cf9040, #7fae4e, #3fae90, #4f9fd8, #7f83e0, #c66bc9, #d75c5c); }
  .hue::-webkit-slider-thumb { -webkit-appearance: none; width: 0.9em; height: 0.9em;
                               border-radius: var(--r-full); background: var(--surface);
                               border: 2px solid var(--text); cursor: pointer; }
  .hue::-moz-range-thumb { width: 0.75em; height: 0.75em; border-radius: var(--r-full);
                           background: var(--surface); border: 2px solid var(--text); cursor: pointer; }

  .check { display: flex; align-items: center; gap: var(--s2); font-size: var(--t-xs); }
  .theme-control { grid-column: 2 / -1; justify-self: start; display: inline-flex; }
  .note { margin: 0; font-size: var(--t-xs); color: var(--text-dim); }
  .note.warn { color: var(--bad); }
  .mono { font-family: var(--font-mono); }
</style>
