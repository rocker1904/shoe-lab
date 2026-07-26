import { fileURLToPath } from 'node:url';
import { dataDir } from './data-files.js';
import { PoliteHttp } from './http.js';
import { scrapeReleases } from './release-dates.js';

const args = process.argv.slice(2);
const argOf = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const dir = argOf('--data-dir') ?? fileURLToPath(new URL('../../data', import.meta.url));

scrapeReleases({ http: new PoliteHttp(), dataDir: dataDir(dir), log: console.error })
  .then((r) => console.error(`ok: ${r.shoeCount} shoes, ${r.yearCount} release years`))
  .catch((e) => { console.error(e); process.exit(1); });
