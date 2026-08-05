/**
 * What the desktop table will render for each shoe, measured rather than derived.
 *
 * **Why there is no model here.** This started as a greedy line-break simulation over `fit.ts`'s
 * committed per-character tables. Investigation killed it: line breaking is engine-dependent, so no
 * single-engine model can be right in three — `Under Armour Charged Pursuit 3` is two lines in
 * Chromium and one in Firefox and WebKit at a 224px name column, and Firefox implements UAX #14's
 * numeric context where the others do not. There is no tolerance that repairs that, because the
 * thing being modelled genuinely has three answers
 * (docs/specs/2026-08-03-virtualising-the-table.md §Decisions).
 *
 * So every name is laid out once, in one hidden container at the width the name actually wraps at,
 * and its BOX is read back — not a line count, which would have to be turned into a height by a
 * rule about what a line is worth, and that rule is engine- and face-dependent too. Exact by
 * construction, in whatever engine is running, with no font table involved — and the engines really
 * do disagree: on the committed fleet at 1440px with the wide column set, Chromium wraps 35 names
 * onto a second line where Firefox wraps 27 and WebKit 28 — the same 455 names at the same
 * declared width, laid out by this function in each engine.
 *
 * **What it costs, and why that is affordable.** Measured through this function on the committed
 * fleet of 455 names, medians of nine runs in the Playwright image: **5.2ms in Chromium, 7.0ms in
 * Firefox and WebKit**. Linear with a fixed overhead — 910 names cost 8.6 / 11 / 12ms and 1820 cost
 * 16.3 / 18 / 22 — so twice the fleet costs about 1.6x rather than twice, and a marginal name is
 * under 10us. Nearly all of it is the engine laying out 455 boxes: building the markup is free and
 * the reads are ~0.2ms of it. The two things around that container are fixed rather than
 * fleet-shaped — one clone to read the geometry off and a replica of two rows, whatever the fleet
 * looks like — and re-measured after both were changed the figures did not move. That is over the
 * 2.0-2.3ms estimated before implementation, and it is not
 * reducible without giving up laying every name out, which is the design.
 *
 * What makes it affordable is WHEN it is paid, not how long it takes: once per name-column width,
 * and that width moves only when the viewport or the column set does. A filter drag pays nothing,
 * because a declared width is `min + share` over the columns and the track and never over the rows
 * in the DOM (docs/app.md §What a drag may recompute).
 */

/** The two things about a shoe that change how its name lays out. */
export interface NameEntry {
  readonly name: string;
  readonly discontinued: boolean;
}

/** Every piece of prose that can change a closed phone shoe group's height. */
export interface PhoneHeightEntry extends NameEntry {
  readonly metadata: readonly string[];
}

/**
 * Heights in the order given, or `null` when nothing can be measured.
 *
 * **`null` is a real answer, not a test affordance.** jsdom lays nothing out — every box is zero —
 * and so does this app before the table has mounted. A caller that cannot tell "cannot measure"
 * from "measured zero" would window the fleet down to nothing; the honest answer is to render
 * everything, which is the same fallback `fit.ts` already takes where it cannot measure
 * (spec §Failure behaviour).
 *
 * **No imports, deliberately, and it must stay that way.** This function is handed whole to
 * `page.evaluate` by `app/e2e/fit-support.ts`, which is how the measured-equals-rendered bound is
 * a claim about THIS code rather than about a copy of it that drifted. A closure over anything outside the function body — a module constant, an imported
 * helper — does not survive serialisation, and the failure is silent: the reference is simply
 * undefined in the page.
 */
