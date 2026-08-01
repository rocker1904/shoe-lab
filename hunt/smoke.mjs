// Proves the rig works before an agent depends on it. Not a hunt: it asserts nothing about the app,
// it only checks that every helper returns something of the right shape in every engine.
import { start } from './serve-real.mjs';
import { session } from './drive.mjs';

const server = await start();
console.error(`serving ${server.shoeCount} shoes at ${server.url}\n`);

for (const engine of ['firefox', 'chromium', 'webkit']) {
  const t0 = Date.now();
  try {
    const rig = await session(server.url, { engine, width: 1440, height: 900 });
    const rows = await rig.page.locator('tbody tr').count();
    const overflow = await rig.overflows();
    const cells = await rig.contrastAll('tbody td');
    const worst = cells.filter((c) => c.ratio).sort((a, b) => a.ratio - b.ratio)[0];
    const tabs = await rig.tabWalk(8);
    const ring = await rig.focusRing('button');

    console.error(`${engine}  ${Date.now() - t0}ms`);
    console.error(`  rows rendered      ${rows}`);
    console.error(`  document overflow  ${overflow.scrollWidth} vs ${overflow.clientWidth} (by ${overflow.overflowsBy})`);
    console.error(`  contrast samples   ${cells.length}, worst ${worst?.ratio} on ${worst?.background}`);
    console.error(`  tab stops          ${tabs.map((t) => t.name).slice(0, 4).join(' → ')}`);
    console.error(`  focus ring         painted=${ring.painted} spread=${ring.spreadPx}px clippedBy=${ring.clippedBy.length}`);
    console.error(`  console errors     ${rig.consoleErrors.length}${rig.consoleErrors.length ? ': ' + rig.consoleErrors[0].slice(0, 80) : ''}`);
    await rig.close();
  } catch (e) {
    console.error(`${engine}  FAILED after ${Date.now() - t0}ms: ${e.message.split('\n')[0]}`);
  }
  console.error('');
}

await server.stop();
