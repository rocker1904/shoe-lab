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
 * and the line counts are read back. Exact by construction, in whatever engine is running, with no
 * font table involved — and the engines really do disagree: on the committed fleet at 1440px with
 * the wide column set, Chromium wraps 35 names onto a second line where Firefox wraps 27 and
 * WebKit 28 (`.hunt/task4/rig.ts`).
 *
 * **What it costs, and why that is affordable.** Measured through this function on the committed
 * fleet of 455 names, medians of nine runs in the Playwright image: **5.2ms in Chromium, 7.0ms in
 * Firefox and WebKit**. Linear with a fixed overhead — 910 names cost 8.6 / 11 / 12ms and 1820 cost
 * 16.3 / 18 / 22 — so twice the fleet costs about 1.6x rather than twice, and a marginal name is
 * under 10us. Nearly all of it is the engine laying out 455 boxes: building the markup is free, the
 * reads are ~0.2ms and the replica rows ~0.4-1.0ms (`.hunt/task4/probe7-cost.mjs`). That is over
 * the 2.0-2.3ms estimated before implementation, and it is not reducible without giving up laying
 * every name out, which is the design.
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
 * `page.evaluate` by `app/e2e/fit-support.ts` and by the `.hunt/` rigs, which is how the
 * measured-equals-rendered bound is a claim about THIS code rather than about a copy of it that
 * drifted. A closure over anything outside the function body — a module constant, an imported
 * helper — does not survive serialisation, and the failure is silent: the reference is simply
 * undefined in the page.
 */
export function measureDesktopRowHeights(names: readonly NameEntry[]): number[] | null {
  const wrap = document.querySelector<HTMLElement>('.tblwrap');
  const table = wrap?.querySelector<HTMLTableElement>('table');
  if (!wrap || !table) return null;

  const widths = [...table.querySelectorAll<HTMLTableColElement>('colgroup col')]
    .map((c) => parseFloat(c.style.width));
  if (!widths.length || !(widths[0]! > 0)) return null;

  // The row every measurement is cloned from. Cloning rather than composing is the whole of why
  // this cannot drift from the table: the component's CSS is Svelte-scoped, so markup built from
  // scratch carries no `svelte-xxxxxx` class and gets none of its styles, while a clone is the
  // component's own node and answers to the same rules it does.
  const liveRow = table.querySelector<HTMLTableRowElement>('tbody tr.shoe');
  const liveCell = liveRow?.querySelector<HTMLTableCellElement>('td.name');
  const nameRow = liveCell?.querySelector<HTMLElement>('.name-row');
  const block = nameRow?.querySelector<HTMLElement>(':scope > div');
  const chev = nameRow?.querySelector<HTMLElement>('.chev');
  if (!liveRow || !liveCell || !nameRow || !block || !chev) return null;

  // What the name wraps at, derived from the DECLARED column rather than read off the block: the
  // block is a flex item and shrinks to its content whenever the name is short, so its own width is
  // an answer about that name rather than about the column. The chevron's advance is part of this
  // and it is not the same in every engine (5.00px in Chromium against 4.58px in Firefox), which is
  // one more reason this is measured in the engine that will render it.
  const cellCs = getComputedStyle(liveCell);
  const avail = widths[0]!
    - parseFloat(cellCs.paddingLeft) - parseFloat(cellCs.paddingRight)
    - parseFloat(cellCs.borderLeftWidth) - parseFloat(cellCs.borderRightWidth)
    - chev.getBoundingClientRect().width
    - (parseFloat(getComputedStyle(nameRow).columnGap) || 0);
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
  // instance the app rendered. Sought across the document rather than inside the cloned row, since
  // whether row one happens to be discontinued is not a fact worth depending on.
  const chipHtml = document.querySelector('td.name .name-row > div > span')?.outerHTML;
  // Refusing to guess: with discontinued names to measure and no instance on the page to copy, the
  // honest answer is that this cannot be measured yet — not a set of heights short by a chip. It
  // heals itself, because a caller told `null` renders everything, and rendering everything puts an
  // instance back on the page (spec §Failure behaviour).
  if (!chipHtml && names.some((n) => n.discontinued)) return null;

  const proto = block.cloneNode(true) as HTMLElement;
  proto.querySelector(':scope > span')?.remove();
  proto.querySelector('strong')!.textContent = SENTINEL;
  proto.removeAttribute('style');
  const plain = proto.outerHTML;
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
    .join('')
    // The ruler, last: one line in the same box as everything above it.
    + plain.replace(SENTINEL, () => 'M');
  liveCell.append(host);

  const kids = host.children;
  // The last child is the ruler: one line, in the same box as everything above it. `line-height`
  // computes to the keyword `normal` here, so it has no length to read — a line is what a line
  // measures, and that is engine- and face-dependent by nature.
  const lineH = kids[kids.length - 1]!.getBoundingClientRect().height;
  if (!(lineH > 0)) { host.remove(); return null; }
  const counts: number[] = [];
  for (let i = 0; i < names.length; i++) {
    counts.push(Math.max(1, Math.round(kids[i]!.getBoundingClientRect().height / lineH)));
  }
  host.remove();

  // A line count is not a height, and the arithmetic that would turn it into one is wrong at the
  // most common row in the fleet. Measured: 1 line is 36px, 2 is 53, and every line after that adds
  // 18 — so the first step is not the step. A one-line row is not set by the NAME at all but by the
  // rest of the row, which is why the replica below is a whole row rather than a name cell, and why
  // there is no base and no step constant anywhere in this file.
  const distinct = [...new Set(counts)].sort((a, b) => a - b);
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
  // One long word per line: n words that each fill most of the column wrap to exactly n lines,
  // whatever the engine's break rules are, so this needs no agreement with them.
  const WORD = 'Mmmmmmmmmmmmmmmmmmmm';
  for (const n of distinct) {
    const tr = liveRow.cloneNode(true) as HTMLTableRowElement;
    // A cloned row carries the original's focusability and its slug; hidden or not, a second node
    // answering to `[data-slug=…]` is what `revealRow` walks.
    tr.removeAttribute('data-slug');
    tr.removeAttribute('tabindex');
    tr.removeAttribute('aria-controls');
    // The chip comes OFF the replica. Its own line is the name's last one, so it adds no height —
    // but left on, it is `n` words plus a chip, which is what makes an n-line name n + 1 lines.
    tr.querySelector('td.name .name-row > div > span')?.remove();
    tr.querySelector('td.name strong')!.textContent =
      Array.from({ length: n }, () => WORD).join(' ');
    tb.append(tr);
  }
  wrap.append(replica);
  const perCount = new Map<number, number>();
  for (let i = 0; i < distinct.length; i++) {
    perCount.set(distinct[i]!, (tb.children[i] as HTMLElement).getBoundingClientRect().height);
  }
  replica.remove();

  return counts.map((n) => perCount.get(n)!);
}