export function measureDesktopRowHeights(names: readonly NameEntry[]): number[] | null {
  const wrap = document.querySelector<HTMLElement>('.tblwrap');
  // `:not(.proto)`, because there are two tables in the wrapper now and only one of them is the
  // table: the declared widths, the class and the collapse mode all have to come from the one the
  // runner is looking at. Positional selection — "the first table" — would have been right today
  // and silently wrong the moment the two swapped order.
  const table = wrap?.querySelector<HTMLTableElement>('table:not(.proto)');
  if (!wrap || !table) return null;

  const widths = [...table.querySelectorAll<HTMLTableColElement>('colgroup col')]
    .map((c) => parseFloat(c.style.width));
  // EVERY column, not just the name's: a `NaN` anywhere reaches the replica's `<col>` declarations
  // below, where an invalid value is simply dropped and the replica then lays out at a width nobody
  // asked for — silently, and in the direction that under-reserves.
  if (!widths.length || !widths.every((w) => w > 0)) return null;

  // The row every measurement is cloned from, and it is **the table's permanent prototype rather
  // than whichever shoe is on screen**. Cloning rather than composing is still the whole of why this
  // cannot drift from the table — the component's CSS is Svelte-scoped, so markup built from scratch
  // carries no `svelte-xxxxxx` class and gets none of its styles — but the SOURCE had to move once
  // the body started rendering a window of the fleet instead of all of it. `ShoeTable.svelte` emits
  // `table.proto`: one row, out of flow, out of the accessibility tree, carrying a cell per rendered
  // column and a `DiscontinuedTag`, and never in the plan.
  //
  // Three things the old source could not promise, each of which ends the measurement or corrupts
  // it. **The window can be empty** — scroll past either end of the fleet and the body is one spacer
  // — so there was no row to clone at all. **The window may hold no discontinued shoe**, and the chip
  // cannot be reconstructed, only copied. And **the first row in the DOM became a function of where
  // the runner had scrolled**, which is how an expanded row's rotated chevron got measured as a
  // width. Each of those made the answer `null`, the caller render everything, the prototype
  // reappear and the answer come back — self-healing, but a loop, and one that a resize drag
  // (which misses the cache on every frame) runs without limit
  // (docs/specs/2026-08-03-virtualising-the-table.md §Registry sweep).
  const liveRow = wrap.querySelector<HTMLTableRowElement>('table.proto tbody tr');
  const liveCell = liveRow?.querySelector<HTMLTableCellElement>('td.name');
  const nameRow = liveCell?.querySelector<HTMLElement>('.name-row');
  if (!liveRow || !liveCell || !nameRow) return null;

  // **A clone is a shape, never a state**, and this is the one place that makes it one. The
  // prototype above carries none of the states below — it is never open, never focused and answers
  // to no slug — so every line here is now a guard rather than a repair. It stays whole, and the
  // chevron's is the reason: the same de-stating on a live row was the fix for a measurement that
  // came out 13px short with any row expanded, and a guard deleted because today's source is clean
  // is a guard the next source does not get. Everything below is measured off a copy of a node the
  // app owns, and the app draws state on those nodes: an
  // expanded row's chevron is `rotate(90deg)`, `getBoundingClientRect()` reports the TRANSFORMED
  // box — 18px for a glyph whose advance is 5 — so the width every name was laid out against came
  // out 13px short the moment any row was open, and the function returned plausible wrong numbers
  // rather than `null`. A transform moves no layout, so the row on screen is unaffected and only
  // the measurement is wrong: nothing but this can notice it (docs/app.md §Table presentation).
  //
  // **It has to run before the clone is attached**, and that is measured rather than assumed:
  // attach a clone open, read anything that flushes layout, then de-open, and the 120ms `transform`
  // transition starts — the advance reads 18.00, 18.63, 17.34, 14.80 … over the following frames
  // instead of 5.00, and only `prefers-reduced-motion: reduce` snaps it — read off the chevron's
  // own advance in Chromium, frame by frame, over the transition. With nothing flushing in between
  // there is no before-change
  // style and nothing is caught, so moving this line alone changes no reading — the ORDER is what
  // makes the advance independent of whatever else comes to touch layout here.
  //
  // The rest are inert today and stripped anyway, which is the honest way to hold a rule: an open
  // row's `aria-expanded` names a relationship a hidden copy of it does not have, `data-slug` is
  // what `revealRow` walks and windowing may want to keep a replica, and the chip's line box is
  // shorter than a name's, so leaving it on would read the same floor in all three engines at every
  // width the sweep walks. Each of those is a fact about today's markup, not about the design, so
  // a state kept for one of them is a state the next reader keeps for none.
  const blockIn = (el: Element) => (el.matches('.name-row')
    ? el.querySelector<HTMLElement>(':scope > div')
    : el.querySelector<HTMLElement>('td.name .name-row > div'));
  const deState = (el: Element) => {
    for (const attr of ['data-slug', 'tabindex', 'aria-controls', 'aria-expanded', 'style']) {
      el.removeAttribute(attr);
    }
    el.querySelector<HTMLElement>('.chev')?.classList.remove('open');
    const inner = blockIn(el);
    inner?.removeAttribute('style');
    inner?.querySelector(':scope > span')?.remove();
    return inner;
  };

  const protoRow = nameRow.cloneNode(true) as HTMLElement;
  const protoChev = protoRow.querySelector<HTMLElement>('.chev');
  const block = deState(protoRow);
  if (!protoChev || !block) return null;
  protoRow.setAttribute('aria-hidden', 'true');
  protoRow.style.cssText = 'position: absolute; top: 0; left: 0;'
    + 'visibility: hidden; pointer-events: none;';
  liveCell.append(protoRow);
  // The chevron's advance is not the same in every engine — 5.00px in Chromium against 4.58px in
  // Firefox — which is one more reason this is measured in the engine that will render it. Read as
  // a rect and never as `offsetWidth`, which is integer-rounded and would throw Firefox's fraction
  // away.
  const chevPx = protoChev.getBoundingClientRect().width;
  const gapPx = parseFloat(getComputedStyle(protoRow).columnGap) || 0;
  protoRow.remove();

  // What the name wraps at, derived from the DECLARED column rather than read off the block: the
  // block is a flex item and shrinks to its content whenever the name is short, so its own width is
  // an answer about that name rather than about the column. It can also be WIDER than this, which
  // no arithmetic over the column can see — the container declares the same floor it does, below.
  const cellCs = getComputedStyle(liveCell);
  const avail = widths[0]!
    - parseFloat(cellCs.paddingLeft) - parseFloat(cellCs.paddingRight)
    - parseFloat(cellCs.borderLeftWidth) - parseFloat(cellCs.borderRightWidth)
    - chevPx - gapPx;
  if (!(avail > 0)) return null;

  // A sentinel substituted into the prototype's serialised form, so ONE parse builds the whole
  // container: cloning per name and reaching into each clone for its `<strong>` costs more than the
  // layout being measured. A private-use codepoint, so no name can hold it and no escaping can
  // produce it. Substituted through a FUNCTION, never a replacement string — `$&` in a replacement
  // string is a backreference, and shoe names are upstream's to write.
  const SENTINEL = '\uE000';
  const escape = (s: string) => s.replace(/[&<>]/g, (c) =>
    (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

  // The chip is inline, `nowrap`, and glued to the name with no whitespace between it and the
  // `</strong>`, so it joins the name's last line and can push it over. It is part of what gets laid
  // out, or every discontinued shoe measures short (docs/app.md §Table presentation).
  //
  // **It has to be a real one.** `DiscontinuedTag` is its own component with its own scoped class,
  // so it cannot be reconstructed from anything the row carries — the only faithful copy is an
  // instance the app rendered. Read off the PROTOTYPE, which always carries one, rather than off
  // whichever shoe is on screen: under a window "is there a discontinued row in the DOM" is a fact
  // about the scroll position, and this measurement is not allowed to be.
  const chipHtml = liveRow.querySelector('td.name .name-row > div > span')?.outerHTML;
  // Refusing to guess: with discontinued names to measure and no instance on the page to copy, the
  // honest answer is that this cannot be measured yet — not a set of heights short by a chip. It
  // heals itself, because a caller told `null` renders everything, and rendering everything puts an
  // instance back on the page (spec §Failure behaviour).
  if (!chipHtml && names.some((n) => n.discontinued)) return null;

  // `block` is already the de-stated clone's own node, so no second clone is needed and no live
  // node is reached into.
  const protoStrong = block.querySelector('strong');
  // Declining rather than throwing, like every other reach into the markup here: a renamed element
  // means this cannot be measured, and an exception inside a Svelte effect is not that answer.
  if (!protoStrong) return null;
  protoStrong.textContent = SENTINEL;
  // **`avail` is not always what the name gets, and this is what closes the gap.** The block is a
  // flex item with `min-width: auto`, so its automatic minimum size is its min-content width: a
  // name carrying one unbroken token wider than the column lays out in a block WIDER than the cell,
  // and the rest of the name then wraps against that wider box rather than against `avail`.
  // Measured, an unbroken run of about 28 characters is enough and the error is a whole line — a
  // row reserved at 71 rendering at 53, identically in all three engines — and it OVER-reserves,
  // which the `null` contract cannot catch because the function returns numbers. The threshold is a
  // measurement rather than an estimate: names were laid out at one declared width with the unbroken
  // run grown a character at a time until the reserved height left the rendered one. Hyphens do not
  // trigger it: every engine breaks at them and so does min-content. Declared on the container rather than corrected afterwards, so the thing
  // being measured is subject to the same floor the flex item is.
  block.style.minWidth = 'min-content';
  const plain = block.outerHTML;
  const tagged = plain.replace('</strong>', `</strong>${chipHtml ?? ''}`);

  const host = document.createElement('div');
  // Out of flow so the row it is measured inside keeps its own height, and `td.name` is
  // `position: sticky` and therefore already a positioned ancestor. Inside the real cell rather
  // than anywhere else, so every inherited property — font, size, weight, the custom properties the
  // whole cascade hangs off — is the cell's own rather than a restatement of it.
  host.style.cssText = `position: absolute; top: 0; left: 0; width: ${avail}px;`
    + 'visibility: hidden; pointer-events: none;';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = names
    .map((n) => (n.discontinued ? tagged : plain).replace(SENTINEL, () => escape(n.name)))
    .join('');
  liveCell.append(host);
  const kids = host.children;
  // The name's own box, whole. Not a line count: a count would have to be turned back into a height
  // by a rule about what a line is worth, and the engines disagree about that per name — which is
  // the same reason there is no font table in this file.
  const boxes: number[] = [];
  for (let i = 0; i < names.length; i++) boxes.push(kids[i]!.getBoundingClientRect().height);
  host.remove();

  // **A row height is two measured facts and no arithmetic between them.** The FLOOR is what the
  // table draws when the name is not what sets the height — every other cell is one `nowrap` line,
  // so that is the same row for every shoe in a column set — and `rowPx` is what the row adds to
  // whatever the name's own box is. There is no base, no step and no line count here: the step from
  // one line to two is not the step from two to three, so a base-and-step constant is wrong at the
  // most common row in the fleet — the figures and the bound they withdrew live in the spec's
  // §Bounds row, which is their one home — and a per-line-count lookup is wrong again wherever a
  // line box is not the face's own, over-reserving 8px on a two-line Japanese name in Firefox,
  // which counts as three — measured on a name set in kana against the same name in Latin, at the
  // same width, in all three engines. Both facts come off a clone of the row the
  // component itself renders, because markup built from scratch carries no `svelte-xxxxxx` class and
  // would get none of its styles.
  const replica = document.createElement('table');
  const ts = getComputedStyle(table);
  replica.className = table.className;
  replica.style.cssText = `table-layout: fixed; border-collapse: ${ts.borderCollapse};`
    + `border-spacing: ${ts.borderSpacing};`
    + `width: ${widths.reduce((a, b) => a + b, 0)}px;`
    + 'position: absolute; top: 0; left: -10000px; visibility: hidden; pointer-events: none;';
  replica.setAttribute('aria-hidden', 'true');
  const cg = document.createElement('colgroup');
  for (const w of widths) {
    const c = document.createElement('col');
    c.style.width = `${w}px`;
    cg.append(c);
  }
  const tb = document.createElement('tbody');
  replica.append(cg, tb);
  const replicaBoxes: HTMLElement[] = [];
  for (const lines of [1, 2]) {
    const tr = liveRow.cloneNode(true) as HTMLTableRowElement;
    const box = deState(tr);
    const cellStrong = tr.querySelector('td.name strong');
    if (!box || !cellStrong) return null;
    replicaBoxes.push(box);
    // **Two line boxes at every width there is, because the break is explicit.** What this replaced
    // was one twenty-character word per line, which wrapped to n lines only while two of those
    // words could not share a line — an unwritten precondition that failed once the name column
    // passed about 520px, which the DEFAULT column set reaches at a 1920px layout, and then
    // reported a two-line name as a one-line row. A forced break has no precondition to state.
    cellStrong.textContent = '';
    for (let i = 0; i < lines; i++) {
      if (i) cellStrong.append(document.createElement('br'));
      cellStrong.append('M');
    }
    tb.append(tr);
  }
  wrap.append(replica);
  const floorPx = (tb.children[0] as HTMLElement).getBoundingClientRect().height;
  // Read at TWO lines rather than one, because at one the row is the floor and the name cell is not
  // what sets it — the difference there would be the row's slack rather than what it adds.
  const rowPx = (tb.children[1] as HTMLElement).getBoundingClientRect().height
    - replicaBoxes[1]!.getBoundingClientRect().height;
  replica.remove();
  // jsdom lays nothing out and this app has not laid the table out before it mounts: a floor of
  // zero is "cannot measure", never "every row is 0px tall" (spec §Failure behaviour).
  if (!(floorPx > 0)) return null;

  return boxes.map((b) => Math.max(floorPx, b + rowPx));
}

/**
 * Measures the phone rendering's closed shoe groups from the permanent prototype it owns.
 *
 * The group is the plan's indivisible item: its leading rule where it has one, the name row and the
 * values row. An open panel is deliberately absent — open groups are kept and their panel is a live
 * box observed by the component. Building from cloned rows preserves Svelte's scoped classes; text
 * is assigned through `textContent` because every string here belongs to the dataset.
 *
 * No closure over module state: the browser suite serialises this function into `page.evaluate`, as
 * it does the desktop measurement, so its evidence exercises this exact implementation.
 */
export function measurePhoneGroupHeights(
  entries: readonly PhoneHeightEntry[],
): number[] | null {
  const table = document.querySelector<HTMLTableElement>('.mobile-proto table.proto');
  const source = table?.tBodies[0];
  const ruleSource = source?.querySelector<HTMLTableRowElement>('tr.rule');
  const shoeSource = source?.querySelector<HTMLTableRowElement>('tr.shoe');
  const valuesSource = source?.querySelector<HTMLTableRowElement>('tr.values');
  const metaSource = shoeSource?.querySelector<HTMLElement>('.meta');
  const discSource = shoeSource?.querySelector<HTMLElement>('.disc-tag');
  if (!table || !source || !ruleSource || !shoeSource || !valuesSource) return null;
  if (entries.some((entry) => entry.metadata.length) && !metaSource) return null;
  if (entries.some((entry) => entry.discontinued) && !discSource) return null;

  const measuredBody = document.createElement('tbody');
  measuredBody.setAttribute('aria-hidden', 'true');
  const groups: HTMLTableRowElement[][] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const rows: HTMLTableRowElement[] = [];
    if (i > 0) rows.push(ruleSource.cloneNode(true) as HTMLTableRowElement);

    const shoe = shoeSource.cloneNode(true) as HTMLTableRowElement;
    for (const attr of ['data-slug', 'tabindex', 'aria-controls', 'aria-expanded', 'style']) {
      shoe.removeAttribute(attr);
    }
    shoe.querySelector<HTMLElement>('.chev')?.classList.remove('open');
    const strong = shoe.querySelector<HTMLElement>('td.ident strong');
    const ident = shoe.querySelector<HTMLTableCellElement>('td.ident');
    if (!strong || !ident) return null;
    strong.textContent = entry.name;
    for (const old of shoe.querySelectorAll('.meta')) old.remove();
    const disc = shoe.querySelector<HTMLElement>('.disc-tag');
    if (!entry.discontinued) disc?.remove();
    const anchor = entry.discontinued ? disc : null;
    for (const text of entry.metadata) {
      const meta = metaSource!.cloneNode(true) as HTMLElement;
      meta.textContent = text;
      ident.insertBefore(meta, anchor);
    }
    rows.push(shoe, valuesSource.cloneNode(true) as HTMLTableRowElement);
    measuredBody.append(...rows);
    groups.push(rows);
  }

  table.append(measuredBody);
  try {
    const heights = groups.map((rows) => rows.reduce(
      (sum, row) => sum + row.getBoundingClientRect().height, 0));
    return heights.every((height) => height > 0) ? heights : null;
  } finally {
    measuredBody.remove();
  }
}

/**
 * The measurement plus the thing a caller would otherwise have to remember: when it stops being
 * true.
 *
 * **Everything that changes a measured group invalidates every height at once** — a resize, browser
 * zoom, a ticked column, and the faces swapping in after first paint. Each rendering supplies the
 * layout key for the first three; the fourth does not necessarily move that key, which is why it is
 * also a subscription. Measured before the faces land, every height is the fallback face's.
 *
 * **The event is not enough on its own, because one engine never sends it.** Measured on the real
 * fleet, WebKit dispatches `loading` and then nothing at all — no `loadingdone`, no `loadingerror`,
 * with `document.fonts.status` reading `loaded` all the same — every `document.fonts` event logged
 * from before the table mounts until after the faces are in use. So a table that mounted before its
 * faces landed would hold the fallback's heights there for the life of
 * the page, and nothing on screen would say so: the spacers stand for shoes that are not that tall,
 * and the scrollbar is wrong by the difference.
 *
 * The second half is therefore a **ruler rather than an event**: a prototype element whose width
 * is sensitive to every face that sets the measured boxes is part of the key and is watched for
 * changes. Measured across the swap, a string in this face moves 5.4px and the same string in the
 * mono face moves 41px, so any change at all is the face moving under it. The prototype is the one node this module can rely on being in the document, which is
 * the second job it does — `ShoeTable.svelte` renders it so that the measurement never depends on
 * which shoes are on screen.
 *
 * **Keyed on layout read back from the DOM, not on a proposed value.** For one frame after a resize
 * a caller's model and the rendered table can differ; the rendering-specific environment prevents
 * measuring one layout and labelling it as another.
 *
 * A filter change moves neither the width nor the fleet, so it is a cache hit — which is the whole
 * of why this is affordable (docs/app.md §What a drag may recompute).
 *
 * **The entries are compared by IDENTITY, so a caller must pass the same array and not an equal one.**
 * Comparing 455 entries element by element on every call would cost more than the hit saves, and a
 * caller that already holds the fleet has one array to hand over. A caller that rebuilds it per
 * render — `filtered.map(…)` inside a reactive block — misses every time and pays the whole
 * measurement per keystroke, which is exactly the cost this cache is here to remove. That is a
 * precondition on the caller, not a detail: `row-height.test.ts` holds it, and a windowing caller
 * is the one likeliest to break it (spec §Registry sweep).
 */
export interface RowHeights<T extends NameEntry = NameEntry> {
  /** Heights for `entries` in order, or `null` while nothing can be measured. */
  heights(entries: readonly T[]): number[] | null;
  /** Unsubscribes and empties the cache; `heights` declines from then on. */
  destroy(): void;
}

/** The rendered facts that make one cached height answer valid. */
export interface RowHeightEnvironment {
  /** Changes whenever the boxes measured by this rendering can lay out differently. */
  layoutKey(): string | null;
  /** A face-sensitive ruler kept in the DOM independently of the rendered window. */
  faceElement(): Element | null;
}

const desktopEnvironment: RowHeightEnvironment = {
  layoutKey: () => document.querySelector<HTMLElement>(
    '.tblwrap table:not(.proto) colgroup col')?.style.width ?? null,
  faceElement: () => document.querySelector(
    '.tblwrap table.proto td.name .name-row > div'),
};

/**
 * `measure` is not a test affordance and not a strategy: the DOM half can NEVER succeed under
 * jsdom, which lays nothing out, so with no seam here the cache's rules — what invalidates it and
 * what does not — would be the one part of this file no suite could hold. The browser evidence is
 * the other half and it holds the measurement itself
 * (`app/e2e/smoke.spec.ts`, `app/e2e/cross-browser.spec.ts`).
 */
export function createRowHeights<T extends NameEntry = NameEntry>(
  onInvalidate: () => void,
  measure: (entries: readonly T[]) => number[] | null =
    measureDesktopRowHeights as (entries: readonly T[]) => number[] | null,
  environment: RowHeightEnvironment = desktopEnvironment,
): RowHeights<T> {
  let key: string | null = null;
  /** The prototype ruler width the cached answer was measured beside; see `watchProto`. */
  let faceKey: number | null = null;
  let cachedFor: readonly T[] | null = null;
  let cached: number[] | null = null;
  let destroyed = false;

  const invalidate = () => {
    key = null;
    faceKey = null;
    cachedFor = null;
    cached = null;
    onInvalidate();
  };
  // `loadingdone` rather than the `fonts.ready` promise: that promise settles against the loads
  // pending when it is asked, and this app asks before the table that requests the faces has
  // mounted (`app/e2e/fit-support.ts`, `awaitFacesLoaded`). The event fires on each settling,
  // including the replacement face the retry adds — in the two engines that send it.
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  fonts?.addEventListener?.('loadingdone', invalidate);

  /**
   * The half that does not depend on an engine sending an event: **the prototype's face ruler is
   * part of the key, and a `ResizeObserver` on it is what makes anything ask.**
   *
   * Its width is its content's, so it moves when the face under it does and stays put when nothing
   * has. Being in the KEY is what makes this correct — a call that arrives for any other reason
   * re-measures if the face has moved under it — and the observer is only the push that makes a call
   * happen at all, since nothing else on the page changes when a face swaps.
   *
   * **Compared, never counted.** The first shape of this swallowed the observer's first delivery as
   * a baseline, on the reasoning that an observer reports the size it starts with. That is a rule
   * about WHEN a callback lands, and it is not safe to hold one: an engine free to deliver that
   * first callback after the swap would have the only delivery there ever was eaten by it. Two
   * widths either differ or they do not, whenever the callback arrives.
   *
   * Attached on the first call rather than in the constructor, because the prototype is markup the
   * component renders and this is built while its script is still running.
   */
  const faceWidth = () => environment.faceElement()?.getBoundingClientRect().width ?? null;
  let watcher: ResizeObserver | null = null;
  let watched: Element | null = null;
  const watchProto = () => {
    if (typeof ResizeObserver === 'undefined') return;
    const block = environment.faceElement();
    if (!block || block === watched) return;
    watcher ??= new ResizeObserver(() => {
      if (faceKey !== null && faceWidth() !== faceKey) invalidate();
    });
    watcher.disconnect();
    watched = block;
    watcher.observe(block);
  };

  return {
    heights(entries) {
      // Nothing is measured or answered after `destroy()`. The subscription is what would notice a
      // face settling, so an answer given after it is unsealed from the one thing that invalidates
      // it — and `null`, which the caller already handles by rendering everything, is the honest
      // reply from a thing that has been torn down.
      if (destroyed) return null;
      watchProto();
      const layout = environment.layoutKey();
      const face = faceWidth();
      if (layout === key && face === faceKey && cachedFor === entries && cached) return cached;
      const measured = measure(entries);
      // A failure is never cached. It means the table is not up yet, and the next call is the one
      // that can succeed. It no longer means "the window happens to hold no discontinued shoe":
      // that was a fact about the scroll position, and the prototype row above is what removed it.
      if (!measured) return null;
      key = environment.layoutKey();
      // Read AFTER the measurement rather than before it, so what the answer is filed under is the
      // prototype as it stood while the names were laid out beside it.
      faceKey = faceWidth();
      cachedFor = entries;
      cached = measured;
      return measured;
    },
    destroy() {
      fonts?.removeEventListener?.('loadingdone', invalidate);
      watcher?.disconnect();
      watcher = null;
      watched = null;
      destroyed = true;
      key = null;
      cachedFor = null;
      cached = null;
    },
  };
}
