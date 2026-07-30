import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coverageOf, isSparse } from './coverage';
import { indexTests, type TestIndex } from './dataset';
import { zoneKey, swapZone, type Zone } from './lineage';
import {
  contributions, L_OK, SA_REF, scoreMap, scoreOf, terms, TERM_ORDER, W_REF, WID_CAP,
  type ScoreDef, type TermKey,
} from './score';
import { EASY, RACE, SCORE_DEFS, TEMPO } from './score-defs';
import { FLEET, TESTS, shoe } from './test-fixtures';
import type { Shoe, ShoesFile } from '../../../shared/types.js';

const idx = indexTests(TESTS);
const fixture = (slug: string) => FLEET.find((s) => s.slug === slug)!;
const ZONES: Zone[] = ['heel', 'forefoot'];

describe('terms', () => {
  it('maps shock absorption as a ratio of a fixed reference, uncapped', () => {
    // SA has a credible true zero (about 3.6 SA per mm of stack through the origin), so the mapping
    // is a plain ratio rather than a rank (spec section 4).
    expect(terms(fixture('cushy'), 'heel', idx).shockAbsorption).toBeCloseTo(140 / SA_REF, 6);
    expect(terms(fixture('cushy'), 'forefoot', idx).shockAbsorption).toBeCloseTo(115 / SA_REF, 6);
  });

  it('maps energy return as the true percentage it already is', () => {
    expect(terms(fixture('cushy'), 'heel', idx).energyReturn).toBeCloseTo(0.70, 6);
    expect(terms(fixture('cushy'), 'forefoot', idx).energyReturn).toBeCloseTo(0.55, 6);
  });

  it('maps outsole durability as a capped reciprocal of wear rate', () => {
    // life = thickness / wear, so goodness is reciprocal: half the wear rate lasts twice as long.
    // Capped because the outsole is rarely what retires the shoe.
    expect(terms(fixture('cushy'), 'heel', idx).outsoleDurability).toBe(1); // life 4.0 > L_OK
    expect(terms(fixture('racer'), 'heel', idx).outsoleDurability).toBeCloseTo(0.75 / L_OK, 6);
  });

  it('maps midsole width as a capped width-over-stack ratio, per zone', () => {
    // Stability is a lever from foot to ground, so the dimensionless ratio is the physical
    // quantity, and the cap differs per zone because the halves are not on one scale.
    expect(terms(fixture('cushy'), 'heel', idx).midsoleWidth)
      .toBeCloseTo(Math.min((95 / 40) / WID_CAP.heel, 1), 6);
    expect(terms(fixture('cushy'), 'forefoot', idx).midsoleWidth)
      .toBeCloseTo(Math.min((118 / 30) / WID_CAP.forefoot, 1), 6);
  });

  it('maps heel counter stiffness off its 1-5 scale, not a percentile', () => {
    expect(terms(fixture('cushy'), 'heel', idx).heelCounter).toBeCloseTo(0.75, 6);
    expect(terms(fixture('trainer'), 'heel', idx).heelCounter).toBe(1);
    expect(terms(shoe({ slug: 'x', values: { '19': 1 } }), 'heel', idx).heelCounter).toBe(0);
  });

  it('returns null for a missing reading rather than a zero', () => {
    const t = terms(fixture('mystery'), 'heel', idx);
    expect(Object.values(t).every((v) => v === null)).toBe(true);
  });

  it('needs both thickness and wear for the durability term', () => {
    expect(terms(shoe({ slug: 'a', values: { '4': 0.8 } }), 'heel', idx).outsoleDurability).toBeNull();
    expect(terms(shoe({ slug: 'b', values: { '9': 3.2 } }), 'heel', idx).outsoleDurability).toBeNull();
  });

  it('treats a zero wear reading as unmeasurable rather than dividing by it', () => {
    expect(terms(shoe({ slug: 'c', values: { '4': 0, '9': 3.2 } }), 'heel', idx).outsoleDurability).toBeNull();
  });

  it('every term is monotone in its reading, in the direction its mechanism says', () => {
    const t = (values: Record<string, number>) => terms(shoe({ slug: 'm', values }), 'heel', idx);
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

describe('scoreOf', () => {
  it('scores nothing when any weighted term is missing', () => {
    // All-terms-required: an unscored shoe is unscored, never a zero.
    expect(scoreOf(EASY, fixture('mystery'), 'heel', false, idx)).toBeNull();
    expect(scoreOf(EASY, shoe({ slug: 'partial', values: { '68': 140 } }), 'heel', false, idx)).toBeNull();
  });

  it('ignores the stability terms when stability is off', () => {
    const noCounter = shoe({ slug: 'nc', values: { '68': 140, '65': 70, '4': 0.8, '9': 3.2, '6': 40, '26': 95 } });
    expect(scoreOf(EASY, noCounter, 'heel', false, idx)).not.toBeNull();
    expect(scoreOf(EASY, noCounter, 'heel', true, idx)).toBeNull();
  });

  it('rises when a weighted reading improves', () => {
    const base = { '68': 130, '65': 60, '4': 1.0, '9': 2.0, '6': 40, '26': 95, '19': 3 };
    expect(scoreOf(EASY, shoe({ slug: 'b', values: { ...base, '68': 160 } }), 'heel', false, idx)!)
      .toBeGreaterThan(scoreOf(EASY, shoe({ slug: 'a', values: base }), 'heel', false, idx)!);
  });

  it('may exceed 100, because the anchors are frozen rather than renormalised', () => {
    // The scale records that shoes improve rather than hiding it. A shoe better than anything in the
    // 2026-07-30 fleet must read above 100.
    const monster = shoe({ slug: 'future', values: { '68': 400, '65': 99, '4': 0.1, '9': 8, '6': 40, '26': 95, '19': 5 } });
    expect(scoreOf(EASY, monster, 'heel', false, idx)!).toBeGreaterThan(100);
  });

  it('weights are 2:1:1 on the base terms and 1 each on the stability pair', () => {
    expect(EASY.weights).toEqual({ shockAbsorption: 2, outsoleDurability: 1, energyReturn: 1 });
    expect(EASY.stable!.add).toEqual({ midsoleWidth: 1, heelCounter: 1 });
  });

  it('pins every frozen constant, so an accidental recompute fails the build', () => {
    // Derived from data/ at commit baed23b. Changing one changes every published score, so it must
    // be a deliberate edit rather than a refresh zone effect.
    // `weight` is in the table although Easy does not read it: the divisors belong to the pool,
    // which Tempo shares, and a definition's weights decide which of them it uses.
    expect(EASY.sd.heel).toEqual({
      shockAbsorption: 0.0896, outsoleDurability: 0.1614, energyReturn: 0.0758,
      weight: 0.0776, midsoleWidth: 0.0872, heelCounter: 0.2712,
    });
    expect(EASY.sd.forefoot).toEqual({
      shockAbsorption: 0.0961, outsoleDurability: 0.1614, energyReturn: 0.0790,
      weight: 0.0776, midsoleWidth: 0.1133, heelCounter: 0.2712,
    });
    expect(EASY.base.anchors.heel).toEqual({ r0: 3.7275, r100: 8.474 });
    expect(EASY.stable!.anchors.heel).toEqual({ r0: 4.3963, r100: 7.4104 });
    expect(EASY.base.anchors.forefoot).toEqual({ r0: 3.7119, r100: 7.6771 });
    expect(EASY.stable!.anchors.forefoot).toEqual({ r0: 3.9456, r100: 6.567 });
    expect(SA_REF).toBe(200);
    expect(W_REF).toBe(450);
    expect(L_OK).toBe(3.0);
    expect(WID_CAP).toEqual({ heel: 3.04, forefoot: 5.37 });
  });

  it('reads a different number on each zone, from that zone own constants', () => {
    // Identical readings on both halves, so the difference can only come from the per-zone sds,
    // width cap and anchors: no absolute number transfers between the halves.
    const even = shoe({ slug: 'even', values: {
      '68': 140, '67': 140, '65': 70, '66': 70, '4': 0.8, '9': 3.2,
      '26': 95, '25': 95, '6': 40, '5': 40, '19': 4,
    } });
    for (const stability of [false, true]) {
      expect(scoreOf(EASY, even, 'heel', stability, idx))
        .not.toBeCloseTo(scoreOf(EASY, even, 'forefoot', stability, idx)!, 3);
    }
  });
});

describe('scoreMap', () => {
  it('holds an entry only for scoreable shoes', () => {
    const m = scoreMap(EASY, FLEET, 'heel', false, idx);
    expect(m.has('cushy')).toBe(true);
    expect(m.has('mystery')).toBe(false);
  });
});

describe('contributions', () => {
  it('returns one row per weighted term, with the term and its weighted contribution', () => {
    const rows = contributions(EASY, fixture('cushy'), 'heel', false, idx)!;
    expect(rows.map((r) => r.key)).toEqual(['shockAbsorption', 'outsoleDurability', 'energyReturn']);
    expect(contributions(EASY, fixture('cushy'), 'heel', true, idx)!).toHaveLength(5);
    expect(contributions(EASY, fixture('mystery'), 'heel', false, idx)).toBeNull();
  });
});

it('names a synthetic key per zone, so nothing open-codes one and no column derives its zone', () => {
  expect(EASY.keys).toEqual({ heel: 'easy-score-heel', forefoot: 'easy-score-forefoot' });
});

describe('every story definition', () => {
  it('every weighted term has a divisor on both zones, for every story', () => {
    // `Partial` plus `def.sd[zone][key]!` would make a missing divisor a silent NaN — stored by
    // `scoreMap`, whose guard is `!== null`, then sorted, washed and exported as a number-shaped
    // nothing instead of an em dash.
    for (const def of SCORE_DEFS) {
      const all = { ...def.weights, ...(def.stable?.add ?? {}) };
      for (const key of Object.keys(all) as TermKey[]) {
        for (const zone of ZONES) expect(Number.isFinite(def.sd[zone][key])).toBe(true);
      }
    }
  });

  it('a stability add never silently replaces a base weight', () => {
    // `variantOf` spreads `add` over `weights`, so a shared key overwrites rather than adds:
    // `{ shockAbsorption: 1 }` in Easy's add would drop its base weight from 2 to 1, silently.
    for (const def of SCORE_DEFS) {
      for (const k of Object.keys(def.stable?.add ?? {}) as TermKey[]) {
        expect(def.weights[k]).toBeUndefined();
      }
    }
  });
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

describe('the Easy score against the real fleet', () => {
  it('delivers the nominal weights as effective influence, on either zone and either toggle', () => {
    // Stage 2 exists for exactly this. Without it a term's influence is its sd on the mapped scale,
    // and outsole durability at weight 1 outweighs shock absorption at weight 2. Checked with the
    // stability pair in as well as out: five terms is the case where a coarse metric — five
    // subjective buckets — would otherwise dominate the whole function.
    for (const zone of ZONES) {
      for (const stability of [false, true]) {
        const rows = POOL.map((s) => contributions(EASY, s, zone, stability, realIdx)).filter((r) => r !== null);
        const keys = rows[0]!.map((r) => r.key);
        expect(keys, `${zone}/${stability ? 'on' : 'off'}`).toHaveLength(stability ? 5 : 3);
        const spread = new Map(keys.map((k) => [k, sd(rows.map((r) => r!.find((x) => x.key === k)!.weighted))]));
        const total = [...spread.values()].reduce((a, b) => a + b, 0);
        const weights = { ...EASY.weights, ...EASY.stable!.add };
        const nominalTotal = keys.reduce((a, k) => a + weights[k]!, 0);
        for (const k of keys) {
          expect(spread.get(k)! / total, `${zone}/${stability ? 'on' : 'off'} ${k}`)
            .toBeCloseTo(weights[k]! / nominalTotal, 1);
        }
      }
    }
  });

  it('scores the same shoes whether stability is on or off', () => {
    // The property the whole toggle rests on: the opt-in metrics are the best-covered in the fleet,
    // so turning stability on can never change which shoes are eligible. If upstream coverage moves,
    // this must fail rather than silently shorten the list.
    for (const zone of ZONES) {
      expect(scoreMap(EASY, POOL, zone, true, realIdx).size)
        .toBe(scoreMap(EASY, POOL, zone, false, realIdx).size);
    }
  });

  it('anchors the scale at the fleet it was derived from', () => {
    // r0 and r100 were taken from this fleet through the *published* divisors, so today the
    // best scoreable shoe reads exactly 100 and the worst exactly 0. Freezing only takes effect on
    // future refreshes. Anchors derived from unrounded sds miss the endpoints by enough for this
    // to fail, which is the mistake it exists to catch.
    for (const zone of ZONES) {
      for (const stability of [false, true]) {
        const vs = [...scoreMap(EASY, POOL, zone, stability, realIdx).values()];
        const label = `${zone}/${stability ? 'on' : 'off'}`;
        expect(Math.max(...vs), label).toBeCloseTo(100, 1);
        expect(Math.min(...vs), label).toBeCloseTo(0, 1);
      }
    }
  });
});

describe('the Tempo score against the real fleet', () => {
  it('pairs the Tempo score columns by zone', () => {
    expect(swapZone('tempo-score-heel', 'forefoot')).toBe('tempo-score-forefoot');
  });

  it('scores the plate-filtered pool and anchors on it', () => {
    for (const zone of ZONES) {
      for (const stability of [false, true]) {
        const vs = [...scoreMap(TEMPO, POOL, zone, stability, realIdx).values()];
        const label = `${zone}/${stability ? 'on' : 'off'}`;
        // The eligibility invariant Easy asserts holds for Tempo too, and for the same reason: the
        // opt-in metrics are the best-covered in the fleet.
        expect(vs.length, label).toBe(283);
        expect(Math.max(...vs), label).toBeCloseTo(100, 1);
        expect(Math.min(...vs), label).toBeCloseTo(0, 1);
      }
    }
  });

  it('shares one divisor table with Easy, by reference', () => {
    // Object identity, not value equality: `toBe` on numbers passes against a copied literal too,
    // which is the thing this exists to catch.
    expect(TEMPO.sd).toBe(EASY.sd);
  });

  it('delivers every nominal weight as effective influence, on both zones', () => {
    // Covers `weight` in particular — the only term this branch introduces, with a new mapping and
    // a new divisor, and where `w/450` written instead of `1 − w/450` would land.
    for (const zone of ZONES) {
      const rows = POOL.map((s) => contributions(TEMPO, s, zone, false, realIdx)).filter((r) => r !== null);
      const spread = (k: TermKey) => sd(rows.map((r) => r!.find((x) => x.key === k)!.weighted));
      const keys = ['energyReturn', 'weight', 'outsoleDurability', 'shockAbsorption'] as const;
      const total = keys.reduce((a, k) => a + spread(k), 0);
      const nominal = keys.reduce((a, k) => a + TEMPO.weights[k]!, 0);
      for (const k of keys) {
        expect(spread(k) / total, `${zone} ${k}`).toBeCloseTo(TEMPO.weights[k]! / nominal, 1);
      }
    }
  });

  it('ranks the archetypal tempo shoes above the fragile flats they resemble', () => {
    const r = [...scoreMap(TEMPO, POOL, 'heel', false, realIdx).entries()]
      .sort((a, b) => b[1] - a[1]).map(([slug]) => slug);
    expect(r[0]).toBe('asics-megablast');
    expect(r.indexOf('adidas-adizero-evo-sl')).toBeLessThan(5);
    expect(r.indexOf('adidas-adizero-takumi-sen-11')).toBeGreaterThan(30); // outsole life 1.0
  });
});

describe('the Race score against the real fleet', () => {
  it('pairs the Race score columns by zone', () => {
    expect(swapZone('race-score-forefoot', 'heel')).toBe('race-score-heel');
  });

  it('scores the whole fleet and anchors on it', () => {
    for (const zone of ZONES) {
      const vs = [...scoreMap(RACE, REAL.shoes, zone, false, realIdx).values()];
      expect(vs.length, zone).toBe(378);
      expect(Math.max(...vs), zone).toBeCloseTo(100, 1);
      expect(Math.min(...vs), zone).toBeCloseTo(0, 1);
    }
  });

  it('ignores the stability preference entirely', () => {
    // Race declares no stable variant, so the control is inert here — and the Toolbar says so.
    for (const zone of ZONES) {
      const off = scoreMap(RACE, REAL.shoes, zone, false, realIdx);
      const on = scoreMap(RACE, REAL.shoes, zone, true, realIdx);
      expect(on.size).toBe(off.size);
      for (const [slug, v] of off) expect(on.get(slug)).toBe(v);
    }
  });

  it('needs its own divisors, because carbon widens every spread', () => {
    expect(RACE.sd).not.toBe(EASY.sd);
    expect(RACE.sd.heel.energyReturn!).toBeGreaterThan(EASY.sd.heel.energyReturn!);
  });

  it('has no durability term, and so scores shoes the other two cannot', () => {
    expect(RACE.weights.outsoleDurability).toBeUndefined();
    expect(scoreMap(RACE, REAL.shoes, 'heel', false, realIdx).size)
      .toBeGreaterThan(scoreMap(EASY, REAL.shoes, 'heel', false, realIdx).size);
  });

  it('puts the supershoes on top without requiring a plate', () => {
    const r = [...scoreMap(RACE, REAL.shoes, 'heel', false, realIdx).entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([slug]) => slug);
    const plateOf = new Map(REAL.shoes.map((s) => [s.slug, s.plate]));
    expect(r.every((slug) => plateOf.get(slug) === 'carbon')).toBe(true);
    expect(r[0]).toBe('adidas-adizero-adios-pro-evo-3');
  });
});

/**
 * The score half of the coverage guard. `presets.test.ts` asserts that no preset *bounds* a thin
 * metric, and every story now bounds nothing — so that guard passes vacuously while six score
 * columns read metrics nothing checks. The property that survives the move from bounds to scores
 * is that no term a story weights is thin over the pool it is scored on.
 *
 * Counted on the *mapped* term rather than on a metric slug, because two terms are ratios and a
 * shoe missing either half is as unscoreable as one missing a reading outright. `isSparse` rather
 * than an open-coded 0.5: the threshold has one owner (docs/app.md §Coverage).
 */
function sparseTermKeys(
  def: ScoreDef, zone: Zone, stability: boolean, pool: Shoe[], index: TestIndex,
): TermKey[] {
  // The variant's weight set, restated from `variantOf` because that is private to the engine and
  // the guard must see the terms a *runner* can turn on, not just the declared ones.
  const weights = stability && def.stable ? { ...def.weights, ...def.stable.add } : def.weights;
  return TERM_ORDER.filter((k) => weights[k] !== undefined).filter((k) => {
    const n = pool.filter((s) => terms(s, zone, index)[k] !== null).length;
    return isSparse({ n, total: pool.length, fraction: pool.length ? n / pool.length : 0 });
  });
}

/** Each story's pool, restated from the preset that selects it: Easy and Tempo drop carbon
 *  (docs/shoe-stories.md §Tempo), Race takes the fleet. */
const POOL_OF: [ScoreDef, Shoe[], string][] = [
  [EASY, POOL, 'easy'], [TEMPO, POOL, 'tempo'], [RACE, REAL.shoes, 'race'],
];

describe('no story weights a term its own coverage warning would flag', () => {
  it('holds for every story over its own pool, on either zone and either toggle', () => {
    for (const [def, pool, id] of POOL_OF) {
      for (const zone of ZONES) {
        for (const stability of [false, true]) {
          expect(sparseTermKeys(def, zone, stability, pool, realIdx),
            `${id}/${zone}/${stability ? 'on' : 'off'}`).toEqual([]);
        }
      }
    }
  });

  it('the guard can fail: it names a term whose reading covers only 40% of the pool', () => {
    // Borderline on purpose, as its sibling in presets.test.ts is: a term stripped to nothing would
    // prove only that isSparse works at zero. Energy return is the term to thin, being the one all
    // three stories weight.
    const id = String(realIdx.bySlug.get(zoneKey('Energy return', 'heel'))!.id);
    let kept = 0;
    const thinned = REAL.shoes.map((s) => {
      if (typeof s.values[id] !== 'number' || kept >= REAL.shoes.length * 0.4) {
        const values = { ...s.values };
        delete values[id];
        return { ...s, values };
      }
      kept += 1;
      return s;
    });
    expect(coverageOf(thinned, zoneKey('Energy return', 'heel'), realIdx).fraction).toBeCloseTo(0.4);
    expect(sparseTermKeys(EASY, 'heel', false, thinned, realIdx)).toEqual(['energyReturn']);
    // and the well-covered terms are not swept up with it
    expect(sparseTermKeys(EASY, 'forefoot', false, thinned, realIdx)).toEqual([]);
  });
});
