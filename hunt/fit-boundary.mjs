// The four claims about this app that ONLY the real fleet can make.
//
// 1. **1191px of LAYOUT is where the sidebar fits beside the default table.** With 450 shoes and the
//    default columns the table's own min-content is 903px, and the floor under the sidebar's
//    boundary is that plus the fit rule's slack, the page's leading gutter and the 260px track — so
//    a permanent sidebar any narrower buys a column of filters by taking the table off the screen
//    (docs/app.md §Filters). A LAYOUT width: where the browser draws a classic scrollbar the WINDOW
//    at that moment is 12–15px wider, which this measures rather than assumes.
// 2. **The default view scrolls sideways at no width.** Which of the two renderings is mounted is a
//    fit decision now, so the table is only ever up where it fits and the list takes over where it
//    would not (docs/app.md §Two renderings, and only one of them mounted). The band that used to
//    run 700→916px at up to 217px over is what this ladder exists to keep closed.
// 3. **Widening the window never takes the table away, for ANY column set.** The sidebar's
//    permanence and the mount decision are one decision over one model; chosen apart they disagree,
//    and the rendering flips twice across the disagreement. A ten-column view handed 170px of width
//    back to the stacked list at exactly 1191px until the sidebar started consulting the fit model
//    (`.hunt/fixlog-f14.md`).
// 4. **Both hold in both scrollbar regimes.** Playwright draws overlay scrollbars headless, so every
//    guard in this repo was measuring a world with no scrollbar in it; a classic one takes 12–15px
//    out of the layout viewport and out of nothing a media query can see. The regime is forced by
//    launching HEADED — the Firefox prefs do nothing headless, which is why `.hunt/fixlog-f13.md`
//    filed this hypothesis dead.
//
// The e2e fixture is five shoes with one-word names and its document fits at every width, so no
// assertion in the suite can see any of these — docs/app.md §Table presentation records why widening
// it is not the cheaper answer.
//
//   node hunt/fit-boundary.mjs                    # chromium + firefox, both regimes
//   sh hunt/in-docker.sh hunt/fit-boundary.mjs    # all three; the classic regime needs xvfb-run
//
// Run it when the fleet grows, when `defaultColumns` changes, when a cell's wording moves, or when
// `lib/fit.ts`'s font tables are regenerated: those are the inputs that move these numbers, and each
// of them moves it silently.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { start } from './serve-real.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The FLOOR under the sidebar's boundary — `SIDEBAR_PERMANENT_PX` in `app/src/lib/fit.ts`,
 *  restated because this file is plain node and that one is TypeScript. A wider column set pushes
 *  its own boundary past it, which is claim 3 and is measured rather than restated. */
const BOUNDARY = 1191;
/**
 * The ladder for claims 2 and 3. It samples both renderings, both sidebar regimes, the phone floor
 * at 700 and the widths either side of BOTH thresholds — the fit threshold the default view computes
 * (931px on today's fleet) and the sidebar's — because a threshold is exactly where an off-by-one
 * lands, and 1180 and 1190 are kept as rungs because they are where a closed band ran.
 */
const LADDER = [320, 360, 390, 500, 699, 700, 760, 800, 900, 916, 917, 930, 931, 932, 1000, 1100,
  1179, 1180, 1190, BOUNDARY - 1, BOUNDARY, BOUNDARY + 1, 1280, 1440, 1920];
/**
 * 320px is sampled and not asserted, because two DESIGNED minimums are wider than it: the stacked
 * list's six 53px columns need 332px plus the panel, which is why 360px is documented as the
 * narrowest phone the table is drawn for — docs/app.md §Two renderings, and only one of them mounted
 * — and the toolbar's contents have needed 338px since the chrome rebuild
 * (`.hunt/fixlog-f10.md`, and a backlog item of its own). Asserting there would be asserting against
 * the design rather than against a regression.
 *
 * A LAYOUT width, like every other number here. A 360px window with a 15px classic scrollbar is a
 * 345px layout, which is inside the designed minimum and one pixel over: measured in headed
 * Chromium, and it is the design's own floor rather than anything the fit decision did.
 */
const ASSERT_FROM = 360;

/**
 * Column sets, because claim 3 is about the SET and not only the width: the track costs 260px
 * whatever is on screen, so a set whose table fits without it and not with it is exactly where a
 * width-only boundary hands the screen back to the list. Ten and twelve are what a runner gets by
 * ticking two or four more metrics onto the default eight.
 */
const DEFAULTS = ['releasedAt', 'score', 'msrpGbp', 'heel-stack', 'plate', 'energy-return-heel',
  'toebox-width-widest-part', 'weight'];
const SETS = [
  { name: 'the default view', path: '/', ladder: true },
  { name: 'ten columns', path: `/?cols=${[...DEFAULTS, 'drop', 'breathability'].join(',')}` },
  { name: 'twelve columns',
    path: `/?cols=${[...DEFAULTS, 'drop', 'breathability', 'flexibility-stiffness',
      'torsional-rigidity'].join(',')}` },
];

