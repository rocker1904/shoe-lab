import { fileURLToPath } from 'node:url';
import { dataDir } from './data-files.js';
import { PoliteHttp } from './http.js';
import { scrapeDetails } from './scrape-details-main.js';

const args = process.argv.slice(2);
const argOf = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const corpusDir = argOf('--from-corpus');

scrapeDetails({
  http: corpusDir ? undefined : new PoliteHttp(),
  corpusDir,
  dataDir: dataDir(argOf('--data-dir') ?? fileURLToPath(new URL('../../data', import.meta.url))),
  forceAll: args.includes('--force-all'),
  slug: argOf('--slug'),
  log: console.error,
}).then((r) => {
  console.error(`fetched=${r.fetched.length} tombstoned=${r.tombstoned.length} skipped=${r.skipped} failed=${r.failed.length}`);
  for (const f of r.failed) console.error(`  FAIL ${f.slug}: ${f.error}`);
  if (r.failed.length > 0) process.exit(1);
}).catch((e) => { console.error(e); process.exit(1); });
