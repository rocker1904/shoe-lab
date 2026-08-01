// Measurement helpers for hunting agents. Numeric by default: box geometry, overflow, composited
// contrast, tab order and focus rings all read out of the DOM at negligible cost, and a screenshot
// costs more than all of them together. `shot()` therefore demands a reason, which lands in the
// finding so a reviewer can tell why an eye was needed.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright';
// Promoted from journey 5, which built it after finding that computed contrast disagrees with paint.
import { decodePng, contrast } from './png.mjs';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../.hunt/shots');
const ENGINES = { chromium, firefox, webkit };
let shotSeq = 0;

/** Everything a shared view is supposed to carry, in one comparable snapshot. Built by journey 3. */
const FINGERPRINT = /* js */ `() => {
  const q = (s) => document.querySelector(s);
  const txt = (el) => (el?.textContent ?? '').replace(/\\s+/g, ' ').trim();
  const rows = document.querySelectorAll('tbody tr');
  return {
    url: location.search,
    stored: localStorage.getItem('shoe-lab.view.v4'),
    rowCount: rows.length,
    firstRows: [...rows].slice(0, 3).map((r) => txt(r).slice(0, 60)),
    heads: [...document.querySelectorAll('thead th')].map((th) => ({ label: txt(th).slice(0, 40), sort: th.getAttribute('aria-sort') || null })),
    receipt: txt(q('[data-testid="receipt"]') || q('.receipt')),
    toolbar: txt(q('.toolbar')),
    stripPresent: Boolean(q('.setup-strip')),
    pressed: [...document.querySelectorAll('[aria-pressed="true"],[aria-checked="true"]')].map((e) => txt(e).slice(0, 30)),
    checked: [...document.querySelectorAll('input[type=checkbox]')].filter((c) => c.checked).map((c) => c.id || c.name || txt(c.closest('label'))),
    title: document.title,
  };
}`;

// Playwright's string-form `evaluate` returns undefined rather than throwing, so a broken helper
// looks like a clean measurement. Build real functions instead — `new Function` serialises fine.
const one = (src) => new Function('el', `return (${src})([el])[0]`);
const all = (src) => new Function('els', `return (${src})(els)`);

/**
 * Colour must be converted by the browser, never string-parsed. This app's graded cells compute to
 * `oklab(0.63 -0.027 -0.169 / 0.998)`, and a parser that reads the first three numbers as r,g,b
 * returns a confident, wrong ratio — the exact failure the evidence bar exists to catch. A 1x1
 * canvas normalises anything CSS can express, including oklab, oklch and color().
 */
const CONTRAST = /* js */ `(els) => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };

  // background-image gradients paint over background-color and are otherwise invisible to a
  // background-color-only walk — which made every reading an at-rest one and missed --hover-wash
  // entirely. Stops are de-duplicated because linear-gradient(c, c) is one flat layer, not two.
  const STOPS = /(?:oklab|oklch|rgba?|hsla?|color)\\([^()]*\\)|#[0-9a-fA-F]{3,8}/g;

  return els.map((el) => {
    // Root-first, in paint order, so a cell wash at alpha .93 over a white surface composites to
    // the colour the eye actually receives. Reading only the element's own background is how a
    // contrast check silently passes.
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.push(n);
    chain.reverse();

    const layers = [];
    for (const n of chain) {
      const s = getComputedStyle(n);
      const bg = rgba(s.backgroundColor);
      if (bg.a > 0) layers.push(bg);
      if (s.backgroundImage && s.backgroundImage.includes('gradient')) {
        for (const stop of [...new Set(s.backgroundImage.match(STOPS) ?? [])]) {
          const c = rgba(stop);
          if (c.a > 0) layers.push(c);
        }
      }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers) base = over(layer, base);

    const cs = getComputedStyle(el);
    const ink = over(rgba(cs.color), base);
    const [hi, lo] = [lum(ink), lum(base)].sort((a, b) => b - a);
    const px = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    return {
      ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
      // Large text passes at 3:1 under WCAG; scoring every cell against 4.5 over-reports.
      required: px >= 24 || (px >= 18.66 && weight >= 700) ? 3 : 4.5,
      text: (el.textContent ?? '').trim().slice(0, 30),
      hasText: Boolean((el.textContent ?? '').trim()),
      ink: cs.color,
      background: 'rgb(' + [base.r, base.g, base.b].map(Math.round).join(', ') + ')',
      fontPx: px,
      weight,
    };
  });
}`;