/**
 * Coarse first, then per pixel around every change the coarse pass found. A per-pixel walk of the
 * whole range in four engine/regime pairs is twenty minutes of resizes, one sample costing 50ms.
 *
 * The step is the bound this rig is honest about: **it finds any band 8px or wider**, and the
 * narrowest band this class of defect produces is a scrollbar's width — 12px on GTK Firefox, 15px in
 * Chromium. Anything narrower is still caught wherever it touches a rung of the ladder above, which
 * includes both sides of both thresholds.
 */
const COARSE_STEP = 8;
const SWEEP_FROM = 700;
const SWEEP_TO = 1500;

const READ = () => {
  const d = document.documentElement;
  // The mobile table's own panel, reached through the table: `.panel` alone also names the column
  // picker's and the Display menu's boxes, and matching one of those measures nothing.
  const panel = document.querySelector('.tblwrap')
    ?? document.querySelector('[data-testid="shoe-table-mobile"]')?.parentElement;
  const box = panel?.getBoundingClientRect();
  return {
    // The window and the layout it hands the page — the same number only where the scrollbar is an
    // overlay. Every boundary in `lib/fit.ts` is about the second one.
    window: window.innerWidth,
    layout: d.clientWidth,
    over: d.scrollWidth - d.clientWidth,
    // What the table itself spills past the window — the half the fit decision owns. Measured off
    // the mounted panel rather than the document, so the toolbar's own overrun cannot mask it or be
    // mistaken for it.
    tableOver: box ? Math.max(0, Math.round(box.right) - d.clientWidth) : 0,
    rendering: document.querySelector('.tblwrap') ? 'desktop' : 'phone',
    permanent: getComputedStyle(document.querySelector('.sidebar')).position === 'sticky',
    // The name column's `min-width: 14rem` is a floor in the model, and only the fleet can say
    // whether a real shoe name overruns it.
    nameOver: Math.max(0, ...[...document.querySelectorAll('td.name')]
      .map((td) => td.scrollWidth - td.clientWidth)),
  };
};

const ENGINES = { chromium, firefox, webkit };
/**
 * The two scrollbar worlds. Overlay is what Playwright gives headless and what every guard in this
 * repo measured until F14; classic is what a GTK Firefox and a desktop Chromium actually draw, and
 * it appears only with a real display behind the browser.
 */
const REGIMES = [
  { name: 'overlay', launch: {} },
  {
    name: 'classic',
    launch: {
      headless: false,
      firefoxUserPrefs: {
        'ui.useOverlayScrollbars': 0, 'widget.gtk.overlay-scrollbars.enabled': false,
      },
    },
  },
];

const server = await start({ port: 4180, root: ROOT });
const engines = (process.argv[2] ?? 'chromium,firefox').split(',');
const failures = [];
const skipped = [];
/** Which engine/regime pairs actually ran, so the closing line can only claim what was measured —
 *  a headed regime that could not launch is a claim nobody checked. */
const ran = [];

