import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MetricsFile, TestsFile } from '../../shared/types.js';
import { METRIC_TYPES } from './coerce.js';
import type { DataDir } from './data-files.js';
import type { PoliteHttp } from './http.js';
import { parseLabTestList } from './lab-test-list.js';
import { extractPagePayload, PayloadError } from './page-payload.js';
import { isPathAllowed, parseRobots } from './robots.js';
import { extractTestCatalogue } from './test-catalogue.js';
import { validateMetrics } from './validate.js';

const BASE = 'https://runrepeat.com';
const API = 'https://api.runrepeat.com';

export interface ScrapeMetricsOptions {
  http?: PoliteHttp;
  dataDir: DataDir;
  seed: string;
  corpusDir?: string;
  log?: (msg: string) => void;
}

/**
 * Catalogue-only re-extract from a local page. The readings live behind the API and cannot be
 * replayed from disk, so `metrics.json` is deliberately left alone — this exists to pick up new
 * catalogue *fields* without spending a crawl (docs/scraping.md §Re-extracting from a corpus).
 */
function catalogueFromCorpus(dataDir: DataDir, corpusDir: string, seed: string): { shoeCount: number; testCount: number } {
  const file = join(corpusDir, `${seed}.html`);
  if (!existsSync(file)) throw new Error(`seed page not in corpus: ${file}`);
  const page = extractPagePayload(readFileSync(file, 'utf8'));
  // Re-reading disk is not reading RunRepeat, so the recorded timestamp stands
  // (docs/scraping.md §Determinism).
  const scrapedAt = dataDir.read<TestsFile>('tests.json')?.scrapedAt ?? new Date().toISOString();
  const tests = extractTestCatalogue(page.pageData, seed, scrapedAt);
  dataDir.write('tests.json', tests);
  return { shoeCount: Object.keys(dataDir.read<MetricsFile>('metrics.json')?.shoes ?? {}).length, testCount: tests.tests.length };
}

export async function scrapeMetrics({ http, dataDir, seed, corpusDir, log = () => {} }: ScrapeMetricsOptions): Promise<{ shoeCount: number; testCount: number }> {
  if (corpusDir) return catalogueFromCorpus(dataDir, corpusDir, seed);
  if (!http) throw new Error('scrapeMetrics needs either http or corpusDir');
  const rules = parseRobots(await http.getText(`${BASE}/robots.txt`));
  for (const path of [`/uk/${seed}`, '/api/product/lab-test-list/1']) {
    if (!isPathAllowed(rules, path)) throw new Error(`robots.txt disallows ${path}; aborting politely`);
  }

  const page = extractPagePayload(await http.getText(`${BASE}/uk/${seed}`));
  if (page.entityId === null) throw new PayloadError('seed page has no entity id');
  const scrapedAt = new Date().toISOString();
  const tests = extractTestCatalogue(page.pageData, seed, scrapedAt);

  const next: MetricsFile = { scrapedAt, shoes: {} };
  const fetchable = tests.tests.filter((t) => METRIC_TYPES.has(t.type));
  for (const test of fetchable) {
    log(`test ${test.id} (${test.slug})`);
    const rows = parseLabTestList(
      await http.getJson(`${API}/api/product/lab-test-list/${test.id}?product_id=${page.entityId}`),
      test,
    );
    for (const [slug, row] of rows) {
      const shoe = (next.shoes[slug] ??= { name: row.name, url: row.url, values: {} });
      shoe.values[String(test.id)] = row.value;
    }
  }

  const prev = dataDir.read<MetricsFile>('metrics.json');
  validateMetrics(next, prev, tests);
  dataDir.write('tests.json', tests);
  dataDir.write('metrics.json', next);
  return { shoeCount: Object.keys(next.shoes).length, testCount: tests.tests.length };
}
