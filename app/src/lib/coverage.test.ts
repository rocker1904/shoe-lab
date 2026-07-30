import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { LabTest, Shoe } from '../../../shared/types.js';
import { coverageOf, isSparse, SPARSE_BELOW } from './coverage';
import { indexTests } from './dataset';
import { ZONE_PAIRS } from './lineage';
import { FLEET, TESTS } from './test-fixtures';

const idx = indexTests(TESTS);

describe('coverageOf', () => {
  it('counts shoes carrying a reading', () => {
    const c = coverageOf(FLEET, 'heel-stack', idx);
    expect(c.total).toBe(FLEET.length);
    expect(c.n).toBe(FLEET.filter((s) => typeof s.values['6'] === 'number').length);
    expect(c.fraction).toBeCloseTo(c.n / c.total);
  });
  it('reports nothing for a non-numeric test, which cannot be ranged', () => {
    // reading shoe.values directly instead of via numericValue would wrongly count these
    expect(coverageOf(FLEET, 'tongue-gusset-type', idx).n).toBe(0);
  });
  it('reports nothing for an unknown key', () => {
    expect(coverageOf(FLEET, 'no-such-test', idx).n).toBe(0);
  });
  it('is zero-safe on an empty population', () => {
    expect(coverageOf([], 'heel-stack', idx)).toEqual({ n: 0, total: 0, fraction: 0 });
  });
});

describe('isSparse', () => {
  it('is true strictly below the threshold', () => {
    expect(isSparse({ n: 49, total: 100, fraction: 0.49 })).toBe(true);
    expect(isSparse({ n: 50, total: 100, fraction: SPARSE_BELOW })).toBe(false);
  });
  it('is never true for an empty population, which says nothing', () => {
    expect(isSparse({ n: 0, total: 0, fraction: 0 })).toBe(false);
  });
});


// The sidebar shows a zone pair ONE coverage figure, because both ends are read in the same test
// run. That is an assumption about the data, so it is asserted against the data rather than
// trusted (docs/app.md §Coverage, docs/operations.md §Contract-drift runbook).
describe('declared zone pairs share a coverage figure', () => {
  const shoes = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../data/shoes.json'), 'utf8'),
  ) as { shoes: Shoe[]; tests: LabTest[] };
  const idx = indexTests(shoes.tests);

  it.each(ZONE_PAIRS)('$label measures the same shoes at both ends', ({ forefoot, heel }) => {
    const f = coverageOf(shoes.shoes, forefoot, idx);
    const h = coverageOf(shoes.shoes, heel, idx);
    expect(f.n).toBe(h.n);
  });
});
