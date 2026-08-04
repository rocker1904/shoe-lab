import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRowHeights, measureDesktopRowHeights, type NameEntry } from './row-height';

/**
 * Half of this module cannot be tested here and is not meant to be: jsdom lays nothing out, so the
 * measurement's ANSWER is a browser fact and lives in `app/e2e/smoke.spec.ts` and
 * `app/e2e/cross-browser.spec.ts`, which run the same function in three engines. What is held here
 * is the half those cannot reach — that a DOM which cannot answer produces `null` rather than a
 * number, that nothing is left behind when it does, and the cache's rules.
 */

/**
 * The desktop table's name cell, to the depth the measurement reaches into it.
 *
 * `padded` is the difference between the two fallbacks jsdom can reach. Without it jsdom resolves
 * `padding-left` to the empty string — it computes no used values — so the width a name would wrap
 * at is `NaN` and the measurement stops there. With it the width resolves, the container and the
 * replica are both built for real, and the stop is the one that matters more: every box jsdom lays
 * out is zero, so the row the rest of the table sets has no height to be a floor.
 */
function mountTable(
  { discontinued = true, nameColPx = '300px', otherColPx = '100px', padded = false } = {},
): void {
  const pad = padded ? 'padding: 8px; border: 0 solid;' : '';
  document.body.innerHTML = `
    <div class="tblwrap">
      <table>
        <colgroup><col style="width: ${nameColPx}" /><col style="width: ${otherColPx}" /></colgroup>
        <tbody>
          <tr class="shoe" data-slug="a" tabindex="0">
            <td class="name" style="${pad}">
              <div class="name-row">
                <span class="chev">&rsaquo;</span>
                <div><strong>A Shoe</strong>${discontinued ? '<span class="disc-tag">discontinued</span>' : ''}</div>
              </div>
            </td>
            <td class="num">1</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

/**
 * jsdom implements no `document.fonts`, and a bare `EventTarget` is the whole of what this module
 * asks of it — it subscribes to one event and never reads a face. `font-retry.test.ts` stands the
 * set up the same way and for the same reason.
 */
function fakeFonts(): EventTarget {
  const target = new EventTarget();
  Object.defineProperty(document, 'fonts', { value: target, configurable: true });
  return target;
}

const NAMES: NameEntry[] = [
  { name: 'A Shoe', discontinued: false },
  { name: 'B Shoe', discontinued: true },
];

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('measureDesktopRowHeights', () => {
  it('says it cannot measure rather than measuring zero, with no table mounted', () => {
    expect(measureDesktopRowHeights(NAMES)).toBeNull();
  });

  it('says it cannot measure where no width can be resolved', () => {
    mountTable();
    expect(measureDesktopRowHeights(NAMES)).toBeNull();
  });

  it('stops at a width past the name column that will not resolve, before laying anything out', () => {
    // Only the NAME column's width lays a name out, but every column is declared on the replica the
    // row height is read from — and an invalid `<col>` width is dropped rather than refused, so the
    // replica would quietly lay out at a width nobody asked for.
    //
    // The ANSWER cannot discriminate here, because jsdom lays nothing out and so returns `null`
    // whatever the guard does. What discriminates is that nothing was built to be laid out.
    mountTable({ padded: true, otherColPx: 'auto' });
    const added: Element[] = [];
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true });
    expect(measureDesktopRowHeights(NAMES)).toBeNull();
    for (const record of observer.takeRecords()) {
      for (const node of record.addedNodes) if (node instanceof Element) added.push(node);
    }
    observer.disconnect();
    expect(added.map((e) => e.tagName), 'an unresolved column width reached the measurement')
      .toEqual([]);
  });

  it('says it cannot measure where a width resolves but nothing is laid out', () => {
    // The case a caller must never read as "every row is 0px tall": that would window the fleet
    // down to nothing (spec §Failure behaviour). Reached only once a width resolves, which is why
    // the cell is padded here.
    mountTable({ padded: true });
    expect(measureDesktopRowHeights(NAMES)).toBeNull();
  });

  it('puts a name into the container as text, whatever upstream called the shoe', () => {
    // The container is built with `innerHTML`, and the names in it are a scraper's rather than
    // ours — so a name is escaped on the way in, and one carrying `$&` must not be read as a
    // backreference by the substitution that puts it there. The elements say the escaping held;
    // only the TEXT says the substitution did, because a backreference expansion adds no element —
    // it splices the sentinel, or with `` $` `` and `$'` the surrounding markup, into the name.
    mountTable({ padded: true });
    const NAME = '<img src=x onerror=alert(1)> & $& $` $\' <b>bold</b>';
    const added: Element[] = [];
    // Drained rather than observed: a `MutationObserver` callback is a microtask and this test is
    // synchronous, so reading a list the callback fills leaves it empty and every assertion over it
    // passes without seeing anything.
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true });
    expect(measureDesktopRowHeights([{ name: NAME, discontinued: true }])).toBeNull();
    for (const record of observer.takeRecords()) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) added.push(node, ...node.querySelectorAll('*'));
      }
    }
    observer.disconnect();
    expect(added.map((e) => e.tagName)).not.toContain('IMG');
    expect(added.map((e) => e.tagName)).not.toContain('B');
    // The container is removed before the call returns, so what it held is read off the node the
    // records caught rather than off the document.
    const container = added.find((e) => e.getAttribute('aria-hidden') === 'true'
      && e.textContent?.includes('bold'));
    expect(container, 'no measured container was ever added').toBeDefined();
    expect(container!.textContent).toContain(NAME);
  });

  it('leaves nothing behind in the document when it gives up', () => {
    mountTable({ padded: true });
    const before = document.querySelector('.tblwrap')!.innerHTML;
    measureDesktopRowHeights(NAMES);
    expect(document.querySelector('.tblwrap')!.innerHTML).toBe(before);
    expect(document.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
  });

  it('refuses rather than measuring a discontinued name short, with no chip to copy', () => {
    // The chip is its own component with its own scoped class, so it cannot be reconstructed —
    // only copied. With none on the page a measurement would silently be short by one for every
    // discontinued shoe, and short heights are what drift a scrollbar.
    mountTable({ discontinued: false });
    expect(measureDesktopRowHeights([{ name: 'B Shoe', discontinued: true }])).toBeNull();
  });

  it('has no free variables, so it survives being handed to page.evaluate', () => {
    // The browser evidence hands this function whole to `page.evaluate`, which serialises its
    // source and rebuilds it in the page — where a reference to anything outside the body, an
    // imported helper or a module constant, is silently `undefined`. Rebuilt the same way here it
    // is a `ReferenceError` instead, so the property is asserted rather than described. A regex
    // over the source cannot do this job: a compiled ESM import appears in the body as a bare
    // identifier and never as the word `import`.
    //
    // Total, because of where the padded mount stops it: every line of the body runs before the
    // floor it cannot measure sends `null` back, so there is no path a free variable can hide on.
    mountTable({ padded: true });
    const rebuilt = new Function(`return (${measureDesktopRowHeights.toString()})`)() as
      typeof measureDesktopRowHeights;
    expect(rebuilt(NAMES)).toBeNull();
  });
});

