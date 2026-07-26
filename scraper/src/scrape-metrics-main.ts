import type { MetricsFile } from '../../shared/types.js';
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
  http: PoliteHttp;
  dataDir: DataDir;
  seed: string;
  log?: (msg: string) => void;
}

export async function scrapeMetrics({ http, dataDir, seed, log = () => {} }: ScrapeMetricsOptions): Promise<{ shoeCount: number; testCount: number }> {
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
