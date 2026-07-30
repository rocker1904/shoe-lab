import type { LabTest, Shoe } from '../../../shared/types.js';
import type { TestIndex } from './dataset';

/**
 * Readings that name a choice rather than measure a quantity. They are excluded from ranges and
 * scores for the same reason — nothing can bound or average them (docs/app.md §Filters) — but they
 * are readable, comparable side by side, and were invisible until this existed
 * (docs/scraping.md §Option-typed readings).
 */
export const CATEGORICAL_TEST_TYPES: ReadonlySet<string> = new Set(['option', 'bool']);

export function isCategorical(test: LabTest | undefined): boolean {
  return test !== undefined && CATEGORICAL_TEST_TYPES.has(test.type);
}

/**
 * The reading as a reader should see it, or undefined when this shoe has none. Readings store the
 * option *slug*, so the label comes from the catalogue's declared choices; an unrecognised slug
 * falls back to itself rather than vanishing, because an upstream addition should show as an
 * unfamiliar word rather than as no reading at all.
 */
export function categoricalValue(shoe: Shoe, key: string, idx: TestIndex): string | undefined {
  const test = idx.bySlug.get(key);
  if (!isCategorical(test)) return undefined;
  const raw = shoe.values[String(test!.id)];
  if (raw === undefined) return undefined;
  if (test!.type === 'bool') return raw === true ? 'Yes' : 'No';
  const label = test!.options?.find((o) => o.value === raw)?.name;
  return label ?? String(raw);
}

/** The categorical columns the picker offers, in catalogue order. */
export function categoricalEntries(tests: LabTest[]): { key: string; label: string; groupId: string | null }[] {
  return tests.filter((t) => CATEGORICAL_TEST_TYPES.has(t.type))
    .map((t) => ({ key: t.slug, label: t.name, groupId: t.groupId }));
}