/**
 * A box-shadow focus ring is painted, not reserved, so any ancestor with overflow clip/hidden/auto
 * cuts it off silently. The polish pass applies one box-shadow rule to every focusable thing and
 * the phone panel sets overflow-y: clip, so "is the ring drawn" is not the question — "is it drawn
 * where it can be seen" is.
 */
const RING = /* js */ `(els) => els.map((el) => {
  const cs = getComputedStyle(el);
  const shadow = cs.boxShadow === 'none' ? '' : cs.boxShadow;
  const outline = cs.outlineStyle === 'none' ? '' : cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor;
  // Split on commas OUTSIDE parentheses — rgb(a, b, c) is full of commas — so each shadow layer can
  // be judged separately. An inset layer paints inside the box and therefore cannot be clipped by an
  // ancestor; counting it made 57 of 80 stops on the phone false positives, all from tr.shoe's
  // deliberately-inset ring.
  const layers = shadow ? shadow.split(/,(?![^(]*\\))/) : [];
  const outset = layers.filter((l) => !l.includes('inset'));
  const lengths = outset.flatMap((l) => (l.match(/-?[\\d.]+px/g) ?? []).map((v) => Math.abs(parseFloat(v))));
  const spread = Math.max(0, ...lengths, parseFloat(cs.outlineWidth) || 0, parseFloat(cs.outlineOffset) || 0);
  const box = el.getBoundingClientRect();
  const clippedBy = [];
  for (let n = el.parentElement; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (!/clip|hidden|auto|scroll/.test(s.overflowX + ' ' + s.overflowY)) continue;
    const r = n.getBoundingClientRect();
    const slack = Math.min(box.left - r.left, r.right - box.right, box.top - r.top, r.bottom - box.bottom);
    if (slack < spread) clippedBy.push({
      el: n.tagName.toLowerCase() + (n.className ? '.' + String(n.className).split(' ')[0] : ''),
      overflow: s.overflowX + '/' + s.overflowY,
      slackPx: Math.round(slack),
      needsPx: Math.round(spread),
    });
  }
  return { painted: Boolean(shadow || outline), shadow, outline, spreadPx: Math.round(spread), clippedBy };
})`;

