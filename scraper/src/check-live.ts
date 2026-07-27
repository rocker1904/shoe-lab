// Live contract check: exercises the three things that would silently break the
// scraper if RunRepeat changed them — robots.txt permissions, the __NUXT_DATA__
// page payload (test catalogue + detail fields), and the lab-test-list API shape.
// Run monthly by .github/workflows/contract-drift.yml. Makes 3 polite requests.
import { extractDetails } from './extract-details.js';
import { PoliteHttp } from './http.js';
import { parseLabTestList } from './lab-test-list.js';
import { extractPagePayload } from './page-payload.js';
import { isPathAllowed, parseRobots } from './robots.js';
import { extractTestCatalogue } from './test-catalogue.js';
import { validateDetailsRecord } from './validate.js';

const BASE = 'https://runrepeat.com';
const API = 'https://api.runrepeat.com';
const SEED = 'saucony-endorphin-azura';

const http = new PoliteHttp();
try {
  // Same two path classes the metrics crawl gates on; drift here means we must stop crawling.
  const rules = parseRobots(await http.getText(`${BASE}/robots.txt`));
  for (const path of [`/uk/${SEED}`, '/api/product/lab-test-list/1']) {
    if (!isPathAllowed(rules, path)) throw new Error(`robots.txt now disallows ${path}`);
  }

  const page = extractPagePayload(await http.getText(`${BASE}/uk/${SEED}`));
  if (page.entityId === null) throw new Error('seed page has no entity id');
  const scrapedAt = new Date().toISOString();
  const tests = extractTestCatalogue(page.pageData, SEED, scrapedAt);
  validateDetailsRecord(extractDetails(page.pageData, SEED, scrapedAt), SEED);

  const heel = tests.tests.find((t) => t.slug === 'heel-stack');
  if (!heel) throw new Error('heel-stack test missing from catalogue');
  const rows = parseLabTestList(
    await http.getJson(`${API}/api/product/lab-test-list/${heel.id}?product_id=${page.entityId}`),
    heel,
  );
  if (rows.size < 300) throw new Error(`only ${rows.size} rows from lab-test-list`);

  console.error('contract ok');
} catch (e) {
  console.error(e);
  process.exit(1);
}
