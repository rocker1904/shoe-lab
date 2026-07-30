import { describe, expect, it } from 'vitest';
import { coverageOf, isSparse } from './coverage';
import { indexTests, numericValue, type TestIndex } from './dataset';
import { SIDE_PAIRS, sideKey, type Side, type SidePairLabel } from './lineage';
import {
  applyPreset, PRESETS, PRICE_PERCENTILE,
  RACE_ENERGY_RETURN_PERCENTILE, RACE_MAX_WEIGHT,
  TEMPO_ENERGY_RETURN_PERCENTILE, TEMPO_WEIGHT_PERCENTILE,
} from './presets';
import { EASY_SCORE_KEY } from './score';
import { sideOf } from './side';
import { applyFilters } from './filters';
import { quantile } from './stats';
import { FLEET, TESTS, shoe } from './test-fixtures';
import { defaultColumns, defaultView, parseView, serializeView, type ViewState } from './urlstate';
import type { Shoe } from '../../../shared/types.js';

const idx = indexTests(TESTS);
const STRIKES: Side[] = ['heel', 'forefoot'];
const readingsOf = (key: string, fleet: Shoe[] = FLEET) =>
  fleet.map((s) => numericValue(s, key, idx)).filter((x): x is number => x !== undefined);

/**
 * Acceptance criterion 9 as a function rather than an inline loop, so it can be pointed at a
 * counter-example as well as at the presets. Uses `isSparse` rather than open-coding the
 * threshold: it has one owner, and the two disagree on an empty population.
 */
function sparseBoundKeys(view: ViewState, fleet: Shoe[], index: TestIndex): string[] {
  const { considered } = applyFilters(fleet, view.filters, index);
  return Object.keys(view.filters.ranges).filter((k) => isSparse(coverageOf(considered, k, index)));
}

describe('presets', () => {
  it('declares exactly the three stories, with unique ids and labels', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['easy', 'tempo', 'race']);
    expect(PRESETS.map((p) => p.label)).toEqual(['Easy', 'Tempo', 'Race']);
    expect(PRESETS.every((p) => p.describe.length > 0)).toBe(true);
  });
  it('returns a complete ViewState for every id, under either strike', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        const v = applyPreset(p.id, FLEET, idx, strike, false);
        expect(Object.keys(v).sort()).toEqual(['columns', 'filters', 'generations', 'rows', 'sort', 'stability']);
        // Every key a story binds is curated, so a story never needs a hand-added row — and
        // selection derivation compares this field like any other.
        expect(v.rows).toEqual([]);
        expect(v.columns.length).toBeGreaterThan(0);
        expect(v.sort.dir).toBe('desc');
      }
    }
  });
  it('throws on an unknown id', () => {
    expect(() => applyPreset('nope', FLEET, idx, 'heel', false)).toThrow();
  });
  // Recency is a strategy, not a story: buying last season's model cheap and buying the newest
  // thing are both valid, and neither is implied by the session (docs/shoe-stories.md).
  it('never sets releasedAfter', () => {
    for (const p of PRESETS) expect(applyPreset(p.id, FLEET, idx, 'heel', false).filters.releasedAfter).toBeUndefined();
  });
  // None of the metrics the stories bound is half of a superseded pair, so there is no generation
  // to choose — spec §4 requires a preset to populate it only for a pair it bounds.
  it('never populates generations', () => {
    for (const p of PRESETS) expect(applyPreset(p.id, FLEET, idx, 'heel', false).generations).toEqual({});
  });
  it('sets its own columns rather than the global defaults', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        expect(applyPreset(p.id, FLEET, idx, strike, false).columns).not.toEqual(defaultColumns(strike));
      }
    }
  });
  // Without this, dropping a key from a column set leaves a story sorted or filtered by a
  // number the table never shows, and every other assertion here still passes.
  it('shows every column it sorts or filters by, under either strike', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        const v = applyPreset(p.id, FLEET, idx, strike, false);
        expect(v.columns, `${p.id}/${strike} sorts by a hidden column`).toContain(v.sort.key);
        for (const key of Object.keys(v.filters.ranges)) {
          expect(v.columns, `${p.id}/${strike} bounds ${key} without showing it`).toContain(key);
        }
      }
    }
  });
  // Six numeric columns is the phone bound (docs/app.md §Columns and sorting): the bound the story
  // sets are checked against, so a seventh must fail here rather than clip on a phone. `releasedAt`
  // and `plate` carry words and dates rather than figures and sit outside it. Pinned per story
  // rather than as a range — Tempo and Race genuinely carry four, and a range would stop noticing.
  const NUMERIC_COLUMN_BOUND = 6;
  const NUMERIC_COLUMNS: Record<string, number> = { easy: 6, tempo: 4, race: 4 };
  it('holds every story inside the six-numeric-column phone bound, under either strike', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        const v = applyPreset(p.id, FLEET, idx, strike, false);
        const numeric = v.columns.filter((c) => c !== 'releasedAt' && c !== 'plate');
        expect(numeric, `${p.id}/${strike}`).toHaveLength(NUMERIC_COLUMNS[p.id]!);
        expect(numeric.length, `${p.id}/${strike} past the phone bound`)
          .toBeLessThanOrEqual(NUMERIC_COLUMN_BOUND);
      }
    }
  });
  // Toebox width is the one column no scoring term uses, so Easy spends its sixth numeric slot on
  // the score instead (docs/app.md §Columns and sorting).
  it('keeps a toebox column off every story', () => {
    for (const p of PRESETS) {
      expect(applyPreset(p.id, FLEET, idx, 'heel', false).columns).not.toContain('toebox-width-widest-part');
    }
  });
});

