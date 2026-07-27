import type { DetailRecord, FactValue, VersionRef } from '../../shared/types.js';
import { PayloadError } from './page-payload.js';
import { decodeEntities, factValues } from './page-text.js';
import { sanitizeHtml } from './sanitize.js';

/**
 * The editorial facts kept per shoe. RunRepeat publishes ~30; these are the ones that say
 * something about the shoe rather than about the page, and each is a label rather than a
 * measurement (docs/scraping.md §Editorial facts). Widening the list costs no requests.
 */
export const KEPT_FACTS = ['pace', 'arch-support', 'strike-pattern', 'width'] as const;

function versionRef(v: any): VersionRef | null {
  const slug = v?.slug, name = v?.name;
  if (typeof slug !== 'string' || slug === '' || typeof name !== 'string' || name === '') return null;
  return { slug, name: decodeEntities(name) };
}

export function extractDetails(pageData: Record<string, any>, slug: string, scrapedAt: string): DetailRecord {
  const p = pageData?.product;
  if (!p || typeof p.id !== 'number' || !p.name) throw new PayloadError(`product missing for ${slug}`);
  const c = pageData?.content ?? {};
  const sections: any[] = Array.isArray(c?.lab?.sections) ? c.lab.sections : [];

  const findSection = (match: RegExp, exclude?: RegExp): string | null => {
    const s = sections.find((s) => {
      const title = String(s?.title ?? '');
      return match.test(title) && (!exclude || !exclude.test(title));
    });
    const clean = s ? sanitizeHtml(String(s.content ?? '')) : '';
    return clean === '' ? null : clean;
  };

  const allFacts: any[] = Array.isArray(pageData?.features) ? pageData.features : [];
  const factBySlug = (want: string) => allFacts.find((f: any) => f?.slug === want);

  const facts: Record<string, FactValue[]> = {};
  for (const name of KEPT_FACTS) {
    const values = factValues(factBySlug(name)?.values);
    if (values.length > 0) facts[name] = values;
  }

  // The plate section sits one level inside a parent section, and the parent varies by shoe
  // (docs/scraping.md §Data quirks).
  const hasPlateSection = sections.some((s: any) =>
    s?.section_id === 'plate'
    || (Array.isArray(s?.sections) && s.sections.some((n: any) => n?.section_id === 'plate')));

  // Anything but a non-empty string is "unknown", never a category in its own right:
  // build-dataset drops foreign categories, so a coerced junk value would drop a shoe.
  const category = pageData?.category?.slug;

  return {
    scrapedAt,
    productId: p.id,
    name: decodeEntities(String(p.name)),
    brand: p.brand_name ? decodeEntities(String(p.brand_name)) : null,
    releasedAt: p.released_at ? String(p.released_at).slice(0, 10) : null,
    preciseReleaseDate: Boolean(p.precise_released_at),
    score: typeof p.score === 'number' ? p.score : null,
    msrpGbp: typeof p.price === 'number' ? p.price : null, // GBP list price on /uk pages
    discontinued: Boolean(p.discontinued),
    imageUrl: p.image?.url ? String(p.image.url).replace('{SIZE}', '400') : null,
    runrepeatUrl: `https://runrepeat.com/uk/${slug}`,
    features: factValues(factBySlug('features')?.values).map((v) => v.text),
    hasPlateSection,
    // Entities are decoded here, not at render: these three are interpolated as plain text, so
    // an undecoded `&rsquo;` reaches the reader verbatim (docs/app.md §Sanitised-HTML boundary).
    pros: (Array.isArray(c.pros_clean) ? c.pros_clean : []).map((p: unknown) => decodeEntities(String(p))),
    cons: (Array.isArray(c.cons_clean) ? c.cons_clean : []).map((p: unknown) => decodeEntities(String(p))),
    intro: decodeEntities(String(c.intro_clean ?? c.intro ?? '')),
    whoShouldBuy: findSection(/who should buy/i, /\bnot\b/i),
    whoShouldNotBuy: findSection(/who should not buy/i),
    categorySlug: typeof category === 'string' && category !== '' ? category : null,
    facts,
    previousVersion: versionRef(p.previous_version),
    latestVersion: versionRef(pageData?.last_version),
  };
}
