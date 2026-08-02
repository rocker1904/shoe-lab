// Serves the built app with the REAL 450-shoe dataset — the inverse of app/scripts/prepare-e2e.mjs,
// which swaps the real data out for a 5-shoe fixture. Every real-data-only defect the suite cannot
// see (the 1200px overflow being the known one) is only reachable from here.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');

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
function buildIfStale(ROOT, DIST, DATA) {
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

/**
 * `root` serves a different checkout — a worktree carrying a branch under review, so a finding can
 * be re-run against the change rather than reasoned about. Its own data/ and node_modules are used,
 * and nothing is written outside it.
 */
export async function start({ port = 4180, build = true, root = HERE } = {}) {
  const DIST = join(root, 'app/dist');
  const DATA = join(root, 'data/shoes.json');
  if (build) buildIfStale(root, DIST, DATA);
  /**
   * Read into memory, never copied into `dist/`. Copying is a RACE the rig cannot see: an
   * `npm -w app run e2e` in any checkout rewrites `app/dist/shoes.json` with the 5-shoe fixture
   * mid-session, and from that moment every measurement is of `cushy` and `Cushy 2` rather than
   * the fleet — silently, because the page still renders and only a screenshot gives it away. It
   * happened twice (`.hunt/fixlog-f15.md`, and F12 hit the same collision). Served from memory the
   * collision cannot occur at all: the bytes are taken once, at start, and nothing on disk is
   * written or read for them again.
   */
  const shoes = readFileSync(DATA);

  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/shoes.json') {
      res.writeHead(200, { 'content-type': TYPES['.json'] });
      res.end(shoes);
      return;
    }
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
    shoeCount: JSON.parse(shoes.toString('utf8')).shoes.length,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

// `node .hunt/serve-real.mjs` serves until killed, for hand-driving in a browser.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { url, shoeCount } = await start();
  console.error(`serving ${shoeCount} shoes at ${url}`);
}