describe('createRowHeights', () => {
  const fake = (heights: number[] | null) => vi.fn(() => (heights ? [...heights] : null));

  it('measures once and then answers from the cache while nothing has moved', () => {
    mountTable();
    const measure = fake([36, 53]);
    const rh = createRowHeights(() => {}, measure);
    expect(rh.heights(NAMES)).toEqual([36, 53]);
    expect(rh.heights(NAMES)).toEqual([36, 53]);
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it('re-measures when the name column is declared at a different width', () => {
    mountTable();
    const measure = fake([36, 53]);
    const rh = createRowHeights(() => {}, measure);
    rh.heights(NAMES);
    document.querySelector<HTMLElement>('colgroup col')!.style.width = '260px';
    rh.heights(NAMES);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('re-measures for an equal fleet that is not the SAME array, which is the caller contract', () => {
    // Identity, not contents, and `RowHeights` says so: a caller that rebuilds its names per
    // render — `filtered.map(...)` in a reactive block — misses on every keystroke and pays the
    // whole measurement each time, which is the cost the cache exists to remove. Nothing else
    // states this, and a windowing caller is exactly the one that would get it wrong.
    mountTable();
    const measure = fake([36, 53]);
    const rh = createRowHeights(() => {}, measure);
    rh.heights(NAMES);
    rh.heights([...NAMES]);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('never caches a failure, so the call after the table mounts is the one that answers', () => {
    mountTable();
    const measure = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValue([36, 53]);
    const rh = createRowHeights(() => {}, measure as never);
    expect(rh.heights(NAMES)).toBeNull();
    expect(rh.heights(NAMES)).toEqual([36, 53]);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('drops every height when the faces settle, and says so', () => {
    // The width does not move when a face swaps in, so nothing about the key can notice it — but
    // every measurement taken before it was the fallback face's (docs/app.md §Theming).
    mountTable();
    const fonts = fakeFonts();
    const measure = fake([36, 53]);
    const onInvalidate = vi.fn();
    const rh = createRowHeights(onInvalidate, measure);
    rh.heights(NAMES);
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(onInvalidate).toHaveBeenCalledTimes(1);
    rh.heights(NAMES);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('declines once destroyed, rather than answering from a cache nothing can drop', () => {
    // The subscription is the only thing that would notice a face settling, so an answer given
    // after it is gone is sealed off from the one event that invalidates it. `null` is what the
    // caller already handles, by rendering everything.
    mountTable();
    const measure = fake([36, 53]);
    const rh = createRowHeights(() => {}, measure);
    expect(rh.heights(NAMES)).toEqual([36, 53]);
    rh.destroy();
    expect(rh.heights(NAMES)).toBeNull();
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it('stops listening when it is destroyed', () => {
    mountTable();
    const fonts = fakeFonts();
    const measure = fake([36, 53]);
    const onInvalidate = vi.fn();
    const rh = createRowHeights(onInvalidate, measure);
    rh.destroy();
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(onInvalidate).not.toHaveBeenCalled();
  });
});
