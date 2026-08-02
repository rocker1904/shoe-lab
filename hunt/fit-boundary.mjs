// The two claims about this app that ONLY the real fleet can make.
//
// 1. **1180px is where the sidebar fits beside the table.** With 450 shoes and the default columns
//    the document needs 1177px, so a 260px track any narrower buys a column of filters by pushing
//    the table off the screen (docs/app.md §Filters).
// 2. **The default view scrolls sideways at no width.** Which of the two renderings is mounted is a
//    fit decision now, so the table is only ever up where it fits and the list takes over where it
//    would not (docs/app.md §Two renderings, and only one of them mounted). The band that used to
//    run 700→916px at up to 217px over is what this ladder exists to keep closed.
//
// The e2e fixture is five shoes with one-word names and its document fits at every width, so no
// assertion in the suite can see either — docs/app.md §Table presentation records why widening it is
// not the cheaper answer.
//
//   node hunt/fit-boundary.mjs                    # chromium + firefox
//   sh hunt/in-docker.sh hunt/fit-boundary.mjs    # all three
//
// Run it when the fleet grows, when `defaultColumns` changes, when a cell's wording moves, or when
// `lib/fit.ts`'s font tables are regenerated: those are the inputs that move these numbers, and each
// of them moves it silently.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve-real.mjs';
import { open } from './drive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The first width at which the sidebar is a permanent column — `app/src/Page.svelte`'s own. */
const BOUNDARY = 1180;
/**
 * The ladder for claim 2. It samples both renderings, both sidebar regimes, the phone floor at 700
 * and the widths either side of the fit threshold the default view computes (931px on today's
 * fleet), because a threshold is exactly where an off-by-one lands.
 */
const LADDER = [320, 360, 390, 500, 699, 700, 760, 800, 900, 916, 917, 930, 931, 932, 1000, 1100,
  1179, 1180, 1190, 1191, 1280, 1440, 1920];
/**
 * 320px is sampled and not asserted, because two DESIGNED minimums are wider than it: the stacked
 * list's six 53px columns need 332px plus the panel, which is why 360px is documented as the
 * narrowest phone the table is drawn for — docs/app.md §Two renderings, and only one of them mounted
 * — and the toolbar's contents have needed 338px since the chrome rebuild
 * (`.hunt/fixlog-f10.md`, and a backlog item of its own). Asserting there would be asserting against
 * the design rather than against a regression.
 */
const ASSERT_FROM = 360;

const server = await start({ port: 4180, root: ROOT });
const engines = (process.argv[2] ?? 'chromium,firefox').split(',');
const failures = [];

const READ = () => {
  const d = document.documentElement;
  // The mobile table's own panel, reached through the table: `.panel` alone also names the column
  // picker's and the Display menu's boxes, and matching one of those measures nothing.
  const panel = document.querySelector('.tblwrap')
    ?? document.querySelector('[data-testid="shoe-table-mobile"]')?.parentElement;
  const box = panel?.getBoundingClientRect();
  return {
    over: d.scrollWidth - d.clientWidth,
    // What the table itself spills past the window — the half the fit decision owns. Measured off
    // the mounted panel rather than the document, so the toolbar's own overrun cannot mask it or be
    // mistaken for it.
    tableOver: box ? Math.max(0, Math.round(box.right) - d.clientWidth) : 0,
    rendering: document.querySelector('.tblwrap') ? 'desktop' : 'phone',
    permanent: getComputedStyle(document.querySelector('.sidebar')).position === 'sticky',
  };
};

for (const engine of engines) {
  // At the boundary the whole page must fit: the track, the gutters and the table's min-content.
  // One pixel under it the sidebar must be a drawer instead, which is the half a fixture can see
  // but is asserted here too so the two facts are read off the same load.
  for (const width of [BOUNDARY - 1, BOUNDARY]) {
    const rig = await open({ engine, width, height: 900 });
    rig.base = server.url;
    await rig.goto('/');
    const m = await rig.page.evaluate(READ);
    await rig.close();

    const wantPermanent = width >= BOUNDARY;
    const line = `${engine} ${width}px: overflow ${m.over}px, sidebar ` +
      `${m.permanent ? 'permanent' : 'drawer'}`;
    if (m.permanent !== wantPermanent) {
      failures.push(`${line} — expected ${wantPermanent ? 'permanent' : 'drawer'}`);
    } else if (m.permanent && m.over > 0) {
      failures.push(`${line} — the permanent sidebar does not fit beside the table; ` +
        `the boundary has moved to ${width + m.over}px`);
    }
    console.error(line);
  }

  // One session for the ladder: a resize is what a runner does, and a launch a width would cost
  // twenty browsers.
  const rig = await open({ engine, width: LADDER.at(-1), height: 900 });
  rig.base = server.url;
  await rig.goto('/');
  const rows = [];
  for (const width of LADDER) {
    await rig.resize(width, 900, { settle: 150 });
    const m = await rig.page.evaluate(READ);
    rows.push(`${String(width).padStart(5)} ${m.rendering.padStart(8)} over ${String(m.over).padStart(3)}` +
      ` table ${m.tableOver}`);
    if (width >= ASSERT_FROM && m.tableOver > 0) {
      failures.push(`${engine} ${width}px: the ${m.rendering} rendering is ${m.tableOver}px wider ` +
        `than the window — the fit decision mounted a table that does not fit`);
    }
    if (width >= ASSERT_FROM && m.over > 0) {
      failures.push(`${engine} ${width}px: the document scrolls sideways by ${m.over}px`);
    }
  }
  await rig.close();
  console.error(`\n${engine} ladder — width, rendering, document overflow, table overflow\n` +
    rows.join('\n'));
}

await server.stop();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.error(`\nthe sidebar fits from ${BOUNDARY}px up, and the default view scrolls sideways at ` +
  `no width from ${ASSERT_FROM}px, in ${engines.join(' and ')}.`);