describe('easy', () => {
  it('bounds nothing but the plate, and ranks by the score instead', () => {
    // The score rewards cushioning directly, so a stack floor would restate it; and the runner
    // judges value themselves, so there is no price cap.
    for (const strike of STRIKES) {
      const v = applyPreset('easy', FLEET, idx, strike, false);
      expect(Object.keys(v.filters.ranges)).toEqual([]);
      expect(v.filters.plate).toEqual(['none', 'plated-other']);
      expect(v.sort).toEqual({ key: EASY_SCORE_KEY, dir: 'desc' });
      expect(v.columns).toContain(EASY_SCORE_KEY);
    }
  });

  it('round-trips through the URL, so the story mark survives a link', () => {
    for (const strike of STRIKES) {
      const v = applyPreset('easy', FLEET, idx, strike, false);
      expect(parseView(serializeView(v), idx)).toEqual(v);
    }
  });

  it('names a side through its columns, so the side mark still derives', () => {
    for (const strike of STRIKES) {
      expect(sideOf(applyPreset('easy', FLEET, idx, strike, false))).toBe(strike);
    }
  });
});

it('carries the runner stability preference through every story', () => {
  // Otherwise the derived story mark vanishes the moment the preference is set, and clicking the
  // story again silently turns it back off.
  for (const p of PRESETS) {
    expect(applyPreset(p.id, FLEET, idx, 'heel', true).stability).toBe(true);
    expect(applyPreset(p.id, FLEET, idx, 'heel', false).stability).toBe(false);
  }
});

/**
 * Every side-swappable bound each story sets, and the percentile it must resolve to. A bound
 * missing from here is asserted absent, which is what stops a story reintroducing an absolute
 * number on a metric that has two sides (docs/shoe-stories.md §Which half a story uses). Easy is
 * absent because it bounds nothing at all: it names its side through its columns and its sort.
 */
const SIDE_BOUNDS: Record<string, { label: SidePairLabel; percentile: number }[]> = {
  tempo: [{ label: 'Energy return', percentile: TEMPO_ENERGY_RETURN_PERCENTILE }],
  race: [{ label: 'Energy return', percentile: RACE_ENERGY_RETURN_PERCENTILE }],
};
const SIDE_SLUGS = new Set(SIDE_PAIRS.flatMap((p) => [p.forefoot, p.heel] as string[]));

