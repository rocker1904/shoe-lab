import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRowHeights, measureDesktopRowHeights, measurePhoneGroupHeights, type NameEntry,
  type PhoneHeightEntry, type RowHeightEnvironment,
} from './row-height';
import { fireResizeObservers } from '../test-setup';

/**
 * Half of this module cannot be tested here and is not meant to be: jsdom lays nothing out, so the
 * measurement's ANSWER is a browser fact and lives in `app/e2e/smoke.spec.ts` and
 * `app/e2e/cross-browser.spec.ts`, which run the same function in three engines. What is held here
 * is the half those cannot reach — that a DOM which cannot answer produces `null` rather than a
 * number, that nothing is left behind when it does, and the cache's rules.
 */

/**
 * The desktop table's name cell to the depth the measurement reaches into it — **and the hidden
 * prototype table beside it**, which is where every clone and the chip's markup now come from.
 *
 * **BOTH rows carry the state a real row carries** — open, focusable, answering to a slug — where
 * the app's own prototype carries none of it. That difference is deliberate and it is the opposite
 * of what it looks like. The de-stating rule is a claim about the node that is CLONED, and once the
 * clone source moved from the shoe row to the prototype, a clean prototype made every strip in
 * `deState` deletable with the suite green: the guard was asserting the absence of something nothing
 * had put there. The fixture is the half that has to be dirty. The two rows still differ in their
 * figure cell, which is what says WHICH one was cloned.
 *
 * `padded` is the difference between the two fallbacks jsdom can reach. Without it jsdom resolves
 * `padding-left` to the empty string — it computes no used values — so the width a name would wrap
 * at is `NaN` and the measurement stops there. With it the width resolves, the container and the
 * replica are both built for real, and the stop is the one that matters more: every box jsdom lays
 * out is zero, so the row the rest of the table sets has no height to be a floor.
 */
