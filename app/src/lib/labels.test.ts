import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NUMERIC_TEST_TYPES } from './dataset';
import { columnLabel, lineCount, MAX_LABEL_LINES, MAX_LABEL_PX, shortLabel, widestWordPx } from './labels';
import type { Zone } from './lineage';
import { EASY, SCORE_DEFS } from './score-defs';
import { labTest } from './test-fixtures';

const ZONES: Zone[] = ['heel', 'forefoot'];

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

describe('columnLabel', () => {
  it('names the four shoe fields, which have no catalogue test behind them', () => {
    expect(columnLabel('releasedAt', undefined)).toBe('Released');
    expect(columnLabel('score', undefined)).toBe('RunRepeat Score');
    expect(columnLabel('msrpGbp', undefined)).toBe('Price');
    expect(columnLabel('plate', undefined)).toBe('Plate');
  });

  it('takes the catalogue name for everything else', () => {
    expect(columnLabel('weight', labTest({ id: 24, slug: 'weight', name: 'Weight' }))).toBe('Weight');
  });

  it('falls back to the slug rather than an empty header when the test is unknown', () => {
    // A column can outlive its test: `cols` is permissive, so a link can name a slug this
    // dataset no longer ships (docs/app.md §Columns and sorting).
    expect(columnLabel('gone-upstream', undefined)).toBe('gone-upstream');
  });
});

describe('shortLabel', () => {
  it('renames outsole durability to what it measures', () => {
    expect(shortLabel('outsole-durability', 'Outsole durability')).toBe('Outsole wear');
  });

  // It sits beside our own score now, so "Score" alone no longer says whose it is — and the full
  // name is 63.5px against a 52px column, which is the same bind `shock-absorption-heel` is in.
  it('shortens the RunRepeat score, whose full name overruns a phone column', () => {
    expect(widestWordPx('RunRepeat')).toBeGreaterThan(MAX_LABEL_PX);
    expect(shortLabel('score', columnLabel('score', undefined))).toBe('RR score');
    expect(widestWordPx('RR score')).toBeLessThanOrEqual(MAX_LABEL_PX);
    expect(lineCount('RR score')).toBeLessThanOrEqual(MAX_LABEL_LINES);
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

  // The width bound alone lets a name of short words grow without limit: the header is sticky, so
  // a fourth line is paid by every row on screen (docs/app.md §Columns and sorting).
  it('keeps every catalogue label inside three lines of that column', () => {
    const tooTall = numeric
      .map((t) => shortLabel(t.slug, t.name))
      .filter((label) => lineCount(label) > MAX_LABEL_LINES);
    expect(tooTall).toEqual([]);
  });

  it('counts the lines a header wraps to, so one word longer would fail the build', () => {
    expect(lineCount('Hi-vis')).toBe(1);
    expect(lineCount('Heel stack')).toBe(2);
    // "Midsole softness in cold" is a real name sitting exactly on the bound; one word more is
    // what this guard is here to catch.
    expect(lineCount('Midsole softness in cold')).toBe(MAX_LABEL_LINES);
    expect(lineCount('Midsole softness in cold weather')).toBeGreaterThan(MAX_LABEL_LINES);
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

describe('the synthetic story scores', () => {
  it('names every score column, within the phone label bound', () => {
    // One exact pin, because the label is composed by string surgery over the pair's own label and
    // that composition must stay anchored to what it has to reproduce.
    expect(columnLabel(EASY.keys.heel, undefined)).toBe('Easy heel score');
    // The catalogue-wide guards in this file iterate real tests, so the synthetic keys need their
    // own assertion or they are the column headers nothing width-checks. `lineCount` reads exactly
    // 3 against a MAX_LABEL_LINES of 3, so this is load-bearing rather than ceremonial.
    for (const def of SCORE_DEFS) {
      for (const zone of ZONES) {
        const key = def.keys[zone];
        const label = columnLabel(key, undefined);
        expect(widestWordPx(shortLabel(key, label)), label).toBeLessThanOrEqual(MAX_LABEL_PX);
        expect(lineCount(shortLabel(key, label)), label).toBeLessThanOrEqual(MAX_LABEL_LINES);
      }
    }
  });
});
