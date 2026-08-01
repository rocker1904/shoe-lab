// Serves the built app with the REAL 450-shoe dataset — the inverse of app/scripts/prepare-e2e.mjs,
// which swaps the real data out for a 5-shoe fixture. Every real-data-only defect the suite cannot
// see (the 1200px overflow being the known one) is only reachable from here.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, copyFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'app/dist');
const DATA = join(ROOT, 'data/shoes.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
};

function newestMtime(path, skip = new Set()) {
  if (!existsSync(path) || skip.has(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = 0;
  for (const entry of readdirSync(path)) max = Math.max(max, newestMtime(join(path, entry), skip));
  return max;
}

/** Rebuild only when a source is newer than the build, so the second agent never pays for the first agent's build. */
function buildIfStale() {
  const built = newestMtime(join(DIST, 'index.html'));
  const sources = Math.max(
    // sync-data and sync-fonts both write into the source tree during the build, so counting their
    // outputs would make every build look stale the instant it finished.
    newestMtime(join(ROOT, 'app/public'), new Set([join(ROOT, 'app/public/shoes.json')])),
    newestMtime(join(ROOT, 'app/src'), new Set([join(ROOT, 'app/src/assets/fonts')])),
    newestMtime(join(ROOT, 'app/index.html')),
    newestMtime(join(ROOT, 'app/vite.config.js')),
    newestMtime(join(ROOT, 'shared')),
    newestMtime(DATA),
  );
  if (built > sources) return false;
  execFileSync('npm', ['-w', 'app', 'run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  return true;
}

export async function start({ port = 4180, build = true } = {}) {
  if (build) buildIfStale();
  // Unconditional, even on a reused build: an `npm -w app run e2e` at any point leaves the 5-shoe
  // fixture sitting in dist/, and a rig that silently served it would report a clean bill of health
  // on exactly the data that cannot show the bugs.
  copyFileSync(DATA, join(DIST, 'shoes.json'));

  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(DIST, path === '/' ? 'index.html' : path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${port}`,
    shoeCount: JSON.parse(readFileSync(DATA, 'utf8')).shoes.length,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

// `node .hunt/serve-real.mjs` serves until killed, for hand-driving in a browser.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { url, shoeCount } = await start();
  console.error(`serving ${shoeCount} shoes at ${url}`);
}