export async function open({
  engine = 'firefox', width = 1440, height = 900,
  theme, reducedMotion, storage, touch = false,
} = {}) {
  const browser = await ENGINES[engine].launch();
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme,
    reducedMotion: reducedMotion ? 'reduce' : undefined,
    storageState: storage,
    // `@media (hover: none)` and `pointer: coarse` are most of what a phone journey is about, and
    // neither fires without a touch context. isMobile is Chromium/WebKit only — passing it to
    // Firefox throws, which is why this is per-engine rather than one flag.
    ...(touch ? { hasTouch: true, ...(engine === 'firefox' ? {} : { isMobile: true }) } : {}),
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const rig = {
    page, browser, context, engine, width, height, consoleErrors,
    base: '',

    async goto(to = '/') {
      await page.goto(to.startsWith('http') ? to : rig.base + to);
      await page.waitForLoadState('networkidle');
      // The webfont swaps in after first paint and reflows the chrome; measuring before it settles
      // reads geometry no user ever sees (visual-polish spec §The webfont makes --thead-top time-varying).
      await page.evaluate(() => document.fonts?.ready);
      return rig;
    },

    async box(sel) {
      const b = await page.locator(sel).first().boundingBox();
      return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    },

    overflows: () => page.evaluate(() => {
      const d = document.documentElement;
      return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, overflowsBy: d.scrollWidth - d.clientWidth };
    }),

    contrast: (sel) => page.locator(sel).first().evaluate(one(CONTRAST)),

    /**
     * The adjudicator: contrast read off the painted pixels rather than computed from the cascade.
     * `contrast()` composites in sRGB, but this app's ramp paints with `color-mix(in oklab)`, so
     * the computed figure runs about 0.04 low in light — enough to have produced one false
     * suspicion. Use `contrast*` to sweep and this to settle. Costs a screenshot, so settle only
     * what the sweep flags.
     */
    async contrastPainted(sel) {
      const buf = await page.locator(sel).first().screenshot();
      const { w, h, px } = decodePng(buf);
      // Sample rather than read every pixel: a wide cell is tens of thousands of them and the
      // colour census converges long before that.
      const step = Math.max(1, Math.round(Math.sqrt((w * h) / 20000)));
      const tally = new Map();
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const key = px(x, y).join(',');
          tally.set(key, (tally.get(key) ?? 0) + 1);
        }
      }
      const total = [...tally.values()].reduce((a, b) => a + b, 0);
      const ranked = [...tally].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k.split(',').map(Number), n]);

      // Ink comes from the cascade, not from the pixels. Picking the pixel furthest in luminance
      // chose the surrounding white surface on a partly-filled box and reported 3.682 where the
      // truth was 4.729 — the uncertain half is the BACKGROUND (which the ramp mixes in oklab),
      // and the text colour is exactly known.
      const ink = await page.locator(sel).first().evaluate((el) => {
        const c = getComputedStyle(el).color.match(/[\d.]+/g).map(Number);
        return [c[0], c[1], c[2]];
      });

      // Report every background covering ≥10% of the box, so a partly-filled element shows both
      // its filled and unfilled halves rather than silently picking one.
      const candidates = ranked.filter(([, n]) => n / total >= 0.1).slice(0, 3).map(([c, n]) => ({
        background: `rgb(${c.join(', ')})`,
        share: Math.round((n / total) * 100),
        ratio: Math.round(contrast(ink, c) * 1000) / 1000,
      }));
      return {
        ratio: Math.min(...candidates.map((c) => c.ratio)),   // the worst place the text actually sits
        ink: `rgb(${ink.join(', ')})`,
        candidates,
        distinctColours: ranked.length,
      };
    },
    /** Every match in one call, so a whole ramp of graded cells costs what a single cell costs. */
    contrastAll: (sel) => page.locator(sel).evaluateAll(all(CONTRAST)),

    /** Only the ones that actually fail, already sorted — the shape a finding wants. */
    async contrastFailures(sel) {
      const cells = await rig.contrastAll(sel);
      return cells.filter((c) => c.hasText && c.ratio < c.required).sort((a, b) => a.ratio - b.ratio);
    },

    /**
     * `focused: false` means the measurement is meaningless, not that a ring is missing. An element
     * that is display:none at this viewport swallows .focus() silently, and reading its resting
     * style then reports `painted: false` for a control that is simply not there — a false alarm
     * that cost journey-1 real time to rule out.
     */
    async focusRing(sel) {
      const target = page.locator(sel).first();
      const visible = await target.isVisible().catch(() => false);
      if (!visible) return { focused: false, visible: false, why: `${sel} is not visible at ${width}px — nothing to measure`, painted: null, clippedBy: [] };
      await target.focus();
      const state = await target.evaluate((el) => ({
        focused: el === document.activeElement,
        // :focus-visible does not apply to a programmatic .focus() once the last interaction was a
        // pointer, so a probe that clicks a trigger and then measures reads spread 0 — identical to
        // a missing ring. This produced one wrong reading before journey 5 caught it.
        focusVisible: el.matches(':focus-visible'),
      }));
      if (!state.focused) return { focused: false, visible: true, why: `${sel} did not take focus — is it disabled or inert?`, painted: null, clippedBy: [] };
      if (!state.focusVisible) return { focused: true, focusVisible: false, visible: true, why: `${sel} is focused but not :focus-visible — the last interaction was a pointer, so this measurement is void. Drive with Tab (see ringWalk) instead.`, painted: null, clippedBy: [] };
      return { focused: true, focusVisible: true, visible: true, ...(await target.evaluate(one(RING))) };
    },

    /**
     * Ring measurement the only way it is valid: driven by Tab, so :focus-visible actually applies.
     * Returns one row per stop with the ring and any clipping ancestor — which is how 0028 (the
     * third brand list nobody had treated) was found.
     */
    async ringWalk(steps = 40) {
      const out = [];
      for (let i = 0; i < steps; i++) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(new Function(`
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const name = el.getAttribute('aria-label') || (el.textContent ?? '').trim().slice(0, 40);
          const ring = (${RING})([el])[0];
          return { name, tag: el.tagName.toLowerCase(), focusVisible: el.matches(':focus-visible'), ...ring };
        `));
        if (!stop) break;
        out.push(stop);
      }
      return out;
    },

    /** Ordered accessible names as Tab walks forward; flags a cycle (trap) and where focus escapes. */
    async tabWalk(steps = 40) {
      const seen = [];
      for (let i = 0; i < steps; i++) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
          const a = document.activeElement;
          if (!a || a === document.body) return null;
          const labelledBy = a.getAttribute('aria-labelledby');
          // <label for> and a wrapping <label> both name a control and neither is reachable from
          // the element's own attributes or text. Missing them reported (NO ACCESSIBLE NAME) on
          // every properly-labelled checkbox in the app — a spurious a11y bug on a correct control.
          const byFor = a.id && document.querySelector(`label[for="${CSS.escape(a.id)}"]`);
          const name = a.getAttribute('aria-label')
            || (labelledBy && document.getElementById(labelledBy)?.textContent?.trim())
            || byFor?.textContent?.trim()
            || a.closest('label')?.textContent?.trim()
            || a.title || a.alt || (a.textContent ?? '').trim().slice(0, 60);
          return {
            tag: a.tagName.toLowerCase(),
            role: a.getAttribute('role'),
            name: name || '',
            visible: a.getBoundingClientRect().width > 0,
          };
        });
        if (!stop) { seen.push({ tag: '(body)', name: '(focus left the page)' }); break; }
        // Only when our cheap computation comes up empty, pay for Playwright's own accessible-name
        // engine — so a reported missing name is the browser's verdict, never our approximation's.
        if (!stop.name) {
          const snapshot = await page.locator(':focus').ariaSnapshot().catch(() => '');
          stop.name = snapshot.match(/"([^"]+)"/)?.[1] ?? '(NO ACCESSIBLE NAME)';
          stop.confirmedByPlaywright = true;
        }
        if (seen.length > 1 && `${seen[0].tag}:${seen[0].name}` === `${stop.tag}:${stop.name}`) {
          seen.push({ ...stop, cycledToStart: true });
          break;
        }
        seen.push(stop);
      }
      return seen;
    },

    /** Role and name as Playwright's own accessibility engine computes them, not our approximation. */
    names: (sel) => page.locator(sel).ariaSnapshot(),

    /**
     * Change viewport without relaunching — a nine-width ladder was costing a browser launch each.
     * The settle is not optional: a resize measured immediately after `session()` returns reported
     * WebKit rendering the desktop table at 600px, a 317px overflow that does not exist.
     */
    async resize(w, h = height, { settle = 400 } = {}) {
      await page.setViewportSize({ width: w, height: h });
      rig.width = w; rig.height = h;
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.waitForTimeout(settle);
      return rig;
    },

    /** What is actually painted at a point — the question three findings needed and had to hand-roll. */
    at: (x, y) => page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || ''),
        text: (el.textContent ?? '').trim().slice(0, 40),
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    }, [x, y]),

    /** Is it on screen right now — not merely in the DOM, and not merely `visible`. */
    inView: (sel) => page.locator(sel).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        onScreen: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
        fully: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        viewport: { w: innerWidth, h: innerHeight },
      };
    }),

    /**
     * Every element whose content overflows its own box — per-element, where `overflows()` is
     * document-only. Inline elements are skipped: <strong>/<span>/<a> report clientWidth 0, so
     * every one of them looks like an overflow and buries the real hits.
     */
    clipped: (within = 'body') => page.locator(`${within} *`).evaluateAll((els) => els
      .filter((el) => !getComputedStyle(el).display.startsWith('inline')
        && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1))
      .slice(0, 40)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').split(' ')[0],
        byX: el.scrollWidth - el.clientWidth,
        byY: el.scrollHeight - el.clientHeight,
        overflow: getComputedStyle(el).overflowX + '/' + getComputedStyle(el).overflowY,
        text: (el.textContent ?? '').trim().slice(0, 30),
      }))),

    /** Reload-and-return is where journey 1 found two bugs; these were hand-rolled every time. */
    storage: () => page.evaluate(() => Object.fromEntries(
      Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]),
    )),

    /**
     * One comparable snapshot of everything a shared view is supposed to carry. Built by journey 3,
     * promoted here because it is the core instrument of any round-trip question — pair it with the
     * exported `diff()` rather than eyeballing two blobs.
     */
    fingerprint: () => page.evaluate(new Function(`return (${FINGERPRINT})()`)),

    /** What actually lands on the clipboard, which 0017 proved is not always what is on screen. */
    async copyLink(sel = 'button:has-text("Copy link")') {
      await page.locator(sel).first().click();
      return page.evaluate(() => navigator.clipboard.readText().catch(() => null));
    },

    clearStorage: () => page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }),

    async reload() {
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts?.ready);
      return rig;
    },

    /**
     * Viewport by default. A locator screenshot of `body` captures the whole document — 27,830px
     * tall on the phone fleet — which is useless for a layout question and expensive to produce.
     * Pass `{full: true}` deliberately, or a selector for a specific element.
     */
    async shot(reasonWhyPixelsAreNeeded, sel, { full = false, label = 'shot' } = {}) {
      if (!reasonWhyPixelsAreNeeded || reasonWhyPixelsAreNeeded.length < 12) {
        throw new Error('shot() needs a reason an eye is the instrument — otherwise measure it instead');
      }
      // Sequence, not Date.now(): timestamped names sort away from each other and are impossible
      // to attribute back to the run that took them.
      mkdirSync(SHOTS, { recursive: true });
      const file = join(SHOTS, `${label}-${engine}-${rig.width}-${String(++shotSeq).padStart(2, '0')}.png`);
      if (sel && sel !== 'body') await page.locator(sel).first().screenshot({ path: file });
      else await page.screenshot({ path: file, fullPage: full });
      return { file, reason: reasonWhyPixelsAreNeeded };
    },

    /**
     * Coordinate mouse work silently misses anything outside the viewport — Firefox recorded zero
     * pointerdown at an off-screen point where Chromium recorded them, which reads as "the app is
     * broken" for several probes. Scrolling into view first is the whole fix.
     */
    async drag(sel, dx, dy = 0, steps = 12) {
      const target = page.locator(sel).first();
      await target.scrollIntoViewIfNeeded();
      const b = await target.boundingBox();
      if (!b) throw new Error(`drag(): ${sel} has no box — is it in the DOM and laid out?`);
      const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
      await page.mouse.up();
      return { from: { x: Math.round(x), y: Math.round(y) }, by: { dx, dy } };
    },

    close: () => browser.close(),
  };
  return rig;
}