describe('the runner layer', () => {
  it('bounds, sorts by and shows the half the strike names', () => {
    for (const strike of STRIKES) {
      // Easy bounds nothing, so its side shows in the columns alone.
      expect(applyPreset('easy', FLEET, idx, strike, false).columns).toContain(sideKey('Stack', strike));

      for (const id of ['tempo', 'race']) {
        const v = applyPreset(id, FLEET, idx, strike, false);
        const energy = sideKey('Energy return', strike);
        expect(v.sort.key, `${id}/${strike}`).toBe(energy);
        expect(v.columns, `${id}/${strike}`).toContain(energy);
        expect(Object.keys(v.filters.ranges), `${id}/${strike}`).toContain(energy);
      }
    }
  });
  it('names no slug from the other side, anywhere in the view', () => {
    for (const strike of STRIKES) {
      const other = strike === 'heel' ? 'forefoot' : 'heel';
      const wrongSide = new Set(SIDE_PAIRS.map((p) => p[other] as string));
      for (const p of PRESETS) {
        const v = applyPreset(p.id, FLEET, idx, strike, false);
        expect([...Object.keys(v.filters.ranges), ...v.columns, v.sort.key].filter((k) => wrongSide.has(k)),
          `${p.id}/${strike}`).toEqual([]);
      }
    }
  });
  /**
   * The bound must equal a quantile of **its own key's** readings at the declared percentile.
   * "Equals some quantile of that side's readings" is too weak: `quantile` is floor-of-rank, so
   * its result is always a reading of that key, and an implementation that computed the heel
   * quantile and stored it under the forefoot key would pass whenever the two sets overlap.
   */
  it('resolves every side-swappable bound to a percentile of that side\'s own readings', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        const v = applyPreset(p.id, FLEET, idx, strike, false);
        const expected = (SIDE_BOUNDS[p.id] ?? []).map((b) => sideKey(b.label, strike));
        expect(Object.keys(v.filters.ranges).filter((k) => SIDE_SLUGS.has(k)).sort(), `${p.id}/${strike}`)
          .toEqual([...expected].sort());
        for (const b of SIDE_BOUNDS[p.id] ?? []) {
          const key = sideKey(b.label, strike);
          const bound = v.filters.ranges[key]!;
          expect(bound.min ?? bound.max, `${p.id}/${strike} ${key}`).toBe(quantile(readingsOf(key), b.percentile));
        }
      }
    }
  });
  it('leaves the two sides on visibly different bounds, so the fixture can tell them apart', () => {
    // Without this the assertion above is satisfiable by computing on the wrong side.
    for (const p of PRESETS) {
      for (const b of SIDE_BOUNDS[p.id] ?? []) {
        expect(quantile(readingsOf(sideKey(b.label, 'heel')), b.percentile))
          .not.toBe(quantile(readingsOf(sideKey(b.label, 'forefoot')), b.percentile));
      }
    }
  });
  // Easy's only filter is the sideless plate gate, so its pool is now identical on both sides —
  // the strike moves the ranking rather than the shortlist.
  it('returns the same Easy pool under either strike', () => {
    const count = (strike: Side) => applyFilters(FLEET, applyPreset('easy', FLEET, idx, strike, false).filters, idx).visible.length;
    expect(count('heel')).toBe(4);      // everything but the carbon racer
    expect(count('forefoot')).toBe(count('heel'));
  });
});

