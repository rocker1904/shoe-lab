import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { easyTerms, L_OK, SA_REF, WID_CAP } from './score';
import { FLEET, TESTS, shoe } from './test-fixtures';

const idx = indexTests(TESTS);
const fixture = (slug: string) => FLEET.find((s) => s.slug === slug)!;

describe('easyTerms', () => {
  it('maps shock absorption as a ratio of a fixed reference, uncapped', () => {
    // SA has a credible true zero (about 3.6 SA per mm of stack through the origin), so the mapping
    // is a plain ratio rather than a rank (spec section 4).
    expect(easyTerms(fixture('cushy'), 'heel', idx).shockAbsorption).toBeCloseTo(140 / SA_REF, 6);
    expect(easyTerms(fixture('cushy'), 'forefoot', idx).shockAbsorption).toBeCloseTo(115 / SA_REF, 6);
  });

  it('maps energy return as the true percentage it already is', () => {
    expect(easyTerms(fixture('cushy'), 'heel', idx).energyReturn).toBeCloseTo(0.70, 6);
    expect(easyTerms(fixture('cushy'), 'forefoot', idx).energyReturn).toBeCloseTo(0.55, 6);
  });

  it('maps outsole durability as a capped reciprocal of wear rate', () => {
    // life = thickness / wear, so goodness is reciprocal: half the wear rate lasts twice as long.
    // Capped because the outsole is rarely what retires the shoe.
    expect(easyTerms(fixture('cushy'), 'heel', idx).outsoleDurability).toBe(1); // life 4.0 > L_OK
    expect(easyTerms(fixture('racer'), 'heel', idx).outsoleDurability).toBeCloseTo(0.75 / L_OK, 6);
  });

  it('maps midsole width as a capped width-over-stack ratio, per side', () => {
    // Stability is a lever from foot to ground, so the dimensionless ratio is the physical
    // quantity, and the cap differs per side because the halves are not on one scale.
    expect(easyTerms(fixture('cushy'), 'heel', idx).midsoleWidth)
      .toBeCloseTo(Math.min((95 / 40) / WID_CAP.heel, 1), 6);
    expect(easyTerms(fixture('cushy'), 'forefoot', idx).midsoleWidth)
      .toBeCloseTo(Math.min((118 / 30) / WID_CAP.forefoot, 1), 6);
  });

  it('maps heel counter stiffness off its 1-5 scale, not a percentile', () => {
    expect(easyTerms(fixture('cushy'), 'heel', idx).heelCounter).toBeCloseTo(0.75, 6);
    expect(easyTerms(fixture('trainer'), 'heel', idx).heelCounter).toBe(1);
    expect(easyTerms(shoe({ slug: 'x', values: { '19': 1 } }), 'heel', idx).heelCounter).toBe(0);
  });

  it('returns null for a missing reading rather than a zero', () => {
    const t = easyTerms(fixture('mystery'), 'heel', idx);
    expect(Object.values(t).every((v) => v === null)).toBe(true);
  });

  it('needs both thickness and wear for the durability term', () => {
    expect(easyTerms(shoe({ slug: 'a', values: { '4': 0.8 } }), 'heel', idx).outsoleDurability).toBeNull();
    expect(easyTerms(shoe({ slug: 'b', values: { '9': 3.2 } }), 'heel', idx).outsoleDurability).toBeNull();
  });

  it('treats a zero wear reading as unmeasurable rather than dividing by it', () => {
    expect(easyTerms(shoe({ slug: 'c', values: { '4': 0, '9': 3.2 } }), 'heel', idx).outsoleDurability).toBeNull();
  });

  it('every term is monotone in its reading, in the direction its mechanism says', () => {
    const t = (values: Record<string, number>) => easyTerms(shoe({ slug: 'm', values }), 'heel', idx);
    expect(t({ '68': 150 }).shockAbsorption!).toBeGreaterThan(t({ '68': 100 }).shockAbsorption!);
    expect(t({ '65': 70 }).energyReturn!).toBeGreaterThan(t({ '65': 50 }).energyReturn!);
    // Less wear is better, so the term rises as the reading falls.
    expect(t({ '4': 1.0, '9': 2.0 }).outsoleDurability!)
      .toBeGreaterThan(t({ '4': 2.0, '9': 2.0 }).outsoleDurability!);
  });
});
