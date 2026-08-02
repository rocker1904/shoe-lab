import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryFailedFaces } from './font-retry';

/**
 * jsdom implements neither `FontFace` nor `document.fonts`, and the CSSOM it does implement drops
 * `@font-face` descriptors it does not know. So the set, the constructor and the sheet are all
 * stood up here: what is under test is the WIRING — which failure schedules which rebuild, how many
 * times, and with what arguments — and none of that needs a real font pipeline.
 */
class FakeFace {
  static built: { family: string; src: string; descriptors: Record<string, unknown> }[] = [];
  loads = 0;
  constructor(
    public family: string,
    public src: string,
    public descriptors: Record<string, unknown>,
  ) { FakeFace.built.push({ family, src, descriptors }); }
  load() { this.loads++; return Promise.reject(new Error('still failing')); }
}

const rule = (declarations: Record<string, string>) => ({
  style: { getPropertyValue: (p: string) => declarations[p] ?? '' },
});

function fakeDoc(rules: ReturnType<typeof rule>[] = [
  rule({ 'font-family': "'Inter Tight'", src: 'url("./inter-tight-abc123.woff2") format("woff2-variations")', 'font-weight': '400 700', 'font-display': 'swap' }),
]) {
  const listeners = new Set<(e: Event) => void>();
  const added: unknown[] = [];
  return {
    added,
    listeners,
    fail: (...families: string[]) => {
      const e = { fontfaces: families.map((family) => ({ family })) } as unknown as Event;
      for (const l of [...listeners]) l(e);
    },
    doc: {
      baseURI: 'https://rocker1904.github.io/shoe-lab/',
      styleSheets: [{ href: 'https://rocker1904.github.io/shoe-lab/assets/index-xyz.css', cssRules: rules }],
      fonts: {
        add: (f: unknown) => added.push(f),
        addEventListener: (_t: string, l: (e: Event) => void) => listeners.add(l),
        removeEventListener: (_t: string, l: (e: Event) => void) => listeners.delete(l),
      },
    } as unknown as Document,
  };
}

let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  FakeFace.built = [];
  (globalThis as { FontFace?: unknown }).FontFace = FakeFace;
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  delete (globalThis as { FontFace?: unknown }).FontFace;
});

describe('retryFailedFaces', () => {
  /*
   * The rebased URL is the whole point of the assertion. A `url()` in CSS resolves against the
   * SHEET; the same string in the `FontFace` constructor resolves against the DOCUMENT, and Vite
   * emits a sheet-relative one — so the unrebased string asks the site root for a file that lives
   * under `assets/`, and every retry 404s while reporting the network error the first load did.
   * Measured in Chromium against the real build before this was added.
   */
  it('rebuilds a face that errored from its own @font-face rule, against that sheet', () => {
    const f = fakeDoc();
    stop = retryFailedFaces({ doc: f.doc, backoffMs: 10 });
    f.fail('Inter Tight');
    expect(FakeFace.built, 'nothing before the backoff has elapsed').toHaveLength(0);
    vi.advanceTimersByTime(10);
    expect(FakeFace.built).toEqual([{
      family: 'Inter Tight',
      src: 'url("https://rocker1904.github.io/shoe-lab/assets/inter-tight-abc123.woff2") format("woff2-variations")',
      descriptors: { weight: '400 700', style: undefined, stretch: undefined, display: 'swap', unicodeRange: undefined },
    }]);
    expect(f.added).toHaveLength(1);
  });

  /** An inline `<style>` has no `href`, and its own `url()`s resolve against the document. */
  it('falls back to the document for a sheet with no address of its own', () => {
    const f = fakeDoc();
    (f.doc.styleSheets as unknown as { href: string | null }[])[0]!.href = null;
    stop = retryFailedFaces({ doc: f.doc, backoffMs: 10 });
    f.fail('Inter Tight');
    vi.advanceTimersByTime(10);
    expect(FakeFace.built[0]!.src).toBe('url("https://rocker1904.github.io/shoe-lab/inter-tight-abc123.woff2") format("woff2-variations")');
  });

  // The bound, and it is per family: the chain is driven by each rebuilt face's own failure
  // arriving back at the listener, so nothing but this count stops it.
  it('gives up after the bounded number of attempts', () => {
    const f = fakeDoc();
    stop = retryFailedFaces({ doc: f.doc, attempts: 2, backoffMs: 10 });
    for (let i = 0; i < 6; i++) {
      f.fail('Inter Tight');
      vi.advanceTimersByTime(1000);
    }
    expect(FakeFace.built).toHaveLength(2);
  });

  it('backs off further on each attempt', () => {
    const f = fakeDoc();
    stop = retryFailedFaces({ doc: f.doc, attempts: 2, backoffMs: 100 });
    f.fail('Inter Tight');
    vi.advanceTimersByTime(99);
    expect(FakeFace.built).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(FakeFace.built).toHaveLength(1);

    f.fail('Inter Tight');
    vi.advanceTimersByTime(199);
    expect(FakeFace.built, 'the second wait is longer than the first').toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeFace.built).toHaveLength(2);
  });

  it('counts each family separately', () => {
    const f = fakeDoc([
      rule({ 'font-family': "'Inter Tight'", src: 'url("./inter.woff2")' }),
      rule({ 'font-family': 'JetBrains Mono', src: 'url("./mono.woff2")' }),
    ]);
    stop = retryFailedFaces({ doc: f.doc, attempts: 1, backoffMs: 10 });
    f.fail('Inter Tight', 'JetBrains Mono');
    vi.advanceTimersByTime(10);
    expect(FakeFace.built.map((b) => b.family)).toEqual(['Inter Tight', 'JetBrains Mono']);
  });

  it('leaves a family with no @font-face rule alone', () => {
    const f = fakeDoc();
    stop = retryFailedFaces({ doc: f.doc, backoffMs: 10 });
    f.fail('Some Host Face');
    vi.advanceTimersByTime(10);
    expect(FakeFace.built).toHaveLength(0);
  });

  // A sheet from another origin throws on `cssRules` rather than returning nothing, and a throw
  // there must not take the retry down with it.
  it('walks past a sheet it may not read', () => {
    const f = fakeDoc();
    (f.doc.styleSheets as unknown as unknown[]).unshift({
      get cssRules(): never { throw new DOMException('cross-origin'); },
    });
    stop = retryFailedFaces({ doc: f.doc, backoffMs: 10 });
    f.fail('Inter Tight');
    vi.advanceTimersByTime(10);
    expect(FakeFace.built).toHaveLength(1);
  });

  it('drops its listener and any pending attempt when the returned function runs', () => {
    const f = fakeDoc();
    stop = retryFailedFaces({ doc: f.doc, backoffMs: 10 });
    f.fail('Inter Tight');
    stop();
    stop = undefined;
    vi.advanceTimersByTime(1000);
    expect(FakeFace.built).toHaveLength(0);
    expect(f.listeners.size).toBe(0);
  });

  it('does nothing at all where the browser exposes no font set', () => {
    const stopped = retryFailedFaces({ doc: { styleSheets: [] } as unknown as Document });
    expect(stopped).toBeTypeOf('function');
    expect(() => stopped()).not.toThrow();
  });
});
