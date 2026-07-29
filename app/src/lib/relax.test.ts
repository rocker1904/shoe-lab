import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import type { FilterState } from './filters';
import { excludedBy } from './relax';
import { FLEET, TESTS } from './test-fixtures';

const idx = indexTests(TESTS);

describe('excludedBy', () => {
  it('counts what one bound costs, given the others', () => {
    // Asserting the arithmetic against itself proves nothing; pin the number instead. Of the four
    // shoes with a weight, `trainer` and `oldie` are over 250 and priced inside the cap.
    const f: FilterState = { ranges: { weight: { max: 250 }, msrpGbp: { max: 150 } } };
    expect(excludedBy(FLEET, f, 'weight', idx)).toBe(2);
  });

  it('is order-independent — a bound costs the same however the set is written', () => {
    const a: FilterState = { ranges: { weight: { max: 250 }, msrpGbp: { max: 150 } } };
    const b: FilterState = { ranges: { msrpGbp: { max: 150 }, weight: { max: 250 } } };
    expect(excludedBy(FLEET, a, 'weight', idx)).toBe(excludedBy(FLEET, b, 'weight', idx));
  });

  it('follows showMissing, because a bound also hides shoes with no reading', () => {
    const f: FilterState = { ranges: { msrpGbp: { max: 100000 } } };
    // `mystery` has no price, so with the flag off the bound still costs one shoe...
    expect(excludedBy(FLEET, f, 'msrpGbp', idx)).toBe(1);
    // ...and with it on, nothing.
    expect(excludedBy(FLEET, { ...f, showMissing: true }, 'msrpGbp', idx)).toBe(0);
  });

  it('is conditioned on the rest of the set, not on the bound alone', () => {
    // The same weight ceiling costs less once a plate filter has already taken `trainer` out.
    const alone: FilterState = { ranges: { weight: { max: 250 } } };
    const withPlate: FilterState = { ...alone, plate: ['none', 'carbon'] };
    expect(excludedBy(FLEET, alone, 'weight', idx)).toBe(3);
    expect(excludedBy(FLEET, withPlate, 'weight', idx)).toBe(2);
  });

  it('costs nothing for a key nothing is bounded on', () => {
    expect(excludedBy(FLEET, { ranges: { weight: { max: 250 } } }, 'score', idx)).toBe(0);
  });
});
