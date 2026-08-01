// The one claim about this app that ONLY the real fleet can make, and the reason 1180px is the
// width the sidebar becomes permanent at: with 450 shoes and the default six columns the document
// needs 1177px, so a 260px track any narrower buys a column of filters by pushing the table off the
// screen (docs/app.md §Filters). The e2e fixture is five shoes with one-word names and its document
// fits at every width, so no assertion in the suite can see this — docs/app.md §Table presentation
// records why widening the fixture is not the cheaper answer.
//
//   node hunt/fit-boundary.mjs                    # chromium + firefox
//   sh hunt/in-docker.sh hunt/fit-boundary.mjs    # all three
//
// Run it when the fleet grows, when `defaultColumns` changes, or when a cell's wording moves: those
// are the three inputs that move 1177, and each of them moves it silently.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve-real.mjs';
import { open } from './drive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The first width at which the sidebar is a permanent column — `app/src/Page.svelte`'s own. */
const BOUNDARY = 1180;

const server = await start({ port: 4180, root: ROOT });
const engines = (process.argv[2] ?? 'chromium,firefox').split(',');
const failures = [];

for (const engine of engines) {
  // At the boundary the whole page must fit: the track, the gutters and the table's min-content.
  // One pixel under it the sidebar must be a drawer instead, which is the half a fixture can see
  // but is asserted here too so the two facts are read off the same load.
  for (const width of [BOUNDARY - 1, BOUNDARY]) {
    const rig = await open({ engine, width, height: 900 });
    rig.base = server.url;
    await rig.goto('/');
    const m = await rig.page.evaluate(() => {
      const d = document.documentElement;
      return {
        over: d.scrollWidth - d.clientWidth,
        permanent: getComputedStyle(document.querySelector('.sidebar')).position === 'sticky',
      };
    });
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
}

await server.stop();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.error(`\nthe sidebar fits from ${BOUNDARY}px up, in ${engines.join(' and ')}.`);