/** The common shape: serve once, then drive engines and widths against it. */
export async function session(serveUrl, opts = {}) {
  const rig = await open(opts);
  rig.base = serveUrl;
  await rig.goto(opts.path ?? '/');
  return rig;
}

/**
 * A visit with provably no stored state. A fresh context starts empty, but the first `goto` may
 * already have written — so this clears and reloads, then asserts. Journey 3 hand-built this twice
 * and it is the whole basis of the cold-link-versus-returning-visitor distinction that 0015 turns on.
 */
export async function cold(serveUrl, path = '/', opts = {}) {
  const rig = await session(serveUrl, { ...opts, path: '/' });
  await rig.clearStorage();
  await rig.goto(path);
  const left = await rig.storage();
  if (Object.keys(left).length) {
    await rig.clearStorage();
    await rig.goto(path);
  }
  rig.wasCold = true;
  return rig;
}

/**
 * Sender and recipient, as two independent browsing histories. This journey IS two contexts, and
 * a bug like 0015 — where the recipient's own last session answers a link — is invisible to any
 * rig that only ever has one.
 */
export async function pair(serveUrl, opts = {}) {
  const [sender, recipient] = await Promise.all([session(serveUrl, opts), session(serveUrl, opts)]);
  return {
    sender,
    recipient,
    close: () => Promise.all([sender.close(), recipient.close()]),
  };
}

/** Structural diff of two fingerprints — the comparison a round-trip journey is actually making. */
export function diff(a, b, path = '') {
  const out = [];
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const [x, y] = [a?.[k], b?.[k]];
    const p = path ? `${path}.${k}` : k;
    if (x && y && typeof x === 'object' && typeof y === 'object') out.push(...diff(x, y, p));
    else if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ at: p, a: x, b: y });
  }
  return out;
}