function mountTable(
  { discontinued = true, nameColPx = '300px', otherColPx = '100px', padded = false,
    proto = true } = {},
): void {
  const pad = padded ? 'padding: 8px; border: 0 solid;' : '';
  const nameCell = (name: string, chip: boolean) => `
            <td class="name" style="${pad}">
              <div class="name-row">
                <span class="chev open">&rsaquo;</span>
                <div><strong>${name}</strong>${chip ? '<span class="disc-tag">discontinued</span>' : ''}</div>
              </div>
            </td>`;
  const cols = `<colgroup><col style="width: ${nameColPx}" /><col style="width: ${otherColPx}" /></colgroup>`;
  document.body.innerHTML = `
    <div class="tblwrap">
      <table>
        ${cols}
        <tbody>
          <tr class="shoe" data-slug="a" tabindex="0" aria-expanded="true" aria-controls="detail-a">
            ${nameCell('A Shoe', true)}
            <td class="num">1</td>
          </tr>
        </tbody>
      </table>
      ${proto ? `<table class="proto" aria-hidden="true">
        ${cols}
        <tbody>
          <tr data-slug="p" tabindex="0" aria-expanded="true" aria-controls="detail-p">
            ${nameCell('M', discontinued)}
            <td class="num">0</td>
          </tr>
        </tbody>
      </table>` : ''}
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

const PHONE: PhoneHeightEntry[] = [
  { name: 'A Shoe', metadata: ['June 2025', 'Carbon'], discontinued: false },
  { name: 'B Shoe', metadata: ['Gusset: Both sides (semi)'], discontinued: true },
];

function mountPhonePrototype(): void {
  document.body.innerHTML = `
    <div class="mobile-proto">
      <table class="proto" aria-hidden="true"><tbody>
        <tr class="rule"><td colspan="2"></td></tr>
        <tr class="shoe" data-slug="prototype" tabindex="0" aria-expanded="true">
          <td class="ident" colspan="2"><span class="chev open">›</span><strong>M</strong>
            <span class="meta">old</span><span class="disc-tag">discontinued</span></td>
        </tr>
        <tr class="values"><td><span class="chip">0</span></td><td><span class="chip">0</span></td></tr>
      </tbody></table>
    </div>`;
}

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

  it('clones the hidden prototype rather than whichever shoe is in the body', () => {
    // **The whole of what the window changed here.** The clone source used to be the first
    // `tr.shoe` in the DOM, which under a windowed body is whichever row the runner has scrolled to
    // — and can be no row at all. The fixture's two rows differ in one readable way, their figure
    // cell, so this says which one was copied rather than that something was.
    mountTable({ padded: true });
    const added: Element[] = [];
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true });
    measureDesktopRowHeights(NAMES);
    for (const record of observer.takeRecords()) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) added.push(node, ...node.querySelectorAll('*'));
      }
    }
    observer.disconnect();
    const figures = added.filter((e) => e.classList.contains('num')).map((e) => e.textContent);
    expect(figures.length, 'no replica row was built, so this proves nothing').toBeGreaterThan(0);
    expect(figures, 'the replica was cloned from a shoe row rather than from the prototype')
      .toEqual(figures.map(() => '0'));
  });

  it('declines rather than reaching for a shoe row when there is no prototype', () => {
    // The honest answer where the markup this depends on is gone: `null`, which the caller already
    // handles by rendering everything. Never a fall back to a live row — that is the arrangement
    // the window made unsound in the first place.
    mountTable({ padded: true, proto: false });
    expect(measureDesktopRowHeights(NAMES)).toBeNull();
  });

  it('carries no row state onto anything it lays out', () => {
    // *A clone is a shape, never a state.* The rule is stated in the module and this is what holds
    // it: BOTH of the fixture's rows are open, focusable and answer to a slug, and none of that may
    // reach anything laid out. `.chev.open` was a real wrong answer once — a rotated chevron's
    // transformed box read 18px for a 5px glyph, so every name was laid out 13px narrow — and the
    // module keeps all three strips whether or not the app's own prototype needs them.
    //
    // **One assertion per strip, because they are deletable one at a time.** The attribute loop, the
    // chevron declass and the chip removal each have their own line here; with only the attributes
    // held, the other two came out of `row-height.ts` with the suite green.
    //
    // The answer cannot discriminate under jsdom, which lays nothing out, so what is asserted is
    // what was BUILT, drained from the records rather than read off the document: every container
    // is removed before the call returns.
    mountTable({ padded: true });
    const added: Element[] = [];
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true });
    measureDesktopRowHeights(NAMES);
    for (const record of observer.takeRecords()) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) added.push(node, ...node.querySelectorAll('*'));
      }
    }
    observer.disconnect();
    expect(added.length, 'nothing was built, so this proves nothing').toBeGreaterThan(0);
    for (const attr of ['data-slug', 'aria-expanded', 'aria-controls', 'tabindex']) {
      expect(added.filter((e) => e.hasAttribute(attr)).map((e) => e.outerHTML),
        `a clone carried ${attr}`).toEqual([]);
    }
    expect(added.filter((e) => e.matches('.chev.open')).map((e) => e.outerHTML),
      'a clone kept the rotated chevron of an open row').toEqual([]);
    // The chip is a strip AND a deliberate addition, which is why the claim is a count rather than
    // an absence: the container carries one for each discontinued name it is asked to measure, and
    // none for anything else. Leaving the source's own chip on the block would glue a second one to
    // every name — the cloned chip plus the one `chipHtml` splices in — and measure every continued
    // shoe against a line it does not render.
    expect(added.filter((e) => e.matches('.disc-tag')).length,
      'a chip reached a name that carries none, or a discontinued name lost the one it carries')
      .toBe(NAMES.filter((n) => n.discontinued).length);
  });

  it('leaves nothing behind in the document when it gives up', () => {
    mountTable({ padded: true });
    const before = document.querySelector('.tblwrap')!.innerHTML;
    measureDesktopRowHeights(NAMES);
    expect(document.querySelector('.tblwrap')!.innerHTML).toBe(before);
    // Every hidden node this builds is `aria-hidden`, so the count is the check — less the one the
    // component itself renders and this function never touches, which is the prototype table.
    expect(document.querySelectorAll('[aria-hidden="true"]:not(.proto)')).toHaveLength(0);
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

describe('measurePhoneGroupHeights', () => {
  it('declines with no permanent phone prototype', () => {
    expect(measurePhoneGroupHeights(PHONE)).toBeNull();
  });

  it('builds whole groups from the prototype without carrying state or trusting upstream text', () => {
    mountPhonePrototype();
    const hostile: PhoneHeightEntry[] = [{
      name: '<img src=x onerror=alert(1)>', metadata: ['<b>not markup</b>'], discontinued: false,
    }, ...PHONE.slice(1)];
    const added: Element[] = [];
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true });
    expect(measurePhoneGroupHeights(hostile)).toBeNull();
    for (const record of observer.takeRecords()) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) added.push(node, ...node.querySelectorAll('*'));
      }
    }
    observer.disconnect();

    expect(added.filter((e) => e.matches('tr.shoe'))).toHaveLength(hostile.length);
    expect(added.filter((e) => e.matches('tr.values'))).toHaveLength(hostile.length);
    expect(added.filter((e) => e.matches('tr.rule'))).toHaveLength(hostile.length - 1);
    expect(added.map((e) => e.tagName)).not.toContain('IMG');
    expect(added.map((e) => e.tagName)).not.toContain('B');
    expect(added.filter((e) => e.hasAttribute('data-slug') || e.hasAttribute('tabindex')
      || e.hasAttribute('aria-expanded'))).toEqual([]);
    expect(added.filter((e) => e.matches('.chev.open'))).toEqual([]);
    expect(added.filter((e) => e.matches('.disc-tag'))).toHaveLength(1);
    expect(document.querySelector('.mobile-proto')!.querySelectorAll('tbody')).toHaveLength(1);
  });

  it('has no free variables so the browser suite measures this exact function', () => {
    mountPhonePrototype();
    const rebuilt = new Function(`return (${measurePhoneGroupHeights.toString()})`)() as
      typeof measurePhoneGroupHeights;
    expect(rebuilt(PHONE)).toBeNull();
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

  it('takes its layout key and face ruler from the rendering that owns the measurement', () => {
    mountTable();
    const ruler = document.createElement('span');
    document.body.append(ruler);
    let layout = 'phone:390:score,weight';
    let facePx = 100;
    vi.spyOn(ruler, 'getBoundingClientRect')
      .mockImplementation(() => ({ width: facePx }) as DOMRect);
    const environment: RowHeightEnvironment = {
      layoutKey: () => layout,
      faceElement: () => ruler,
    };
    const measure = fake([60, 76]);
    const onInvalidate = vi.fn();
    const rh = createRowHeights(onInvalidate, measure, environment);

    expect(rh.heights(NAMES)).toEqual([60, 76]);
    document.querySelector<HTMLElement>('colgroup col')!.style.width = '999px';
    expect(rh.heights(NAMES)).toEqual([60, 76]);
    expect(measure).toHaveBeenCalledTimes(1);

    layout = 'phone:390:score,weight,plate';
    rh.heights(NAMES);
    expect(measure).toHaveBeenCalledTimes(2);

    facePx = 140;
    fireResizeObservers();
    expect(onInvalidate).toHaveBeenCalledTimes(1);
    rh.heights(NAMES);
    expect(measure).toHaveBeenCalledTimes(3);
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

  /**
   * jsdom lays nothing out, so the prototype's width is stood up by hand here. That is the whole
   * mechanism rather than a stand-in for it: what invalidates is the WIDTH having moved, never the
   * observer having fired, and the two tests below are the two halves of that.
   */
  function protoWidth(): (px: number) => void {
    const block = document.querySelector('.tblwrap table.proto td.name .name-row > div')!;
    let px = 100;
    vi.spyOn(block, 'getBoundingClientRect')
      .mockImplementation(() => ({ width: px }) as DOMRect);
    return (next: number) => { px = next; };
  }

  it('drops every height when the prototype changes width, which is what a face swap does', () => {
    // **The half that does not depend on an engine sending an event.** WebKit dispatches no
    // `loadingdone` at all — `loading` and then silence, with `document.fonts.status` reading
    // `loaded` — so a table that mounted before its faces landed would hold the fallback's heights
    // there for the life of the page, with the spacers standing for shoes that are not that tall.
    mountTable();
    const setWidth = protoWidth();
    const measure = fake([36, 53]);
    const onInvalidate = vi.fn();
    const rh = createRowHeights(onInvalidate, measure);
    rh.heights(NAMES);
    setWidth(140);
    fireResizeObservers();
    expect(onInvalidate).toHaveBeenCalledTimes(1);
    rh.heights(NAMES);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('keeps the cache when the observer fires and the prototype has not moved', () => {
    // The delivery is not the signal, and this is the case that says so. The first shape of this
    // swallowed the observer's first callback as a baseline, which is a rule about WHEN a callback
    // lands — and an engine free to deliver that one after a face swap would have had the only
    // delivery there ever was eaten by it. Two widths either differ or they do not.
    mountTable();
    protoWidth();
    const measure = fake([36, 53]);
    const onInvalidate = vi.fn();
    const rh = createRowHeights(onInvalidate, measure);
    rh.heights(NAMES);
    fireResizeObservers();
    fireResizeObservers();
    expect(onInvalidate).not.toHaveBeenCalled();
    rh.heights(NAMES);
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it('stops watching the prototype when it is destroyed', () => {
    mountTable();
    const setWidth = protoWidth();
    const onInvalidate = vi.fn();
    const rh = createRowHeights(onInvalidate, fake([36, 53]));
    rh.heights(NAMES);
    rh.destroy();
    setWidth(140);
    fireResizeObservers();
    expect(onInvalidate).not.toHaveBeenCalled();
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