/**
 * The measurement plus the thing a caller would otherwise have to remember: when it stops being
 * true.
 *
 * **Everything that changes how a name breaks invalidates every height at once** — a resize, a
 * browser zoom, a ticked column, and the faces swapping in after first paint, which this app does
 * by self-hosting its own (docs/app.md §Theming). The first three all reach here as a changed
 * name-column width and the cache is keyed on it; the fourth does not change any width at all,
 * which is why it is a subscription rather than a key. Measured before the faces land, every height
 * is the fallback face's. That is the same hazard `Page.svelte` documents for the pinned chrome's
 * height, and it is why that one is `ResizeObserver`-backed.
 *
 * **Keyed on the declared width read back from the DOM, not on one passed in.** The declaration
 * reaches the DOM through a `ResizeObserver`, so for one frame after a resize a caller's width and
 * the table's differ; keying on what the table is actually laid out at cannot measure one width and
 * label it another.
 *
 * A filter change moves neither the width nor the fleet, so it is a cache hit — which is the whole
 * of why this is affordable (docs/app.md §What a drag may recompute).
 */
export interface RowHeights {
  /** Heights for `names` in order, or `null` while nothing can be measured. */
  heights(names: readonly NameEntry[]): number[] | null;
  destroy(): void;
}

/**
 * `measure` is not a test affordance and not a strategy: the DOM half can NEVER succeed under
 * jsdom, which lays nothing out, so with no seam here the cache's rules — what invalidates it and
 * what does not — would be the one part of this file no suite could hold. The browser evidence is
 * the other half and it holds the measurement itself
 * (`app/e2e/smoke.spec.ts`, `app/e2e/cross-browser.spec.ts`).
 */
export function createRowHeights(
  onInvalidate: () => void, measure = measureDesktopRowHeights,
): RowHeights {
  let key: string | null = null;
  let cachedFor: readonly NameEntry[] | null = null;
  let cached: number[] | null = null;

  const invalidate = () => { key = null; cachedFor = null; cached = null; onInvalidate(); };
  // `loadingdone` rather than the `fonts.ready` promise: that promise settles against the loads
  // pending when it is asked, and this app asks before the table that requests the faces has
  // mounted (`app/e2e/fit-support.ts`, `awaitFacesLoaded`). The event fires on each settling,
  // including the replacement face the retry adds.
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  fonts?.addEventListener?.('loadingdone', invalidate);

  return {
    heights(names) {
      // The name column's own declaration, which is the whole of what a name breaks against. It
      // does not move when a filter does — a declared width is `min + share` over the COLUMNS and
      // the track, never over the rows in the DOM, which is what task 3 bought
      // (docs/app.md §Table presentation). So a filter change is a hit and costs nothing.
      const declared = document.querySelector<HTMLElement>('.tblwrap table colgroup col')?.style.width;
      if (declared === key && cachedFor === names && cached) return cached;
      const measured = measure(names);
      // A failure is never cached. It means the table is not up yet — or has no discontinued row to
      // copy a chip from — and the next call is the one that can succeed.
      if (!measured) return null;
      key = declared ?? null;
      cachedFor = names;
      cached = measured;
      return measured;
    },
    destroy() {
      fonts?.removeEventListener?.('loadingdone', invalidate);
    },
  };
}
