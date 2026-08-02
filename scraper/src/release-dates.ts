import type { ReleaseYearsFile } from '../../shared/types.js';
import type { DataDir } from './data-files.js';
import type { PoliteHttp } from './http.js';
import { ValidationError } from './validate.js';

// No robots gate for api.runrepeat.com — deliberate, and argued in full in
// docs/decisions.md §Be a good citizen toward RunRepeat. The document host we actually crawl
// (runrepeat.com pages) keeps its robots check in scrape-metrics-main/scrape-details-main.
const API = 'https://api.runrepeat.com';
const PAGE_SIZE = 30;
const MAX_PAGES = 100;
/** This supplement's OWN floors, deliberately not `validate.ts`'s `MIN_SHOES`: that gate is about
 *  the fleet a build may publish, these are about whether one API walk saw enough of the catalogue
 *  to be worth writing down. Same magnitude today, different questions — a name shared with the
 *  other would invite moving them together (docs/scraping.md §Validation gates). */
const MIN_SLUGS_SEEN = 300;
const MIN_YEARS = 100;
const YEAR = /^\d{4}$/;

function pageUrl(from: number): string {
  return `${API}/api/category/documents?from=${from}&size=${PAGE_SIZE}&filter[]=1&f_id=2&c_id=2&orderBy=recent&include=facts&exclude=colors`;
}

export function parseReleaseYear(product: any): number | null {
  const options = product?.facts?.['release-date']?.value;
  if (!Array.isArray(options)) return null;
  for (const opt of options) {
    const label = typeof opt?.name === 'string' ? opt.name : typeof opt?.text === 'string' ? opt.text : null;
    if (label !== null && YEAR.test(label)) return Number(label);
  }
  return null;
}

export interface ScrapeReleasesOptions {
  http: PoliteHttp;
  dataDir: DataDir;
  log?: (msg: string) => void;
}

export async function scrapeReleases({ http, dataDir, log = () => {} }: ScrapeReleasesOptions): Promise<{ shoeCount: number; yearCount: number }> {
  const years: Record<string, number> = {};
  const slugs = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    log(`page ${page} (from ${from})`);
    const body = await http.getJson<{ products?: unknown }>(pageUrl(from));
    const products = Array.isArray(body?.products) ? body.products : [];
    if (products.length === 0) break;
    for (const product of products) {
      const slug = (product as { slug?: unknown } | null)?.slug;
      if (typeof slug !== 'string' || slug === '') continue;
      slugs.add(slug);
      const year = parseReleaseYear(product);
      if (year !== null) years[slug] = year;
    }
  }

  const shoeCount = slugs.size;
  const yearCount = Object.keys(years).length;
  if (shoeCount < MIN_SLUGS_SEEN) throw new ValidationError(`only ${shoeCount} shoes seen (<${MIN_SLUGS_SEEN})`);
  if (yearCount < MIN_YEARS) throw new ValidationError(`only ${yearCount} release years found (<${MIN_YEARS})`);

  dataDir.write('release-years.json', { scrapedAt: new Date().toISOString(), years } satisfies ReleaseYearsFile);
  return { shoeCount, yearCount };
}
