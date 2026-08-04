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
 * at is `NaN` and the measurement stops there. With it the width resolves, the container is built
 * for real, and the stop is the one that matters more: every box jsdom lays out is zero, so the
 * ruler has no height and a line count would be a division by nothing.
 */
function mountTable({ discontinued = true, nameColPx = '300px', padded = false } = {}): void {
  const pad = padded ? 'padding: 8px; border: 0 solid;' : '';
  document.body.innerHTML = `
    <div class="tblwrap">
      <table>
        <colgroup><col style="width: ${nameColPx}" /><col style="width: 100px" /></colgroup>
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
    // backreference by the substitution that puts it there.
    mountTable({ padded: true });
    const added: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (node instanceof Element) added.push(...[node, ...node.querySelectorAll('*')].map((e) => e.tagName));
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    expect(measureDesktopRowHeights([
      { name: '<img src=x onerror=alert(1)> & $& <b>bold</b>', discontinued: true },
    ])).toBeNull();
    observer.takeRecords();
    observer.disconnect();
    expect(added).not.toContain('IMG');
    expect(added).not.toContain('B');
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
    // source. A reference to anything outside the body — an imported helper, a module constant —
    // is `undefined` in the page, and the failure is silent. Nothing but the globals a document
    // provides may appear here.
    const src = measureDesktopRowHeights.toString();
    expect(src).not.toMatch(/\bimport\b|\brequire\(/);
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

  it('re-measures for a different fleet at the same width', () => {
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
