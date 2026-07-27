import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type DetailsFile, type MetricsFile, isTombstone } from '../../shared/types.js';
import type { DataDir } from './data-files.js';
import { HttpStatusError, type PoliteHttp } from './http.js';
import { extractDetails } from './extract-details.js';
import { extractPagePayload } from './page-payload.js';
import { isPathAllowed, parseRobots } from './robots.js';
import { validateDetailsRecord } from './validate.js';

const BASE = 'https://runrepeat.com';

export interface ScrapeDetailsOptions {
  http?: PoliteHttp;
  dataDir: DataDir;
  corpusDir?: string;
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
  // The corpus path reads from disk and must never construct a request, so the robots gate —
  // which exists to permit live crawling — does not apply to it (docs/scraping.md §Politeness).
  if (opts.corpusDir) {
    if (!existsSync(opts.corpusDir)) throw new Error(`corpus directory not found: ${opts.corpusDir}`);
  } else if (targets.length > 0) {
    if (!http) throw new Error('scrapeDetails needs either http or corpusDir');
    const rules = parseRobots(await http.getText(`${BASE}/robots.txt`));
    if (!isPathAllowed(rules, '/uk/example-shoe')) throw new Error('robots.txt disallows shoe pages; aborting politely');
  }
  for (const slug of targets) {
    log(`fetching ${slug}`);
    try {
      let html: string;
      let scrapedAt = now();
      if (opts.corpusDir) {
        const file = join(opts.corpusDir, `${slug}.html`);
        if (!existsSync(file)) { result.skipped++; continue; }
        html = readFileSync(file, 'utf8');
        // `scrapedAt` records when RunRepeat was read, and re-reading disk is not reading
        // RunRepeat — so the original timestamp stands (docs/scraping.md §Determinism).
        const prior = details.shoes[slug];
        if (prior && !isTombstone(prior)) scrapedAt = prior.scrapedAt;
      } else {
        html = await http!.getText(`${BASE}/uk/${slug}`);
      }
      const rec = extractDetails(extractPagePayload(html).pageData, slug, scrapedAt);
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
