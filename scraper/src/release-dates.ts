import type { ReleaseYearsFile } from '../../shared/types.js';
import type { DataDir } from './data-files.js';
import type { PoliteHttp } from './http.js';
import { ValidationError } from './validate.js';

// No robots gate for api.runrepeat.com — project decision, 2026-07-26. That host serves
// `Disallow: /` for every agent, but it is the JSON backend the site's own category pages
// call from the browser (this exact endpoint, these exact params), and it hosts no crawlable
// documents; we read the blanket rule as index hygiene for an API host rather than a refusal
// to serve. Usage stays deliberately small and attended: ~70 throttled requests, run by hand
// alongside the rare details refresh, never in the weekly job. The document hosts we actually
// crawl (runrepeat.com pages) keep their robots checks in scrape-metrics-main/scrape-details-main.
const API = 'https://api.runrepeat.com';
const PAGE_SIZE = 30;
const MAX_PAGES = 100;
const MIN_SHOES = 300;
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
  if (shoeCount < MIN_SHOES) throw new ValidationError(`only ${shoeCount} shoes seen (<${MIN_SHOES})`);
  if (yearCount < MIN_YEARS) throw new ValidationError(`only ${yearCount} release years found (<${MIN_YEARS})`);

  dataDir.write('release-years.json', { scrapedAt: new Date().toISOString(), years } satisfies ReleaseYearsFile);
  return { shoeCount, yearCount };
}
