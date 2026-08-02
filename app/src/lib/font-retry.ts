/**
 * Retries a self-hosted face whose load ERRORED.
 *
 * `font-display: swap` covers the paint — a face that never arrives costs a reflow, not a blank
 * page — but nothing re-requested one, so a transient failure on the first load left a runner on
 * the fallback for the whole session. That is not hypothetical: WebKit under a loaded preview
 * server was observed failing both faces' requests and never retrying, which is what made the fit
 * measurements read a fallback's metrics until the e2e guard was taught to refuse them. The guard
 * is the backstop and stays loud; this is the app declining to need it.
 *
 * **A new `FontFace`, not `load()` on the old one.** `FontFace.load()` returns the existing
 * promise for anything whose status is not `unloaded`, so an errored face can never be asked
 * again — retrying means constructing a replacement and adding it to the set.
 *
 * **The URL comes from the `@font-face` rule that failed**, read back out of the CSSOM, so
 * `app/src/app.css` stays the one home for every face's source and descriptors. Vite fingerprints
 * those URLs at build time; restating them here would be a second spelling that a rebuild could
 * silently make wrong.
 *
 * **And it is re-based against the STYLESHEET before it is handed over.** A `url()` in CSS resolves
 * against the sheet it is written in; the same string in a `FontFace` constructor resolves against
 * the document. Vite emits `url("./inter-tight-<hash>.woff2")` from a sheet at `/assets/`, so the
 * unresolved string asks the document root for a file that is not there — every retry 404'd, which
 * a browser reports as the same `NetworkError` the original failure raised. It is also the half
 * that only bites on Pages, where the app is served under a subpath.
 *
 * **Bounded, and it bounds itself.** Each rebuilt face is in the set, so its own failure arrives
 * back at this listener — the chain is driven by the failures rather than by a loop — and the
 * per-family count is what stops it. A face still errored after the last attempt stays errored.
 */

/** Two, with a short backoff: a face that fails three times is not a blip. */
const ATTEMPTS = 2;
const BACKOFF_MS = 300;

/** Every `url()` in a `src` descriptor, made absolute against the sheet that declared it. */
function rebase(src: string, base: string): string {
  return src.replace(/url\((\s*["']?)([^"')]+)(["']?\s*)\)/g, (whole, lead: string, url: string, tail: string) => {
    try { return `url(${lead}${new URL(url, base).href}${tail})`; } catch { return whole; }
  });
}

/** The `@font-face` rule for a family, as the arguments `FontFace` takes. */
function sourceFor(doc: Document, family: string): { src: string; descriptors: FontFaceDescriptors } | null {
  for (const sheet of [...doc.styleSheets]) {
    let rules: CSSRuleList;
    // A cross-origin sheet throws on `cssRules` rather than returning nothing. This app self-hosts,
    // so the throw means "not ours" and skipping is right.
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of [...rules]) {
      const style = (rule as CSSFontFaceRule).style as CSSStyleDeclaration | undefined;
      // Duck-typed rather than `instanceof CSSFontFaceRule` or the deprecated `rule.type`: a rule
      // carrying a `src` descriptor is a font-face rule in every engine, and `src` is not a
      // property any other rule's declaration can hold.
      const src = style?.getPropertyValue('src');
      if (!src) continue;
      if (style!.getPropertyValue('font-family').replace(/^["']|["']$/g, '') !== family) continue;
      return {
        // An inline `<style>` has no `href`; the document is what its own `url()`s resolve against.
        src: rebase(src, sheet.href ?? doc.baseURI),
        descriptors: {
          weight: style!.getPropertyValue('font-weight') || undefined,
          style: style!.getPropertyValue('font-style') || undefined,
          stretch: style!.getPropertyValue('font-stretch') || undefined,
          // Asserted rather than validated: what the rule holds is whatever the sheet declared, and
          // an unknown value is the constructor's to reject, not this function's to police.
          display: (style!.getPropertyValue('font-display') || undefined) as FontDisplay | undefined,
          unicodeRange: style!.getPropertyValue('unicode-range') || undefined,
        },
      };
    }
  }
  return null;
}

export function retryFailedFaces(
  { doc = document, attempts = ATTEMPTS, backoffMs = BACKOFF_MS }:
  { doc?: Document; attempts?: number; backoffMs?: number } = {},
): () => void {
  const fonts = doc.fonts;
  if (!fonts) return () => {};
  const tried = new Map<string, number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;

  const again = (family: string) => {
    const n = tried.get(family) ?? 0;
    if (n >= attempts) return;
    tried.set(family, n + 1);
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (stopped) return;
      const source = sourceFor(doc, family);
      if (!source) return;
      const face = new FontFace(family, source.src, source.descriptors);
      fonts.add(face);
      // The rejection IS the next attempt's trigger — it reaches the listener below as a
      // `loadingerror` — so swallowing it here only keeps an unhandled rejection out of the console.
      void face.load().catch(() => {});
    }, backoffMs * 2 ** n);
    timers.add(timer);
  };

  const onerror = (e: Event) => {
    for (const face of (e as FontFaceSetLoadEvent).fontfaces ?? []) again(face.family);
  };
  fonts.addEventListener('loadingerror', onerror);
  return () => {
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    fonts.removeEventListener('loadingerror', onerror);
  };
}
