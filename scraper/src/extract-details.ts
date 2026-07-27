import type { DetailRecord } from '../../shared/types.js';
import { PayloadError } from './page-payload.js';
import { sanitizeHtml } from './sanitize.js';

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

  const featuresFact = (Array.isArray(pageData?.features) ? pageData.features : []).find((f: any) => f?.slug === 'features');

  // The plate section sits one level inside a parent section, and the parent varies by shoe
  // (docs/scraping.md §Data quirks).
  const hasPlateSection = sections.some((s: any) =>
    s?.section_id === 'plate'
    || (Array.isArray(s?.sections) && s.sections.some((n: any) => n?.section_id === 'plate')));

  return {
    scrapedAt,
    productId: p.id,
    name: String(p.name),
    brand: p.brand_name ? String(p.brand_name) : null,
    releasedAt: p.released_at ? String(p.released_at).slice(0, 10) : null,
    preciseReleaseDate: Boolean(p.precise_released_at),
    score: typeof p.score === 'number' ? p.score : null,
    msrpGbp: typeof p.price === 'number' ? p.price : null, // GBP list price on /uk pages
    discontinued: Boolean(p.discontinued),
    imageUrl: p.image?.url ? String(p.image.url).replace('{SIZE}', '400') : null,
    runrepeatUrl: `https://runrepeat.com/uk/${slug}`,
    features: (featuresFact?.values ?? []).map((v: any) => String(v?.text ?? '')).filter(Boolean),
    hasPlateSection,
    pros: (Array.isArray(c.pros_clean) ? c.pros_clean : []).map(String),
    cons: (Array.isArray(c.cons_clean) ? c.cons_clean : []).map(String),
    intro: String(c.intro_clean ?? c.intro ?? ''),
    whoShouldBuy: findSection(/who should buy/i, /\bnot\b/i),
    whoShouldNotBuy: findSection(/who should not buy/i),
  };
}
