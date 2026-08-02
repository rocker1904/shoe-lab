import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { categoricalEntries } from './categorical';
import { indexTests, NUMERIC_TEST_TYPES } from './dataset';
import { chipLabel, columnLabel, lineCount, MAX_LABEL_LINES, MAX_LABEL_PX, MAX_UNITS_CLEAR_PX, MAX_UNITS_PX, shortLabel, unitsPx, widestWordPx } from './labels';
import { headerUnits } from './units';
import type { LabTest } from '../../../shared/types.js';
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
) as { tests: LabTest[] };

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
  // name is 56.8px against the 48px bound, which is the same bind `shock-absorption-heel` is in.
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

describe('the width table matches the shipped header face', () => {
  it('is measured for Inter Tight, not system-ui', () => {
    // The old system-ui table had 'm' at 11.46. Inter Tight is ~10% narrower across the board, so
    // a table still carrying the old value was never re-measured after the face changed.
    expect(widestWordPx('m')).toBeLessThan(11);
  });

  it('costs an unmeasured character at least as much as the widest measured one', () => {
    // FALLBACK_PX is face-specific too: left at the old face's value it would under-charge a name
    // full of characters the table has never seen, which is the one case the bound cannot catch.
    expect(widestWordPx('€')).toBeGreaterThanOrEqual(widestWordPx('m'));
  });
});

/**
 * The header's OTHER line. Every bound above runs over `columnLabel`/`shortLabel`, so a units
 * string of any length used to ship silently — and unlike a name it has no short form to fall back
 * on and no third line to grow into, so one bound over the whole string is the whole guard
 * (docs/app.md §Table presentation).
 */
describe('the units line', () => {
  const bySlug = new Map(catalogue.tests.map((t) => [t.slug, t]));
  // Every key that can head a column, because `headerUnits` answers for the shoe fields and the
  // synthetic score keys as well as for the catalogue's own — and `score` and `msrpGbp` carry
  // units no catalogue record could have supplied.
  const keys = [...numeric.map((t) => t.slug), 'releasedAt', 'score', 'msrpGbp', 'plate',
    ...SCORE_DEFS.flatMap((def) => ZONES.map((zone) => def.keys[zone]))];

  it('keeps every unit string clear of the sort caret, which bites before the wrap does', () => {
    const fouled = keys.filter((key) => unitsPx(headerUnits(key, bySlug.get(key))) > MAX_UNITS_CLEAR_PX);
    expect(fouled).toEqual([]);
  });

  it('holds the wrap bound at seven characters, which is what an eighth is measured to cost', () => {
    expect(unitsPx('1234567')).toBeLessThanOrEqual(MAX_UNITS_PX);
    expect(unitsPx('12345678')).toBeGreaterThan(MAX_UNITS_PX);
  });

  // The caret is the tighter of the two and therefore the one the catalogue is held to. A
  // six-character string is the case that made the difference matter: it fits the line and still
  // renders with a glyph under the mark, so the wrap bound alone would have shipped it.
  it('holds the caret bound at five characters, and the wrap bound cannot see the sixth', () => {
    expect(MAX_UNITS_CLEAR_PX).toBeLessThan(MAX_UNITS_PX);
    expect(unitsPx('3=TTS')).toBeLessThanOrEqual(MAX_UNITS_CLEAR_PX);
    expect(unitsPx('123456')).toBeGreaterThan(MAX_UNITS_CLEAR_PX);
    expect(unitsPx('123456')).toBeLessThanOrEqual(MAX_UNITS_PX);
  });

  it('is measured for the phone line, not the desktop one', () => {
    // Same face and size, and the two are still different tables: the phone inherits the header
    // button's -0.02em and the desktop sets none, which is 6.76 against 7. A table copied from
    // `UNITS_ADVANCE_PX` would model the phone 0.24px per character too wide.
    expect(unitsPx('x')).toBeLessThan(7);
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

/**
 * `chipLabel` overrides the two tests whose catalogue name already carries a colon; everything
 * else takes that name unchanged. A third such name arriving upstream would put two colons on the
 * phone's name line — `Tongue: gusset type: Both sides (semi)` — with nothing failing, so the
 * guard iterates the **published** catalogue rather than a fixture. Read from `shoes.json`, not
 * `tests.json`: a test with no reading on any shoe is never a column, so it cannot reach that
 * line (docs/scraping.md §Empty tests).
 */
describe('the phone name line', () => {
  const published = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../data/shoes.json'), 'utf8'),
  ) as { tests: LabTest[] };
  const idx = indexTests(published.tests);

  it('gives every categorical column a noun that carries no colon of its own', () => {
    const entries = categoricalEntries(published.tests);
    expect(entries.length).toBeGreaterThan(0); // or the loop below asserts nothing
    for (const e of entries) {
      expect(chipLabel(e.key, idx.bySlug.get(e.key)), e.key).not.toContain(':');
    }
  });
});
