import type { LabTest, Shoe } from '../../../shared/types.js';

/** Narrower than the scraper's METRIC_TYPES: `bool` is scraped but is not rangeable (docs/app.md §Filters). */
export const NUMERIC_TEST_TYPES = new Set(['float', 'score', 'percent', 'rating']);
/** Numeric keys that live on the shoe itself rather than in the test catalogue. */
export const FIELD_RANGE_KEYS = new Set(['score', 'msrpGbp']);

export interface TestIndex { bySlug: Map<string, LabTest>; byId: Map<string, LabTest> }

export function indexTests(tests: LabTest[]): TestIndex {
  return {
    bySlug: new Map(tests.map((t) => [t.slug, t])),
    byId: new Map(tests.map((t) => [String(t.id), t])),
  };
}

/**
 * Lab test 52 and the `msrpGbp` field are the same GBP list price from two sources, and the
 * test is the fresher of the two: metrics refresh weekly while a details record only changes
 * when its page is re-crawled (docs/app.md §Resolved price). Both are kept in the dataset;
 * resolving them here is what stops the column, the sort and the filter disagreeing.
 */
export function priceOf(shoe: Shoe, idx: TestIndex): number | undefined {
  return testValue(shoe, 'price', idx) ?? (typeof shoe.msrpGbp === 'number' ? shoe.msrpGbp : undefined);
}

function testValue(shoe: Shoe, slug: string, idx: TestIndex): number | undefined {
  const test = idx.bySlug.get(slug);
  if (!test || !NUMERIC_TEST_TYPES.has(test.type)) return undefined;
  const v = shoe.values[String(test.id)];
  return typeof v === 'number' ? v : undefined;
}

export function numericValue(shoe: Shoe, key: string, idx: TestIndex): number | undefined {
  if (key === 'msrpGbp') return priceOf(shoe, idx);
  if (FIELD_RANGE_KEYS.has(key)) {
    const v = shoe[key as 'score' | 'msrpGbp'];
    return typeof v === 'number' ? v : undefined;
  }
  return testValue(shoe, key, idx);
}

/**
 * Two decimals. The dataset stores readings exactly as RunRepeat computed them, and the two
 * shock-absorption tests arrive with twelve significant figures — a cell, not the record, is
 * where that gets trimmed (docs/app.md §Number display).
 */
export function displayNumber(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** Resolves the sidebar's released-after chips. No preset uses it: recency is a strategy rather
 *  than a story, so a preset takes no position on it (docs/shoe-stories.md). */
export function isoYearsAgo(now: Date, years: number): string {
  const d = new Date(now);
  // UTC accessors so the cut-off does not shift with the viewer's timezone.
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}
