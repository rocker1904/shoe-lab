import type { LabTest, Plate, Shoe } from '../../../shared/types.js';
import type { TestIndex } from './dataset';

/**
 * The three words a human ever sees for the plate field, in one place because they were in three
 * and drifted: the filter said `None`, the desktop cell said `—`, and most rows in the table
 * therefore claimed no reading for one the scraper derives on purpose
 * (docs/scraping.md §Data quirks). The
 * em dash is this app's glyph for an *absent* reading, and spending it here made it mean two
 * things one click apart — plate ascending put its em dashes first because `none` is a value,
 * width ascending puts its last because those are absences. The phone's name line still drops
 * `none`, which is a different rule about prose (docs/app.md §Categorical columns).
 */
export const PLATE_LABELS: Record<Plate, string> = {
  none: 'None', 'plated-other': 'Non-carbon', carbon: 'Carbon',
};

/**
 * Readings that name a choice rather than measure a quantity. They are excluded from ranges and
 * scores for the same reason — nothing can bound or average them (docs/app.md §Filters) — but they
 * are readable, comparable side by side, filterable by set membership rather than by bound, and
 * were invisible until this existed (docs/scraping.md §Readings taken from the page).
 */
export const CATEGORICAL_TEST_TYPES: ReadonlySet<string> = new Set(['option', 'bool']);

/**
 * Slugs a shoe field already owns as a column. Only `plate`: the catalogue has a `bool` test of
 * that slug, read on two shoes, while the field of that name is derived from the whole page
 * and reads Carbon / Non-carbon (docs/app.md §Categorical columns). One column cannot have
 * two sources, and the field is the better one, so the reading is not offered and never answers
 * for a cell.
 */
const FIELD_OWNED_SLUGS: ReadonlySet<string> = new Set(['plate']);

/**
 * How an option test spells "this shoe has none of the thing" — both option tests in the catalogue
 * use this literal. One home because two readings key on it and they must agree: the phone's name
 * line drops the value, and a facet checklist sinks its row to the end. An upstream rename lands
 * here, not in two conditions a screen apart.
 */
export const ABSENCE_OPTION = 'none';

export function isCategorical(test: LabTest | undefined): boolean {
  return test !== undefined && !FIELD_OWNED_SLUGS.has(test.slug) && CATEGORICAL_TEST_TYPES.has(test.type);
}

/** The two words a bool reading ever shows. One home because a cell and a tri-state both say them,
 *  and two literals a screen apart is exactly how they would come to differ. */
export const BOOL_LABELS = { true: 'Yes', false: 'No' } as const;

/**
 * The word for one raw value of one test — every kind of test, which is the whole point: the
 * catalogue's declared name for an option, `BOOL_LABELS` for a bool, and the value itself when
 * neither declares it. Keyed on the test and the value rather than on a shoe, because the values
 * that most need a word are the ones no shoe carries — a link-borne choice the catalogue has since
 * dropped has no reading anywhere to take it from.
 *
 * The bool branch is not a special case but the claim being true: without it this answers `true`
 * where every cell says Yes, and a value's word has two homes selected by whether the caller
 * happened to know the test's type (docs/policies.md §Vocabulary).
 *
 * The fallback is the cell's, for the cell's reason: an upstream addition should read as an
 * unfamiliar word rather than as a blank (docs/app.md §Categorical columns).
 */
export function facetLabel(test: LabTest, value: string): string {
  if (test.type === 'bool') return BOOL_LABELS[value as keyof typeof BOOL_LABELS] ?? value;
  return test.options?.find((o) => o.value === value)?.name ?? value;
}

/**
 * The reading as a reader should see it, or undefined when this shoe has none. Readings store the
 * option *slug*, so the word comes from `facetLabel` — the same one a checklist row shows, which is
 * what stops a cell and a control disagreeing about the same value (docs/policies.md §Vocabulary).
 */
export function categoricalValue(shoe: Shoe, key: string, idx: TestIndex): string | undefined {
  const test = idx.bySlug.get(key);
  if (!isCategorical(test)) return undefined;
  const raw = shoe.values[String(test!.id)];
  if (raw === undefined) return undefined;
  // One call for every type now that `facetLabel` owns the bool words too.
  return facetLabel(test!, String(raw));
}

/**
 * Whether the reading says this shoe *has none of the thing* — a `false` bool, or the `none`
 * choice both option tests spell that way. Distinct from having no reading at all: the desktop
 * cell prints "None" where an unread shoe gets an em dash, while the phone's name line drops it,
 * because "None · None · No" tells a reader nothing they came for
 * (docs/app.md §Categorical columns).
 */
export function isNegativeReading(shoe: Shoe, key: string, idx: TestIndex): boolean {
  const test = idx.bySlug.get(key);
  if (!isCategorical(test)) return false;
  const raw = shoe.values[String(test!.id)];
  return raw === false || raw === ABSENCE_OPTION;
}

/**
 * The rows a facet checklist draws: the test's declared choices in catalogue order, with the
 * absence sunk to the end. Sunk because the list was rendered at both widths and read rather than
 * argued about: a list ending in None reads as a scale, and one interrupted by it does not —
 * heel-tab declares None third of four, so the order it arrives in is not the order it reads in.
 *
 * The label is the catalogue's declared name and there is no fallback here: a value the catalogue
 * no longer declares has no row of its own, and reaches the checklist from the counts map, which is
 * the only place that knows a stale selection is still held.
 *
 * Anything that is not an option test answers with no rows rather than throwing — absence is how
 * this module answers every question about a reading it cannot render — and it asks `isCategorical`,
 * so a bool, a numeric test and the slug the `plate` field owns are all refused at the one door.
 */
export function facetValues(test: LabTest): { value: string; label: string }[] {
  if (!isCategorical(test) || test.type !== 'option') return [];
  const rows = (test.options ?? []).map((o) => ({ value: o.value, label: o.name }));
  return [...rows.filter((r) => r.value !== ABSENCE_OPTION), ...rows.filter((r) => r.value === ABSENCE_OPTION)];
}

/** The categorical columns the picker offers, in catalogue order. Reads the same rule as every
 *  other caller, so a field-owned slug cannot be offered twice. */
export function categoricalEntries(tests: LabTest[]): { key: string; label: string; groupId: string | null }[] {
  return tests.filter((t) => isCategorical(t))
    .map((t) => ({ key: t.slug, label: t.name, groupId: t.groupId }));
}
