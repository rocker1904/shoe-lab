import type { LabTest, Shoe } from '../../../shared/types.js';
import type { TestIndex } from './dataset';

/**
 * Readings that name a choice rather than measure a quantity. They are excluded from ranges and
 * scores for the same reason — nothing can bound or average them (docs/app.md §Filters) — but they
 * are readable, comparable side by side, and were invisible until this existed
 * (docs/scraping.md §Readings taken from the page).
 */
export const CATEGORICAL_TEST_TYPES: ReadonlySet<string> = new Set(['option', 'bool']);

/**
 * Slugs a shoe field already owns as a column. Only `plate`: the catalogue has a `bool` test of
 * that slug, read on two shoes of 450, while the field of that name is derived from the whole page
 * and reads Carbon / Non-carbon plate (docs/app.md §Categorical columns). One column cannot have
 * two sources, and the field is the better one, so the reading is not offered and never answers
 * for a cell.
 */
const FIELD_OWNED_SLUGS: ReadonlySet<string> = new Set(['plate']);

export function isCategorical(test: LabTest | undefined): boolean {
  return test !== undefined && !FIELD_OWNED_SLUGS.has(test.slug) && CATEGORICAL_TEST_TYPES.has(test.type);
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

/** The categorical columns the picker offers, in catalogue order. Reads the same rule as every
 *  other caller, so a field-owned slug cannot be offered twice. */
export function categoricalEntries(tests: LabTest[]): { key: string; label: string; groupId: string | null }[] {
  return tests.filter((t) => isCategorical(t))
    .map((t) => ({ key: t.slug, label: t.name, groupId: t.groupId }));
}
