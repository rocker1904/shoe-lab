import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import type { Side } from './lineage';
import {
  ANCHORS, EASY_SCORE_KEYS, EASY_WEIGHTS, easyContributions, easyScore, easyScoreMap, easyTerms,
  L_OK, SA_REF, TERM_SD, WID_CAP,
} from './score';
import { FLEET, TESTS, shoe } from './test-fixtures';
import type { ShoesFile } from '../../../shared/types.js';

const idx = indexTests(TESTS);
const fixture = (slug: string) => FLEET.find((s) => s.slug === slug)!;
const SIDES: Side[] = ['heel', 'forefoot'];

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
    // Both stability terms too, and below their caps, where the mapping is still free to move: a
    // wider midsole on the same stack is the longer lever, and a stiffer counter holds more.
    expect(t({ '26': 95, '6': 40 }).midsoleWidth!)
      .toBeGreaterThan(t({ '26': 80, '6': 40 }).midsoleWidth!);
    expect(t({ '19': 4 }).heelCounter!).toBeGreaterThan(t({ '19': 3 }).heelCounter!);
  });
});

describe('easyScore', () => {
  it('scores nothing when any weighted term is missing', () => {
    // All-terms-required: an unscored shoe is unscored, never a zero.
    expect(easyScore(fixture('mystery'), 'heel', false, idx)).toBeNull();
    expect(easyScore(shoe({ slug: 'partial', values: { '68': 140 } }), 'heel', false, idx)).toBeNull();
  });

  it('ignores the stability terms when stability is off', () => {
    const noCounter = shoe({ slug: 'nc', values: { '68': 140, '65': 70, '4': 0.8, '9': 3.2, '6': 40, '26': 95 } });
    expect(easyScore(noCounter, 'heel', false, idx)).not.toBeNull();
    expect(easyScore(noCounter, 'heel', true, idx)).toBeNull();
  });

  it('rises when a weighted reading improves', () => {
    const base = { '68': 130, '65': 60, '4': 1.0, '9': 2.0, '6': 40, '26': 95, '19': 3 };
    expect(easyScore(shoe({ slug: 'b', values: { ...base, '68': 160 } }), 'heel', false, idx)!)
      .toBeGreaterThan(easyScore(shoe({ slug: 'a', values: base }), 'heel', false, idx)!);
  });

  it('may exceed 100, because the anchors are frozen rather than renormalised', () => {
    // The scale records that shoes improve rather than hiding it. A shoe better than anything in the
    // 2026-07-30 fleet must read above 100.
    const monster = shoe({ slug: 'future', values: { '68': 400, '65': 99, '4': 0.1, '9': 8, '6': 40, '26': 95, '19': 5 } });
    expect(easyScore(monster, 'heel', false, idx)!).toBeGreaterThan(100);
  });

  it('weights are 2:1:1 on the base terms and 1 each on the stability pair', () => {
    expect(EASY_WEIGHTS).toEqual({
      shockAbsorption: 2, outsoleDurability: 1, energyReturn: 1, midsoleWidth: 1, heelCounter: 1,
    });
  });

  it('pins every frozen constant, so an accidental recompute fails the build', () => {
    // Derived from data/ at commit baed23b. Changing one changes every published score, so it must
    // be a deliberate edit rather than a refresh side effect.
    expect(TERM_SD.heel).toEqual({
      shockAbsorption: 0.0896, outsoleDurability: 0.1614, energyReturn: 0.0758,
      midsoleWidth: 0.0872, heelCounter: 0.2712,
    });
    expect(TERM_SD.forefoot).toEqual({
      shockAbsorption: 0.0961, outsoleDurability: 0.1614, energyReturn: 0.0790,
      midsoleWidth: 0.1133, heelCounter: 0.2712,
    });
    expect(ANCHORS.heel.off).toEqual({ r0: 3.7275, r100: 8.474 });
    expect(ANCHORS.heel.on).toEqual({ r0: 4.3963, r100: 7.4104 });
    expect(ANCHORS.forefoot.off).toEqual({ r0: 3.7119, r100: 7.6771 });
    expect(ANCHORS.forefoot.on).toEqual({ r0: 3.9456, r100: 6.567 });
    expect(SA_REF).toBe(200);
    expect(L_OK).toBe(3.0);
    expect(WID_CAP).toEqual({ heel: 3.04, forefoot: 5.37 });
  });

  it('reads a different number on each side, from that side own constants', () => {
    // Identical readings on both halves, so the difference can only come from the per-side sds,
    // width cap and anchors: no absolute number transfers between the halves.
    const even = shoe({ slug: 'even', values: {
      '68': 140, '67': 140, '65': 70, '66': 70, '4': 0.8, '9': 3.2,
      '26': 95, '25': 95, '6': 40, '5': 40, '19': 4,
    } });
    for (const stability of [false, true]) {
      expect(easyScore(even, 'heel', stability, idx))
        .not.toBeCloseTo(easyScore(even, 'forefoot', stability, idx)!, 3);
    }
  });
});