describe('preset stories on the fixture fleet', () => {
  it('easy excludes carbon without excluding plates, and asks for nothing else', () => {
    const view = applyPreset('easy', FLEET, idx, 'heel', false);
    expect(view.filters.plate).toEqual(['none', 'plated-other']);
    // No stack floor and no price cap: the score rewards cushioning directly, and value is the
    // runner's own call (docs/shoe-stories.md §Easy).
    expect(view.filters.ranges).toEqual({});
    expect(view.sort).toEqual({ key: EASY_SCORE_KEY, dir: 'desc' });
    expect(applyFilters(FLEET, view.filters, idx).visible.map((s) => s.slug))
      .toEqual(['cushy', 'trainer', 'oldie', 'mystery']);
  });
  it('easy keeps a non-carbon plated shoe that a carbon-only fleet would drop', () => {
    const fleet = [
      shoe({ slug: 'nylon-daily', plate: 'plated-other', values: { '6': 38 } }),
      shoe({ slug: 'carbon-racer', plate: 'carbon', values: { '6': 38 } }),
    ];
    const view = applyPreset('easy', fleet, idx, 'heel', false);
    expect(applyFilters(fleet, view.filters, idx).visible.map((s) => s.slug)).toEqual(['nylon-daily']);
  });
  it('tempo asks for more than most of the fleet, on both energy return and weight', () => {
    // Both bounds are percentiles, not numbers: an absolute energy-return floor is what made this
    // story narrow, because the number that reads as "lively" sits three quarters up the fleet.
    const view = applyPreset('tempo', FLEET, idx, 'heel', false);
    expect(view.filters.ranges['energy-return-heel'])
      .toEqual({ min: quantile(readingsOf('energy-return-heel'), TEMPO_ENERGY_RETURN_PERCENTILE) });
    expect(view.filters.ranges['weight']).toEqual({ max: quantile(readingsOf('weight'), TEMPO_WEIGHT_PERCENTILE) });
    expect(view.filters.ranges['msrpGbp']).toEqual({ max: 140 });
    expect(view.filters.plate).toBeUndefined(); // carbon is deliberately left to the runner
    expect(view.sort).toEqual({ key: 'energy-return-heel', dir: 'desc' });
  });
  it('tempo raises its energy-return floor when the fleet gets livelier', () => {
    // The regression this guards is a return to an absolute floor, which would report the same
    // number for both fleets and quietly keep only the liveliest slice of a lively catalogue.
    const bound = (er: number[]) =>
      applyPreset('tempo', er.map((e, i) => shoe({ slug: `s${i}`, values: { '65': e } })), idx, 'heel', false)
        .filters.ranges['energy-return-heel']?.min;
    expect(bound([40, 45, 50, 55, 60])).toBe(50);
    expect(bound([70, 75, 80, 85, 90])).toBe(80);
  });
  it('race is speed alone: no price cap and no plate requirement', () => {
    const view = applyPreset('race', FLEET, idx, 'heel', false);
    expect(view.filters.ranges).toEqual({
      weight: { max: RACE_MAX_WEIGHT },
      'energy-return-heel': { min: quantile(readingsOf('energy-return-heel'), RACE_ENERGY_RETURN_PERCENTILE) },
    });
    expect(view.filters.plate).toBeUndefined();
    expect(view.sort).toEqual({ key: 'energy-return-heel', dir: 'desc' });
    expect(applyFilters(FLEET, view.filters, idx).visible.map((s) => s.slug)).toEqual(['cushy', 'racer']);
  });
  // Weight has no sides, so it is the one bound left free to be a property of a shoe.
  it('keeps race\'s weight ceiling absolute under either strike', () => {
    for (const strike of STRIKES) {
      expect(applyPreset('race', FLEET, idx, strike, false).filters.ranges['weight']).toEqual({ max: RACE_MAX_WEIGHT });
    }
  });
});

