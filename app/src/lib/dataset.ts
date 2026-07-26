import type { LabTest, Shoe } from '../../../shared/types.js';

/** Test types whose values are comparable numbers (so rangeable and sortable). */
export const NUMERIC_TEST_TYPES = new Set(['float', 'score', 'percent', 'rating']);
const FIELD_KEYS = new Set(['score', 'msrpGbp']);

export interface TestIndex { bySlug: Map<string, LabTest>; byId: Map<string, LabTest> }

export function indexTests(tests: LabTest[]): TestIndex {
  return {
    bySlug: new Map(tests.map((t) => [t.slug, t])),
    byId: new Map(tests.map((t) => [String(t.id), t])),
  };
}

export function numericValue(shoe: Shoe, key: string, idx: TestIndex): number | undefined {
  if (FIELD_KEYS.has(key)) {
    const v = shoe[key as 'score' | 'msrpGbp'];
    return typeof v === 'number' ? v : undefined;
  }
  const test = idx.bySlug.get(key);
  if (!test || !NUMERIC_TEST_TYPES.has(test.type)) return undefined;
  const v = shoe.values[String(test.id)];
  return typeof v === 'number' ? v : undefined;
}

export function ageMonths(releasedAt: string | null, now: Date): number | null {
  if (!releasedAt) return null;
  const d = new Date(releasedAt);
  // UTC accessors: date-only strings parse as UTC midnight; local accessors would be off by one in UTC-negative timezones
  return Math.max(0, (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + now.getUTCMonth() - d.getUTCMonth());
}