describe('easyScoreMap', () => {
  it('holds an entry only for scoreable shoes', () => {
    const m = easyScoreMap(FLEET, 'heel', false, idx);
    expect(m.has('cushy')).toBe(true);
    expect(m.has('mystery')).toBe(false);
  });
});

describe('easyContributions', () => {
  it('returns one row per weighted term, with the term and its weighted contribution', () => {
    const rows = easyContributions(fixture('cushy'), 'heel', false, idx)!;
    expect(rows.map((r) => r.key)).toEqual(['shockAbsorption', 'outsoleDurability', 'energyReturn']);
    expect(easyContributions(fixture('cushy'), 'heel', true, idx)!).toHaveLength(5);
    expect(easyContributions(fixture('mystery'), 'heel', false, idx)).toBeNull();
  });
});

it('names a synthetic key per side, so nothing open-codes one and no column derives its side', () => {
  expect(EASY_SCORE_KEYS).toEqual({ heel: 'easy-score-heel', forefoot: 'easy-score-forefoot' });
});

/**
 * Read the real dataset, as direction.test.ts and lineage.test.ts do: these are properties of
 * upstream coverage, so drift must fail the build rather than surface as a wrong score. Resolved
 * through `fileURLToPath` rather than handed to `readFileSync` as a URL, because the jsdom
 * environment replaces the global `URL` with one `readFileSync` rejects.
 */
const REAL = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../data/shoes.json'), 'utf8')) as ShoesFile;
const realIdx = indexTests(REAL.tests);
const POOL = REAL.shoes.filter((s) => s.plate === 'none' || s.plate === 'plated-other');

const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

describe('the score against the real fleet', () => {
  it('delivers the nominal weights as effective influence, on either side and either toggle', () => {
    // Stage 2 exists for exactly this. Without it a term's influence is its sd on the mapped scale,
    // and outsole durability at weight 1 outweighs shock absorption at weight 2. Checked with the
    // stability pair in as well as out: five terms is the case where a coarse metric — five
    // subjective buckets — would otherwise dominate the whole function.
    for (const side of SIDES) {
      for (const stability of [false, true]) {
        const rows = POOL.map((s) => easyContributions(s, side, stability, realIdx)).filter((r) => r !== null);
        const keys = rows[0]!.map((r) => r.key);
        expect(keys, `${side}/${stability ? 'on' : 'off'}`).toHaveLength(stability ? 5 : 3);
        const spread = new Map(keys.map((k) => [k, sd(rows.map((r) => r!.find((x) => x.key === k)!.weighted))]));
        const total = [...spread.values()].reduce((a, b) => a + b, 0);
        const nominalTotal = keys.reduce((a, k) => a + EASY_WEIGHTS[k], 0);
        for (const k of keys) {
          expect(spread.get(k)! / total, `${side}/${stability ? 'on' : 'off'} ${k}`)
            .toBeCloseTo(EASY_WEIGHTS[k] / nominalTotal, 1);
        }
      }
    }
  });

  it('scores the same shoes whether stability is on or off', () => {
    // The property the whole toggle rests on: the opt-in metrics are the best-covered in the fleet,
    // so turning stability on can never change which shoes are eligible. If upstream coverage moves,
    // this must fail rather than silently shorten the list.
    for (const side of SIDES) {
      expect(easyScoreMap(POOL, side, true, realIdx).size)
        .toBe(easyScoreMap(POOL, side, false, realIdx).size);
    }
  });

  it('anchors the scale at the fleet it was derived from', () => {
    // r0 and r100 were taken from this fleet through the *published* TERM_SD values, so today the
    // best scoreable shoe reads exactly 100 and the worst exactly 0. Freezing only takes effect on
    // future refreshes. Anchors derived from unrounded sds miss the endpoints by enough for this
    // to fail, which is the mistake it exists to catch.
    for (const side of SIDES) {
      for (const stability of [false, true]) {
        const vs = [...easyScoreMap(POOL, side, stability, realIdx).values()];
        const label = `${side}/${stability ? 'on' : 'off'}`;
        expect(Math.max(...vs), label).toBeCloseTo(100, 1);
        expect(Math.min(...vs), label).toBeCloseTo(0, 1);
      }
    }
  });
});
