import type { DetailsFile, MetricsFile } from '../../shared/types.js';
import type { DataDir } from './data-files.js';
import { HttpStatusError, type PoliteHttp } from './http.js';
import { extractDetails } from './extract-details.js';
import { extractPagePayload } from './page-payload.js';
import { isPathAllowed, parseRobots } from './robots.js';
import { validateDetailsRecord } from './validate.js';

const BASE = 'https://runrepeat.com';

export interface ScrapeDetailsOptions {
  http: PoliteHttp;
  dataDir: DataDir;
  forceAll?: boolean;
  slug?: string;
  now?: () => string;
  log?: (msg: string) => void;
}

export interface ScrapeDetailsResult {
  fetched: string[];
  tombstoned: string[];
  failed: Array<{ slug: string; error: string }>;
  skipped: number;
}

export async function scrapeDetails(opts: ScrapeDetailsOptions): Promise<ScrapeDetailsResult> {
  const { http, dataDir, log = () => {} } = opts;
  const now = opts.now ?? (() => new Date().toISOString());
  const metrics = dataDir.read<MetricsFile>('metrics.json');
  if (!metrics) throw new Error('metrics.json missing — run scrape:metrics first');
  const details = dataDir.read<DetailsFile>('details.json') ?? { shoes: {} };

  const allSlugs = Object.keys(metrics.shoes).sort();
  const targets = opts.slug
    ? [opts.slug]
    : opts.forceAll
      ? allSlugs
      : allSlugs.filter((s) => details.shoes[s] === undefined);

  const result: ScrapeDetailsResult = { fetched: [], tombstoned: [], failed: [], skipped: allSlugs.length - targets.length };
  if (targets.length > 0) {
    const rules = parseRobots(await http.getText(`${BASE}/robots.txt`));
    if (!isPathAllowed(rules, '/uk/example-shoe')) throw new Error('robots.txt disallows shoe pages; aborting politely');
  }
  for (const slug of targets) {
    log(`fetching ${slug}`);
    try {
      const html = await http.getText(`${BASE}/uk/${slug}`);
      const rec = extractDetails(extractPagePayload(html).pageData, slug, now());
      validateDetailsRecord(rec, slug);
      details.shoes[slug] = rec;
      result.fetched.push(slug);
    } catch (e) {
      if (e instanceof HttpStatusError && e.status === 404) {
        details.shoes[slug] = { gone: true, scrapedAt: now() };
        result.tombstoned.push(slug);
      } else {
        result.failed.push({ slug, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  dataDir.write('details.json', details);
  return result;
}
