<script lang="ts" module>
  /**
   * Long enough that a drag or a typed word is one write, short enough that a runner who copies
   * the address bar straight after a click gets what is on screen
   * (docs/app.md §View and URL ownership).
   */
  export const VIEW_WRITE_MS = 200;
</script>

<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { slide } from 'svelte/transition';
  import type { ShoesFile } from '../../shared/types.js';
  import AboutDialog from './components/AboutDialog.svelte';
  import ColumnPicker from './components/ColumnPicker.svelte';
  import FilterSidebar from './components/FilterSidebar.svelte';
  import Header from './components/Header.svelte';
  import OrderingNote from './components/OrderingNote.svelte';
  import Receipt from './components/Receipt.svelte';
  import SetupStrip from './components/SetupStrip.svelte';
  import ShoeTable from './components/ShoeTable.svelte';
  import ShoeTableMobile from './components/ShoeTableMobile.svelte';
  import SkipLink from './components/SkipLink.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import { TABLE_ANCHOR_ID } from './lib/anchor';
  import { COPIED, EXPORTED, viewAnnouncement } from './lib/announce';
  import { exportCsv } from './lib/csv-export';
  import { keepFocusInScrollports } from './lib/focus-scroll';
  import { ICON_PATHS } from './components/icons';
  import { indexTests } from './lib/dataset';
  import { debounce } from './lib/debounce';
  import { applyFilters, EMPTY_FILTERS, narrowingNames } from './lib/filters';
  import type { Zone } from './lib/lineage';
  import { orderingNote } from './lib/ordering';
  import { isFirstArrival, readStoredView, writeStoredView } from './lib/persist';
  import { applyPreset, PRESETS } from './lib/presets';
  import { scoreMap, type ScoreColumns } from './lib/score';
  import { SCORE_DEFS } from './lib/score-defs';
  import { projectZone, zoneOf } from './lib/zone';
  import { sortShoes } from './lib/sort';
  import { currentTheme, cycleTheme, type Theme } from './lib/theme';
  import { DEFAULT_ZONE, defaultColumns, defaultView, parseView, sameValue, serializeView, type ViewState } from './lib/urlstate';

  let { data }: { data: ShoesFile } = $props();

  const idx = $derived(indexTests(data.tests));
  // Parsed once; from here the view is the source of truth and the URL is write-only
  // (docs/app.md §View and URL ownership). A shared link always beats a previous session, so the
  // query string wins outright and storage is only consulted when there is none.
  const initial = untrack(() => {
    const qs = location.search.replace(/^\?/, '');
    const stored = qs ? null : readStoredView();
    // `isFirstArrival()` rather than `!qs && stored === null` spelled again: the loading placeholder
    // reserves the strip's height off the same predicate, and two spellings would let the reserve
    // and the strip disagree (docs/app.md §Decisions).
    return { view: parseView(qs || stored || '', indexTests(data.tests)), restored: stored !== null,
             bare: isFirstArrival() };
  });
  let view = $state<ViewState>(initial.view);
  let showFilters = $state(false);
  /**
   * What the runner is reading, held beside the view rather than inside it: every toolbar mark is a
   * `sameValue` comparison of whole `ViewState`s, so an open panel in there would unmark the story
   * the moment a row was tapped (docs/app.md §View and URL ownership).
   *
   * Mutated, never replaced — both tables hold this exact set, and a new object would leave them
   * reading the old one.
   */
  const open = new SvelteSet<string>();

  function toggleOpen(slug: string) {
    if (!open.delete(slug)) open.add(slug);
  }
  /** The one explanation the chrome offers, opened from the bar and from the setup strip
   *  (docs/app.md §The About panel). */
  let aboutOpen = $state(false);
  /**
   * Ephemeral, never serialised and never persisted: the strip asks both questions on a genuine
   * first arrival — no query string and no stored view — and hands over to the toolbar for good
   * once a story is picked. A *stored* dismissal flag is what docs/app.md §Presets rules out; the
   * property it protects, that a bare link opens expanded and a filtered link collapsed, is this.
   */
  let stripOpen = $state(initial.bare);
  let stripEl = $state<HTMLElement>();
  /** A JS transition cannot be wrapped in an `@media` block, so the query is asked here instead.
   *  jsdom implements no `matchMedia` beyond the suite's stub, hence the optional call. */
  const collapseMs = untrack(() =>
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) ? 0 : 200);
  /** Set for the scroll hand-over only: the strip is off the top of the screen by then, so a
   *  200ms collapse is 200ms of the table sliding under a runner who is reading it. */
  let collapseAtOnce = $state(false);
  /**
   * The strip is `position: static`, so scrolling the table takes it off the screen and leaves the
   * runner with **no zone or story control anywhere** — the bar deliberately draws neither while the
   * strip is up (docs/app.md §The setup strip). So the strip hands over when it leaves the viewport,
   * exactly as it does when a story is picked: the same one-surface-at-a-time rule, reached by
   * scrolling instead of by clicking.
   *
   * Permanent, and driven by the strip having gone rather than by whether it is showing. The
   * reversible form oscillates on measurement rather than in theory: gaining the groups makes the
   * bar 33px taller at 390px, the pinned band reserves that height, and the strip is pushed back
   * into view by more than the margin that hid it.
   */
  $effect(() => {
    if (!stripOpen || !stripEl) return;
    const io = new IntersectionObserver(([entry]) => {
      // Upward only. The strip sits above the table, so this is the only way it can leave — but a
      // zero-height box during the collapse itself reports the same `isIntersecting: false`.
      if (!entry || entry.isIntersecting || entry.boundingClientRect.bottom > 0) return;
      handOverOnScroll();
    });
    io.observe(stripEl);
    return () => io.disconnect();
  });
  async function handOverOnScroll() {
    // Everything below the strip moves twice — up by the strip's own height, down by the row the
    // bar gains — so the compensation is measured off what the runner is actually looking at rather
    // than computed from either. Without it the table jumps a third of a phone screen mid-read.
    const anchor = document.getElementById(TABLE_ANCHOR_ID);
    const where = () => anchor?.getBoundingClientRect().top ?? 0;
    const before = where();
    collapseAtOnce = true;
    stripOpen = false;
    await tick();
    const settle = () => { const drift = where() - before; if (drift) window.scrollBy?.(0, drift); };
    settle();
    // A second pass on the next frame, for the same reason `lib/focus-scroll.ts` needs one: the
    // engines run their own scroll anchoring over content removed above the viewport, and it can
    // land after this handler returns. Measured without it, the phone kept 2px of drift.
    requestAnimationFrame(settle);
  }
  /**
   * Measured, never assumed: the header wraps to two lines below 800px and the toolbar to two
   * below 880px, so the pinned `thead` and the sticky sidebar both sit under a box whose height
   * is a function of the viewport. A hard-coded offset put the table's header row *behind* the
   * chrome on every width where the chrome grew (docs/app.md §Columns and sorting).
   *
   * It is also a function of TIME, now that the app self-hosts its faces: the face swaps in after
   * first paint and the chrome reflows by ~6px. `bind:clientHeight` is ResizeObserver-backed and
   * re-measures on that reflow, so this holds; a refactor to a one-shot `clientHeight` read would
   * reintroduce a strip of page that rows visibly scroll through, and only on a cold cache.
   * `smoke.spec.ts` asserts it after `document.fonts.ready`.
   */
  let chromeHeight = $state(0);

  /**
   * Which table renders is a query the script asks, not a `@media` rule, because **only one may be
   * in the DOM at a time**: a `display: none` table is still queryable, and two tables' headers
   * would be two answers to "what are the columns?" for assistive tech and for the suite alike
   * (docs/app.md §Columns and sorting). Read once at init so the first paint is already right,
   * then kept live for a rotation or a resized window.
   */
  const PHONE_QUERY = '(max-width: 699px)';
  let phone = $state(untrack(() => window.matchMedia?.(PHONE_QUERY).matches ?? false));
  $effect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY);
    if (!mq) return;
    const sync = () => (phone = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  /**
   * Which host draws the utilities, asked in the script rather than as an `@media` rule, because
   * **only one may be in the DOM at a time** — a `display: none` button is still a tab stop for
   * anything that does not evaluate CSS, and two nodes answering to `Copy link` are two answers to
   * "how do I share this?" (docs/app.md §Two renderings, and only one of them mounted).
   * The query is the sidebar's own `max-width: 800px` inverted rather than a `min-width` twin: two
   * queries that are meant to be complements drift apart at fractional widths, and this boundary is
   * shared with the drawer.
   */
  const MOBILE_QUERY = '(max-width: 800px)';
  let mobile = $state(untrack(() => window.matchMedia?.(MOBILE_QUERY).matches ?? false));
  $effect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return;
    const sync = () => (mobile = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });
  /**
   * The sidebar is a drawer only below 800px; above it, it is simply part of the page. One left
   * open across a resize would carry its focus trap into a layout where nothing is modal, so the
   * width at which it stops being a drawer is the width that closes it. The same rune, not a second
   * `matchMedia` on the same string: one boundary, one home (docs/app.md §Where the utilities live).
   */
  $effect(() => { if (!mobile) showFilters = false; });

  /**
   * The app owns its focus ring, so it owns keeping the thing wearing it on screen: WebKit never
   * scrolls the sidebar as Tab walks it and Firefox stops short of the room the ring needs, both
   * measured on the same walk (`lib/focus-scroll.ts`, docs/app.md §Theming). One delegated listener
   * for every scrollport, added here because this is the component that owns the page.
   */
  $effect(() => keepFocusInScrollports());

  let drawerEl = $state<HTMLElement>();
  /** Everything inside the drawer that can hold focus, in document order. */
  const drawerStops = (): HTMLElement[] =>
    [...(drawerEl?.querySelectorAll<HTMLElement>('input, button, select, a[href]') ?? [])]
      .filter((el) => !el.hasAttribute('disabled'));

  async function openFilters() {
    showFilters = true;
    // Awaited: until the class lands the drawer is still translated off-canvas and
    // `visibility: hidden`, and a hidden element cannot take focus.
    await tick();
    drawerStops()[0]?.focus();
  }
  function closeFilters() {
    showFilters = false;
    // The control that owns the drawer declares itself with `aria-controls`, so it can be found by
    // that contract rather than by threading a binding back up through the toolbar.
    document.querySelector<HTMLElement>('[aria-controls="filter-sidebar"]')?.focus();
  }
  function onDrawerKey(e: KeyboardEvent) {
    if (!showFilters) return;
    if (e.key === 'Escape') {
      // The Add-filter dialog renders into `<body>` (docs/app.md §Stacking order), so it is no
      // longer a descendant that vanishes with this drawer — and a click on the strip of drawer
      // above or below it can put focus back in here while it is still open. Closing the drawer
      // then would leave a modal floating over the table with no opener behind it, so the dialog
      // answers Escape first and the drawer waits its turn.
      if (document.querySelector('[role="dialog"][aria-label="Add filter"]')) return;
      closeFilters();
      return;
    }
    if (e.key !== 'Tab') return;
    // An open drawer covers the page it sits over, so without a trap Tab walks straight out into
    // controls the runner cannot see (docs/app.md §Filters).
    const stops = drawerStops();
    const first = stops[0];
    const last = stops.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const filtered = $derived(applyFilters(data.shoes, view.filters, idx));
  /**
   * What the empty state names. Derived from the live filters, because one unconditional sentence
   * written for a range bound was being printed for every cause — a link emptied by a brand, a
   * search or a date advised clearing a bound directly under a receipt reading "0 outside your
   * bounds", on a screen with no bound set at all (docs/app.md §Coverage).
   */
  const narrowing = $derived(narrowingNames(view.filters));
  /**
   * The bound clause, as one string rather than an `{#if}` in the markup: Svelte trims the
   * whitespace at a block's edges, so the leading space was eaten and the sentence rendered
   * "shoes— each bound". The separator is part of the clause, so it lives with it.
   */
  const boundNote = $derived(narrowing.includes('the bounds')
    ? ' — each bound says how many shoes it is excluding' : '');
  /** "a, b or c", and `a filter` when nothing is named — a fleet can be empty of its own accord. */
  const orList = (names: string[]): string =>
    names.length === 0 ? 'a filter'
      : names.length === 1 ? names[0]!
        : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
  /**
   * Read through a `$derived` of its own, never as `view.stability` where it is used: every update
   * replaces the whole view object, so a dependency on `view` re-runs whatever reads it — and one
   * of those readers scores the entire fleet. A derived propagates only when **its own value**
   * changes, which is what keeps a dragged grip from rebuilding six score maps a frame
   * (docs/app.md §What a drag may recompute).
   */
  const stability = $derived(view.stability);
  const snapshot = $derived($state.snapshot(view) as ViewState);
  const zoneMark = $derived(zoneOf(snapshot));
  /** Somewhere to stand when the view names no zone: the stories each bind one half, so applying
   *  one has to pick, and the baseline's own half is the least surprising pick. */
  const workingZone = $derived(zoneMark ?? DEFAULT_ZONE);
  /**
   * A score depends on the view, not just the shoe, so it is resolved once here and handed to
   * everything that needs it, keyed by the column it fills. Both zones are resolved rather than the
   * derived one: each column names its own zone, so nothing here has to pick one. Iterating the
   * registry means a fourth story needs no edit here, and a definition with no stable variant makes
   * the preference inert inside `scoreOf` rather than through a branch here
   * (docs/app.md §The story scores).
   */
  const scores = $derived<ScoreColumns>(new Map(
    SCORE_DEFS.flatMap((def) => (['heel', 'forefoot'] as const).map((zone) =>
      [def.keys[zone], scoreMap(def, data.shoes, zone, stability, idx)] as const))));
  const visibleSorted = $derived(sortShoes(filtered.visible, view.sort, idx, scores));
  /**
   * The ordering, in words, exactly when no rendered header can carry the caret — a link sorted by
   * date, name, brand or plate opened a phone with the fleet reordered and nothing on screen or in
   * the accessibility tree saying so. Derived from the view and the rendering, and serialised
   * nowhere: it is display, not state, so a shared link is byte-identical with and without it.
   * docs/app.md §The ordering is stated when no header can carry it
   */
  const ordering = $derived(orderingNote(snapshot, phone, idx));

  /**
   * What `All` produces — and, because the mark is `sameValue(v, allView(v, zone))`, also what
   * lights it. One function rather than an action and a matching predicate, so "marked means
   * pressing it changes nothing" is true by construction and cannot drift
   * (docs/app.md §What All does).
   *
   * `All` speaks for the story group and means "all paces". With a zone to work from it restores
   * that zone's plain table; with none — a deliberately mixed view — it clears the filters and
   * leaves the table's shape alone, because there is no defensible column set to impose and a row
   * the runner added is not a filter.
   */
  function allView(v: ViewState, zone: Zone | null): ViewState {
    // `stability` rather than the default: it is a property of the runner, not of the search, so
    // `All` must not silently turn it off — and the mark is `sameValue(v, allView(v, zone))`, so a
    // reset here would also unmark `All` for anyone who had set it (docs/app.md §Presets).
    if (zone !== null) return { ...defaultView(), columns: defaultColumns(zone), stability: v.stability };
    const next = structuredClone(v) as ViewState;
    next.filters = { ...EMPTY_FILTERS, ranges: {} };
    return next;
  }

  const atAll = $derived(sameValue(snapshot, allView(snapshot, zoneMark)));
  /**
   * Derived, never stored: a story reads as selected while the view equals what `applyPreset`
   * would build for it *now*. A stored `preset` field would keep claiming Easy after the runner
   * had filtered it into something else (docs/app.md §Presets).
   */
  const storyMark = $derived(
    zoneMark === null ? null
    : PRESETS.find((p) => sameValue(snapshot, applyPreset(p.id, zoneMark, view.stability)))?.id ?? null);
  const selected = $derived(atAll ? 'all' : storyMark);

  /**
   * Still the one write path, now asynchronous. A drag fires about sixty view updates a second, so
   * writing on each would make a two-second gesture 120 `replaceState` calls — past Safari's
   * throttle inside a single drag — plus 120 synchronous storage writes. The state assignment in
   * `setView` stays immediate, so the table filters live (docs/app.md §View and URL ownership).
   */
  const writeView = debounce((qs: string) => {
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    writeStoredView(qs);
  }, VIEW_WRITE_MS);
  // A page being torn down cannot wait out a timer, and `pagehide` is the last event a bfcache
  // navigation reliably delivers.
  const flushView = () => writeView.flush();
  window.addEventListener('pagehide', flushView);
  onDestroy(() => {
    window.removeEventListener('pagehide', flushView);
    flushView();
  });

  function setView(v: ViewState) {
    // Read before the assignment, so the diff is against the view the control was pressed on.
    void announce(viewAnnouncement(snapshot, v, idx));
    view = v;
    writeView(serializeView(v));
  }
  // A view restored from storage has to reach the URL, or a returning visitor sees a filtered
  // table behind a bare URL and copying the link shares the default view instead. Routed through
  // the one existing write path rather than adding a second URL write site, then flushed: this is
  // a one-off at init, not part of a burst, and a bare URL for 200ms is a link worth copying.
  if (initial.restored) { setView(initial.view); flushView(); }

  /**
   * A zone click makes the view about that zone (docs/app.md §Presets). A view that is a story is
   * rebuilt as that story on the new zone, so its sort key, score column and measurement columns
   * move together; anything else is projected, which moves the columns and sort and drops the
   * other half's bounds.
   */
  function onZone(next: Zone) {
    // Already there, so there is nothing to do. Rebuilding would be harmless — projecting onto the
    // zone a view already names is the identity — but it would spend a URL write on it.
    if (next === zoneMark) return;
    setView(storyMark ? applyPreset(storyMark, next, view.stability) : projectZone(snapshot, next));
  }
  async function onStory(id: string) {
    // The strip's own question, answered — the only thing the cards hold that the bar does not is
    // the descriptions, which are a first-encounter need.
    const handingOver = stripOpen;
    stripOpen = false;
    setView(id === 'all' ? allView(snapshot, zoneMark) : applyPreset(id, workingZone, view.stability));
    // The card that was just pressed is about to be unmounted with the strip around it, and nothing
    // else catches the focus it holds: `activeElement` became `<body>`, so no ring was drawn
    // anywhere and the pill that replaced the card was up to ten Shift+Tabs BEHIND the runner —
    // the bar precedes the strip in the DOM (docs/app.md §Presets). Handing focus to the pill for
    // the same story keeps the ring on screen and leaves one arrow key between minds.
    // Only on the hand-over: called from the bar's own group, `lib/roving.ts` already owns focus.
    if (!handingOver) return;
    await tick();
    document.querySelector<HTMLElement>(`[data-story="${CSS.escape(id)}"]`)?.focus();
  }
  /** A preference, so it does not clear the story or the `All` mark: `applyPreset` and `allView`
   *  both carry it through, which is what keeps the mark derived rather than lost
   *  (docs/app.md §Presets). */
  function setStability(next: boolean) {
    setView({ ...($state.snapshot(view) as ViewState), stability: next });
  }
  function onShowMissing() {
    const next = structuredClone($state.snapshot(view)) as ViewState;
    next.filters.showMissing = next.filters.showMissing ? undefined : true;
    setView(next);
  }
  /**
   * The one live region for what a control DID, and the whole announcement policy's mechanism
   * (docs/app.md §What a control says it did). Singular deliberately: two rapid actions read as the
   * later one rather than racing, which is the behaviour a runner wants and the only one a screen
   * reader can be relied on to give.
   *
   * The clear-and-reflush is for the two actions that can be repeated with the same outcome —
   * Export CSV and Copy link. Assigning identical text is not a DOM change, so nothing is spoken
   * the second time; emptying the region and letting that render first is what makes a repeat
   * audible.
   */
  let said = $state('');
  async function announce(text: string | null) {
    if (!text) return;
    if (said === text) {
      said = '';
      await tick();
    }
    said = text;
  }

  function onExport() {
    const blob = new Blob([exportCsv(visibleSorted, view.columns, idx, scores)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shoe-lab-export.csv';
    a.click();
    // Revoking in the same tick can cancel the download before the browser has taken its own
    // reference to the blob; yielding once is enough.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    // Nothing about the view changed and nothing on screen moved: a file was written. This is the
    // action the sweep found standing beside `Copy link`, one with a status node and one without.
    void announce(EXPORTED);
  }
  // Reads back what main.ts already put on the DOM at boot (docs/app.md §Theming).
  let theme = $state<Theme>(currentTheme());
  function onTheme() {
    theme = cycleTheme();
  }

  let copied = $state(false);
  /**
   * The URL *is* the view (docs/app.md §View and URL ownership), so copying the address bar is the
   * whole share feature — a stated project goal that had no affordance at all. The confirmation is
   * a separate node rather than a relabelled button: swapping the label would change the control's
   * accessible name to something you cannot then press. It is now VISIBLE feedback only — the
   * announcement goes through the one status region every other action uses, so that `Export CSV`
   * beside it is not the silent half of a pair (docs/app.md §What a control says it did).
   */
  async function copyLink() {
    // Absent outside a secure context, and it can reject on a denied permission. Neither is worth
    // an error state — but neither may claim success either, so both leave the region unsaid.
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(location.href);
      copied = true;
      void announce(COPIED);
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

<!-- Written once and mounted in the host its band owns, never in both with one hidden
     (docs/app.md §Where the utilities live). It reads `mobile` directly rather than taking a
     parameter: there is one instance, so there is nothing to parameterise. -->
{#snippet utilities()}
  {@const worded = !mobile}
  <span class="utils">
    <button type="button" class:icon={!worded} onclick={copyLink}
            aria-label="Copy link" title={worded ? undefined : 'Copy link'}>
      {#if worded}Copy link{:else}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d={ICON_PATHS.copy} stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      {/if}
    </button>
    <!-- No `role` of its own any more: this is the visible half, and the announcement is the
         announcer's (docs/app.md §What a control says it did). It stays rendered whether or not
         there is anything to say, because it collapses its own flex gap while silent and the
         header must be spaced the same before and after a copy. -->
    <span class="copied" class:said={copied}>{copied ? 'Copied' : ''}</span>
    <button type="button" class:icon={!worded} onclick={onExport}
            aria-label="Export CSV" title={worded ? undefined : 'Export CSV'}>
      {#if worded}Export CSV{:else}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d={ICON_PATHS.export} stroke="currentColor" stroke-width="1.4"
                stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      {/if}
    </button>
    <!-- An icon per state at both bands, and the `aria-label` is what makes the three-way cycle
         usable without sight — the drawing carries no accessible name of its own. -->
    <button type="button" class="icon" onclick={onTheme}
            aria-label="Toggle theme (currently {theme})" title="Theme: {theme}">
      {#if theme === 'auto'}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 010 12z" fill="currentColor"/></svg>
      {:else if theme === 'light'}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v1.8M8 13.2V15M1 8h1.8M13.2 8H15M3 3l1.3 1.3M11.7 11.7L13 13M13 3l-1.3 1.3M4.3 11.7L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.5 9.6A5.8 5.8 0 016.4 2.5a5.8 5.8 0 107.1 7.1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
      {/if}
    </button>
  </span>
{/snippet}

<!-- First in the document, because a skip link that is not the first tab stop skips nothing: it is
     dozens of stops from here to the first table row, and the count moves with the sidebar's rows —
     docs/app.md §Table presentation owns it. -->
<SkipLink />

<!-- ALWAYS rendered and only ever re-texted: a live region created together with its text is not
     reliably announced, which is the rule the Copy-link confirmation was already written to
     (docs/app.md §What a control says it did). One region for the whole app, so two rapid actions
     read as the later one. Off screen rather than hidden: `display: none` and `visibility: hidden`
     both take a live region out of the accessibility tree entirely. -->
<span class="announcer" role="status" data-testid="announcer">{said}</span>

<!-- Header and toolbar pin together, because every control that changes the view has to stay
     reachable from anywhere in a 25,000px table; the receipt below reports rather than controls,
     so it scrolls (docs/app.md §Columns and sorting). -->
<div class="chrome" class:pinned={chromeHeight > 0} bind:clientHeight={chromeHeight}>
  <Header total={data.shoes.length} builtAt={data.builtAt}
          utilities={mobile ? undefined : utilities} />
  <!-- The strip asks both questions in words while it is up, so the bar carries only its own
       actions until it has been handed them (docs/app.md §Presets). -->
  <Toolbar zone={zoneMark} onzone={onZone} {selected}
           onstory={onStory} {showFilters} showGroups={!stripOpen}
           stability={view.stability} onstability={setStability}
           onabout={() => (aboutOpen = true)}
           utilities={mobile ? utilities : undefined}
           onfilters={() => (showFilters ? closeFilters() : void openFilters())}>
    {#snippet columns()}
      <ColumnPicker tests={data.tests} groups={data.groups} columns={view.columns}
                    population={filtered.considered} {idx} generations={view.generations}
                    onchange={(cols) => setView({ ...($state.snapshot(view) as ViewState), columns: cols })} />
    {/snippet}
  </Toolbar>
</div>
<!-- The height a pinned box no longer occupies. It is the SAME measurement `--thead-top` is, so the
     band and the room it leaves can never disagree; and `.pinned` waits for that measurement, so
     there is never a frame with a fixed chrome over a spacer of nothing
     (docs/app.md §The chrome bands). -->
<div class="chrome-space" style:height="{chromeHeight}px"></div>

<!-- Outside `.chrome`, never inside it: the panel mounts itself to `<body>` anyway, and a sticky
     ancestor would make its z-index meaningless (docs/app.md §Stacking order). -->
{#if aboutOpen}
  <AboutDialog onclose={() => (aboutOpen = false)} />
{/if}

<!-- Outside .layout so it precedes the sidebar in the tab order: the strip is the default path
     into the tool, and inside .content a keyboard user reaches it only after every filter control. -->
{#if stripOpen}
  <div bind:this={stripEl} transition:slide={{ duration: collapseAtOnce ? 0 : collapseMs }}>
    <SetupStrip zone={zoneMark} {selected} onzone={onZone} onstory={onStory}
                onabout={() => (aboutOpen = true)} />
  </div>
{/if}

<div class="layout" class:show-filters={showFilters}>
  <!-- The drawer already traps focus; the scrim states in the interface what the trap enforces.
       Clicking it closes, which is the same affordance Escape gives. -->
  {#if showFilters}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="scrim" onclick={closeFilters}></div>
  {/if}
  <!-- The handler is a key trap for the panel below 800px, not a control: giving this box a role
       would announce a landmark that is only a drawer at one width. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sidebar scrollport" id="filter-sidebar" data-testid="filter-drawer" bind:this={drawerEl}
       style:--chrome-h="{chromeHeight}px" onkeydown={onDrawerKey}>
    <FilterSidebar {data} {view} onchange={setView} population={filtered.considered} />
  </div>
  <div class="content" style:--thead-top="{chromeHeight}px">
    <Receipt shown={visibleSorted.length} total={filtered.considered.length}
             outsideBounds={filtered.outsideBounds} hiddenMissing={filtered.hiddenMissing}
             undatedHidden={filtered.undatedHidden}
             showingMissing={view.filters.showMissing ?? false} onshowmissing={onShowMissing} />
    {#if ordering}<OrderingNote phrase={ordering} />{/if}
    <!-- tabindex so the skip link can move focus here: .focus() on a plain container is a no-op. -->
    <div id={TABLE_ANCHOR_ID} tabindex="-1">
      {#if phone}
        <ShoeTableMobile shoes={visibleSorted} {data} {view} {scores} {open} ontoggle={toggleOpen}
                         stability={view.stability} onchange={setView} />
      {:else}
        <ShoeTable shoes={visibleSorted} {data} {view} {scores} {open} ontoggle={toggleOpen}
                   stability={view.stability} onchange={setView} />
      {/if}
    </div>
    {#if visibleSorted.length === 0}
      <!-- The table still renders: its headers keep the sort controls reachable. -->
      <!-- The hint names a control the reader can actually see: below 800px the sidebar is a CLOSED
           drawer, so pointing at it names something off screen at exactly the width where an empty
           result is most likely. `Filters` is the drawer toggle's own label. -->
      <p class="empty"><strong>No shoes match these filters</strong>Clear {orList(narrowing)} to see
        shoes{boundNote}. On a phone they are behind <b>Filters</b>.</p>
    {/if}
  </div>
</div>

<style>
  /* Pinned to the VIEWPORT, on both axes. Sticky pins only the axis its scrollport scrolls in the
     direction of its inset, so the band travelled sideways with the document — and the document is
     what scrolls sideways past six columns, `.content` being forbidden an `overflow-x` below. Its
     box is the viewport's width, so scrolled right it ENDED before the page did and shoe rows
     painted in the masthead: `.chrome` at `x: -77` inside a 1177px document
     (docs/app.md §The chrome bands).
     Widening it to the document instead was measured and rejected: it takes the actions with it,
     and `opens with the actions flush to the bar trailing edge` is the assertion that says they
     must stay reachable. `fixed` keeps them exactly where they are at every scroll position.
     The starting state is `sticky` rather than `fixed` and the swap waits on `--chrome-h` being
     measured, so the first frame is laid out with the band still in flow rather than over a spacer
     that is not yet its height. */
  .chrome { position: sticky; top: 0; z-index: 5; }
  .chrome.pinned { position: fixed; top: 0; left: 0; right: 0; }
  /* The utilities, wherever their band mounts them. Authored here because a snippet carries the
     scope of the file it is written in, so rules left behind in `Header.svelte` would stop reaching
     these three buttons the moment they moved (docs/app.md §Where the utilities live). */
  /* `--s4` here is the masthead's own `--gap-x`, restated rather than inherited: the group has to
     space identically to the three loose buttons it replaced, or the desktop masthead the spec
     leaves untouched moves by 4px. It steps to the bar's gutter at the band the bar owns. */
  .utils { --util-gap: var(--s4); display: flex; align-items: center; gap: var(--util-gap); }
  @media (max-width: 800px) { .utils { --util-gap: var(--s3); } }
  /* The one secondary-button treatment (docs/app.md §Theming); `--t-sm` stated rather than left to
     the UA's 13.33px, because matching it by 0.05px of luck is not carrying it. */
  .utils button { padding: var(--s1) var(--s3); cursor: pointer; border: 1px solid var(--border);
                  background: var(--surface); color: var(--text); border-radius: var(--r-sm);
                  font-size: var(--t-sm); }
  .utils button:hover { background: var(--accent-dim); }
  .utils .icon { display: inline-flex; align-items: center; justify-content: center; }
  /* Clipped to nothing rather than hidden: a `display: none` region is not in the accessibility
     tree, so nothing in it is ever spoken. `position: fixed` keeps a stray character out of the
     document's own scroll extent, which `.chrome` is measured against. */
  .announcer { position: fixed; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
               overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .copied { font-size: var(--t-sm); color: var(--good); }
  /* A silent region is still a flex item, so it would carry a gap on each side and space the row
     differently depending on whether a link had ever been copied. The group's OWN variable, not the
     header's `--gap-x`: that one is Header-local and does not exist in the bar, and this has to
     track whatever the gap above resolves to at the current band. */
  .copied:not(.said) { margin-inline-start: calc(-1 * var(--util-gap)); }
  /* `minmax(0, 1fr)`, not `1fr`: a bare `1fr` track takes an automatic minimum of min-content, and
     the table's 14rem name column plus its headers' own longest words inflate that past the
     viewport, so the whole document scrolled sideways at desktop widths. */
  .layout { display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); align-items: start; }
  /* A sticky column taller than the viewport can never scroll to its own bottom, and ten range
     filters easily outgrow it — give the sidebar its own scrollbar. The offset is the measured
     chrome, not the header alone: the toolbar pins too, and is two lines tall below 880px. */
  .sidebar { position: sticky; top: var(--chrome-h); max-height: calc(100vh - var(--chrome-h)); overflow-y: auto; }
  /* No `overflow-x` here, deliberately. It would make `.content` a scrollport — `overflow-x: auto`
     forces `overflow-y` to compute to `auto` — so the table's sticky `thead` would stick to a box
     that never scrolls vertically and ride off with the page. Horizontal overflow falls to the
     page instead, which only bites well past the default six columns and is the only structure in
     which the pinned header works at all (docs/app.md §Columns and sorting). */
  .content { padding: 0 var(--s4) var(--s6); }
  /* The skip link scrolls the anchor to the top of the scrollport, and the top of the scrollport is
     behind the pinned chrome — without this the runner arrives looking at the third row
     (docs/app.md §Columns and sorting). The table's own header row then sits exactly where it
     sticks, so the first row is the first thing under it. */
  #shoe-table { scroll-margin-top: var(--thead-top); }
  .empty { padding: var(--s6); text-align: center; color: var(--text-dim); }
  .empty strong { display: block; color: var(--text); font-size: var(--t-lg); font-weight: 600; margin-bottom: var(--s1); }
  @media (max-width: 800px) {
    /* Below the drawer's 30 and above the page. Never rendered above 800px, because the resize
       effect forces `showFilters` false there (docs/app.md §Stacking order). */
    .scrim { position: fixed; inset: 0; z-index: 25; background: var(--scrim); }
    @media (prefers-reduced-motion: no-preference) {
      .scrim { animation: fade 200ms ease-out; }
    }
    .layout { grid-template-columns: minmax(0, 1fr); }
    /* Off-canvas rather than `display: none`: display cannot be animated, so the drawer appeared
       and vanished with no sense of where it came from. `visibility` is what keeps a closed drawer
       out of the tab order — a panel that is merely translated away is still focusable — and it is
       one of the few properties that can be transitioned alongside a transform without fading. */
    .sidebar {
      position: fixed; top: 0; bottom: 0; left: 0; z-index: 30; width: min(20rem, 88vw);
      max-height: none; background: var(--surface); border-right: 1px solid var(--border);
      box-shadow: var(--shadow-dialog); transform: translateX(-100%); visibility: hidden;
    }
    .layout.show-filters .sidebar { transform: none; visibility: visible; }
    /* `visibility` cannot be interpolated, so it is switched at whichever end of the slide is
       right: immediately on the way in, or the panel is still hidden when it is handed focus, and
       200ms late on the way out, so the slide is seen before it leaves the tab order. */
    @media (prefers-reduced-motion: no-preference) {
      .sidebar { transition: transform 200ms ease-out, visibility 0s linear 200ms; }
      .layout.show-filters .sidebar { transition: transform 200ms ease-out, visibility 0s; }
    }
  }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