for (const engine of engines) {
  for (const regime of REGIMES) {
    let browser;
    try {
      browser = await ENGINES[engine].launch(regime.launch);
    } catch (e) {
      // Loud rather than silent: a regime that cannot run is a claim that is not being checked, and
      // inside the Playwright image `xvfb-run` is what leads a headed browser.
      skipped.push(`${engine}/${regime.name}: ${String(e).split('\n')[0]} — a headed browser needs `
        + 'a display (try `xvfb-run -a node hunt/fit-boundary.mjs`)');
      continue;
    }
    ran.push(`${engine}/${regime.name}`);
    // One page per engine and regime, resized rather than relaunched: a browser per width would cost
    // hundreds of launches, and a resize is what a runner does anyway.
    const context = await browser.newContext({ viewport: { width: SWEEP_TO, height: 900 } });
    const p = await context.newPage();
    const at = async (width) => {
      await p.setViewportSize({ width, height: 900 });
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return p.evaluate(READ);
    };

    for (const set of SETS) {
      await p.goto(server.url + set.path);
      await p.waitForLoadState('networkidle');
      await p.evaluate(() => document.fonts?.ready);
      const tag = `${engine}/${regime.name} · ${set.name}`;

      // Measured, never assumed: 0 under an overlay, 12px on this GTK Firefox, 15px in Chromium —
      // and every claim below is about the layout width that is left once it is taken.
      const first = await at(SWEEP_TO);
      const scrollbar = first.window - first.layout;

      // Claim 1, stated in LAYOUT widths so the assertion survives the scrollbar rather than being
      // silently 12px out in one regime. The default view only: it is the set the floor is derived
      // from, and a wider set's own boundary is claim 3's business.
      if (set.ladder) {
        for (const layout of [BOUNDARY - 1, BOUNDARY]) {
          const m = await at(layout + scrollbar);
          const want = layout >= BOUNDARY;
          const line = `${tag} ${layout}px of layout (${layout + scrollbar}px window): sidebar `
            + `${m.permanent ? 'permanent' : 'drawer'}, overflow ${m.over}px`;
          if (m.permanent !== want) {
            failures.push(`${line} — expected ${want ? 'permanent' : 'drawer'}`);
          } else if (m.permanent && m.over > 0) {
            failures.push(`${line} — the permanent sidebar does not fit beside the table; the `
              + `boundary has moved to ${layout + m.over}px`);
          }
          console.error(line);
        }
      }

      const seen = new Map();
      const sample = async (width) => {
        if (seen.has(width)) return seen.get(width);
        const m = await at(width);
        seen.set(width, m);
        if (m.layout >= ASSERT_FROM && m.tableOver > 0) {
          failures.push(`${tag} ${width}px: the ${m.rendering} rendering is ${m.tableOver}px wider `
            + 'than the window — the fit decision mounted a table that does not fit');
        }
        if (m.layout >= ASSERT_FROM && m.over > 0) {
          failures.push(`${tag} ${width}px: the document scrolls sideways by ${m.over}px`);
        }
        if (m.nameOver > 0) {
          failures.push(`${tag} ${width}px: a shoe name overruns the 14rem name column by `
            + `${m.nameOver}px, which the model treats as a floor`);
        }
        return m;
      };

      const widths = set.ladder ? [...LADDER] : [];
      for (let w = SWEEP_FROM; w <= SWEEP_TO; w += COARSE_STEP) widths.push(w);
      for (const w of [...new Set(widths)].sort((a, b) => a - b)) await sample(w);

      // Per pixel around every change, so a band's edges are read rather than rounded to the step —
      // and so the width a failure names is the width a runner sees.
      const coarse = [...seen.keys()].sort((a, b) => a - b);
      for (let i = 1; i < coarse.length; i++) {
        const [prev, here] = [seen.get(coarse[i - 1]), seen.get(coarse[i])];
        if (prev.rendering === here.rendering && prev.permanent === here.permanent) continue;
        for (let w = coarse[i - 1] + 1; w < coarse[i]; w++) await sample(w);
      }

      const walk = [...seen.entries()].sort((a, b) => a[0] - b[0])
        .filter(([, m]) => m.layout >= ASSERT_FROM)
        .map(([w, m]) => ({ width: w, ...m }));

      /**
       * Claim 3, and the one that ties the two boundaries together: **widening the window never
       * takes the table away.** The sidebar's track is a 260px step in what the table has to lay
       * itself out in, so a permanence boundary that does not consult the fit model opens a band
       * where the rendering reads desktop → list → desktop as a window is dragged wider. One ran
       * 1180–1190px on the default view until F12 moved the constant, and 1191–1361px on a
       * ten-column view until F14 made the sidebar's permanence a fit decision of its own. This is
       * what keeps both shut, and it is the assertion to read first if a boundary is ever moved by
       * hand.
       */
      for (let i = 1; i < walk.length; i++) {
        if (walk[i].rendering === 'phone' && walk[i - 1].rendering === 'desktop') {
          failures.push(`${tag} ${walk[i].width}px: the rendering reverts to the list at a width `
            + `WIDER than ${walk[i - 1].width}px, where the table was up — the sidebar's boundary `
            + 'and the fit rule disagree about what fits beside a permanent sidebar');
        }
        if (!walk[i].permanent && walk[i - 1].permanent) {
          failures.push(`${tag} ${walk[i].width}px: the sidebar gives its column back at a width `
            + `WIDER than ${walk[i - 1].width}px, where it had one`);
        }
      }
      // The layout the sidebar was always documented never to produce: a 260px column of filters
      // standing beside the stacked list, which is the list precisely because the table did not fit.
      for (const r of walk) {
        if (r.permanent && r.rendering === 'phone') {
          failures.push(`${tag} ${r.width}px: a permanent sidebar beside the stacked list`);
        }
      }

      const changes = walk.filter((r, i) => i === 0
        || r.rendering !== walk[i - 1].rendering || r.permanent !== walk[i - 1].permanent);
      console.error(`\n${tag} — scrollbar ${scrollbar}px, ${walk.length} widths sampled\n`
        + changes.map((r) => `  ${String(r.width).padStart(5)}px window (${r.layout}px layout) `
          + `${r.rendering.padEnd(7)} sidebar ${r.permanent ? 'permanent' : 'drawer'}`).join('\n'));
    }
    await browser.close();
  }
}

await server.stop();
if (skipped.length) console.error(`\nSKIPPED:\n  ${skipped.join('\n  ')}`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.error(`\nthe sidebar fits from ${BOUNDARY}px of layout up, no view scrolls sideways from `
  + `${ASSERT_FROM}px, and no column set hands the table back as the window widens, in `
  + `${ran.join(', ')}.`);
