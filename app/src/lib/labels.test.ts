import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NUMERIC_TEST_TYPES } from './dataset';
import { MAX_LABEL_PX, shortLabel, widestWordPx } from './labels';

// The **catalogue**, not `test-fixtures.ts` `TESTS`: a hand-written fixture can never fail on a
// name that arrives upstream, which is the whole point of the bound guard below. Resolved through
// `fileURLToPath` because the jsdom environment replaces the global `URL` with one `readFileSync`
// rejects (direction.test.ts says the same).
const catalogue = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../data/tests.json'), 'utf8'),
) as {
  tests: { slug: string; name: string; type: string; updateId: number | null;
           previousId: number | null; id: number }[];
};

// Only numeric tests can ever be a column header — `metricEntries` filters to these
// (lineage.ts), so an `option`-typed test like `leather-suede-quality` is out of scope.
const numeric = catalogue.tests.filter((t) => NUMERIC_TEST_TYPES.has(t.type));

describe('shortLabel', () => {
  it('renames outsole durability to what it measures', () => {
    expect(shortLabel('outsole-durability', 'Outsole durability')).toBe('Outsole wear');
  });

  it('falls back to the real name when it already fits', () => {
    expect(shortLabel('heel-stack', 'Heel stack')).toBe('Heel stack');
  });

  it('measures an unlisted character at the fallback rather than as zero width', () => {
    // A character the table has never been measured for must still cost something, or a name
    // full of them would sail past the bound the guard exists to hold.
    expect(widestWordPx('€€')).toBeGreaterThan(widestWordPx('ii'));
  });

  it('keeps every catalogue label inside one column at the six-column bound', () => {
    const tooWide = numeric
      .map((t) => shortLabel(t.slug, t.name))
      .filter((label) => widestWordPx(label) > MAX_LABEL_PX);
    expect(tooWide).toEqual([]);
  });

  it('never gives two simultaneously visible metrics the same label', () => {
    // A superseded pair shows one generation at a time, so sharing a label is safe there
    // and only there. Pairs are linked by updateId/previousId (lineage.ts §metricEntries).
    const byId = new Map(catalogue.tests.map((t) => [t.id, t]));
    const partner = new Map<string, string>();
    for (const t of numeric) {
      for (const other of [t.updateId, t.previousId].map((id) => (id === null ? undefined : byId.get(id)))) {
        if (other) { partner.set(t.slug, other.slug); partner.set(other.slug, t.slug); }
      }
    }
    const seen = new Map<string, string>();
    for (const t of numeric) {
      const label = shortLabel(t.slug, t.name);
      const prior = seen.get(label);
      if (prior !== undefined) expect(partner.get(prior)).toBe(t.slug);
      seen.set(label, t.slug);
    }
  });
});
