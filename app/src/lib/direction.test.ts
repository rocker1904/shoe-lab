import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NUMERIC_TEST_TYPES } from './dataset';
import { DIRECTION, directionOf } from './direction';
import { EASY_SCORE_KEYS } from './score';

// The **catalogue**, not `test-fixtures.ts` `TESTS`: only `data/tests.json` carries the tests that
// exist upstream but ship with no readings yet, which is the case this guard exists for
// (docs/scraping.md §Empty tests). Resolved through `fileURLToPath` because the jsdom environment
// replaces the global `URL` with one `readFileSync` rejects (lineage.test.ts says the same).
const catalogue = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../data/tests.json'), 'utf8'),
) as { tests: { slug: string; type: string }[] };

describe('directionOf', () => {
  it('flips outsole durability, which is dent depth in mm', () => {
    expect(directionOf('outsole-durability')).toBe('lower');
  });

  it('treats size rating as neutral — 3 is true to size, not a low score', () => {
    expect(directionOf('size-rating')).toBe('neutral');
  });

  it('treats drop and stiffness as preferences, not qualities', () => {
    for (const k of ['drop', 'stiffness', 'stiffness-in-cold']) {
      expect(directionOf(k)).toBe('neutral');
    }
  });

  it('keeps the obvious ones', () => {
    expect(directionOf('weight')).toBe('lower');
    expect(directionOf('msrpGbp')).toBe('lower');
    expect(directionOf('score')).toBe('higher');
    expect(directionOf('energy-return-heel')).toBe('higher');
  });

  it('defaults an unknown key to neutral rather than guessing', () => {
    expect(directionOf('not-a-real-test')).toBe('neutral');
  });

  it('classifies every numeric test in the scraped catalogue', () => {
    const unclassified = catalogue.tests
      .filter((t) => NUMERIC_TEST_TYPES.has(t.type))
      .map((t) => t.slug)
      .filter((slug) => !(slug in DIRECTION));
    expect(unclassified).toEqual([]);
  });
});

describe('the synthetic Easy score', () => {
  it('marks both sides of the Easy score higher-is-better', () => {
    for (const key of Object.values(EASY_SCORE_KEYS)) expect(directionOf(key)).toBe('higher');
  });
});