describe('preset thresholds track the fleet', () => {
  const priced = (slug: string, price: number) => shoe({ slug, msrpGbp: price, values: { '5': 30, '6': 40, '24': 200, '65': 80, '66': 70 } });

  it('moves the price cap when the fleet\'s price distribution moves', () => {
    const cheap = [100, 110, 120, 130, 140].map((p, i) => priced(`c${i}`, p));
    const dear = [300, 310, 320, 330, 340].map((p, i) => priced(`d${i}`, p));
    // Driven through Tempo, the one story that still caps price: Easy dropped its cap because the
    // runner judges value themselves.
    const capOf = (fleet: Shoe[]) => applyPreset('tempo', fleet, idx, 'heel', false).filters.ranges['msrpGbp']?.max;
    expect(capOf(cheap)).toBe(quantile([100, 110, 120, 130, 140], PRICE_PERCENTILE));
    expect(capOf(dear)).toBe(330);
    expect(capOf(cheap)).not.toBe(capOf(dear));
  });
  it('moves tempo\'s weight ceiling when the fleet gets heavier', () => {
    const light = [180, 190, 200, 210, 220].map((w, i) => shoe({ slug: `l${i}`, values: { '24': w } }));
    const heavy = [280, 290, 300, 310, 320].map((w, i) => shoe({ slug: `h${i}`, values: { '24': w } }));
    const capOf = (fleet: Shoe[]) => applyPreset('tempo', fleet, idx, 'heel', false).filters.ranges['weight']?.max;
    expect(capOf(light)).toBe(190);
    expect(capOf(heavy)).toBe(290);
  });
  it('omits a bound it cannot compute rather than throwing on an empty fleet', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        expect(() => applyPreset(p.id, [], idx, strike, false)).not.toThrow();
        expect(applyPreset(p.id, [], idx, strike, false).filters.ranges['msrpGbp']).toBeUndefined();
        // every side-swappable bound is a percentile now, so none of them survives an empty fleet
        for (const b of SIDE_BOUNDS[p.id] ?? []) {
          expect(applyPreset(p.id, [], idx, strike, false).filters.ranges[sideKey(b.label, strike)]).toBeUndefined();
        }
      }
    }
    // weight has no sides, so it is a property of a shoe rather than of the market and survives
    expect(applyPreset('race', [], idx, 'heel', false).filters.ranges).toEqual({ weight: { max: RACE_MAX_WEIGHT } });
    expect(applyPreset('tempo', [], idx, 'heel', false).filters.ranges['weight']).toBeUndefined();
  });
});

describe('preset determinism', () => {
  it('returns an equal but independent view on every call', () => {
    for (const p of PRESETS) {
      const a = applyPreset(p.id, FLEET, idx, 'heel', false);
      const b = applyPreset(p.id, FLEET, idx, 'heel', false);
      expect(a).toEqual(b);
      a.filters.ranges['weight'] = { min: 999 };
      a.columns.push('bogus');
      expect(applyPreset(p.id, FLEET, idx, 'heel', false)).toEqual(b);
    }
  });
  it('survives a URL round trip under either strike', () => {
    // the only place asserting that Easy's plate set survives parseView's allowlist, that each
    // preset's columns survive the column allowlist, and that a forefoot story reloads forefoot
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        const v = applyPreset(p.id, FLEET, idx, strike, false);
        expect(parseView(serializeView(v), idx)).toEqual(v);
      }
    }
  });
});

describe('no preset bounds a metric its own coverage warning would flag', () => {
  it('holds for every preset over the fixture fleet, under either strike', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        expect(sparseBoundKeys(applyPreset(p.id, FLEET, idx, strike, false), FLEET, idx), `${p.id}/${strike}`).toEqual([]);
      }
    }
  });
  it('the guard can fail: it names a bound whose metric covers only 40% of the population', () => {
    // Borderline on purpose. A control built on a 0%-covered metric proves only that isSparse works
    // at zero, and the regression this exists to catch is a softness ceiling, whose real coverage
    // sits just *above* the threshold rather than nowhere near it.
    const fleet = Array.from({ length: 10 }, (_, i) =>
      shoe({ slug: `s${i}`, values: i < 4 ? { '70': 30 } : {} }));
    expect(coverageOf(fleet, 'midsole-softness-22', idx).fraction).toBeCloseTo(0.4);
    const view = defaultView();
    view.filters.ranges['midsole-softness-22'] = { max: 35 };
    expect(sparseBoundKeys(view, fleet, idx)).toEqual(['midsole-softness-22']);
  });
});
