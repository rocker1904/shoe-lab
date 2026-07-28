import { describe, expect, it } from 'vitest';
import { coverageOf, isSparse } from './coverage';
import { indexTests, type TestIndex } from './dataset';
import { applyPreset, PRESETS } from './presets';
import { applyFilters } from './filters';
import { FLEET, TESTS, shoe } from './test-fixtures';
import { DEFAULT_COLUMNS, defaultView, parseView, serializeView, type ViewState } from './urlstate';
import type { Shoe } from '../../../shared/types.js';

const idx = indexTests(TESTS);

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
  it('returns a complete ViewState for every id', () => {
    for (const p of PRESETS) {
      const v = applyPreset(p.id, FLEET, idx);
      expect(Object.keys(v).sort()).toEqual(['columns', 'filters', 'generations', 'sort']);
      expect(v.columns.length).toBeGreaterThan(0);
      expect(v.sort.dir).toBe('desc');
    }
  });
  it('throws on an unknown id', () => {
    expect(() => applyPreset('nope', FLEET, idx)).toThrow();
  });
  // Recency is a strategy, not a story: buying last season's model cheap and buying the newest
  // thing are both valid, and neither is implied by the session (docs/shoe-stories.md).
  it('never sets releasedAfter', () => {
    for (const p of PRESETS) expect(applyPreset(p.id, FLEET, idx).filters.releasedAfter).toBeUndefined();
  });
  // None of the metrics the stories bound is half of a superseded pair, so there is no generation
  // to choose — spec §4 requires a preset to populate it only for a pair it bounds.
  it('never populates generations', () => {
    for (const p of PRESETS) expect(applyPreset(p.id, FLEET, idx).generations).toEqual({});
  });
  it('sets its own columns rather than the global defaults', () => {
    for (const p of PRESETS) {
      expect(applyPreset(p.id, FLEET, idx).columns).not.toEqual(DEFAULT_COLUMNS);
    }
  });
  // Without this, dropping a key from a column set leaves a story sorted or filtered by a
  // number the table never shows, and every other assertion here still passes.
  it('shows every column it sorts or filters by', () => {
    for (const p of PRESETS) {
      const v = applyPreset(p.id, FLEET, idx);
      expect(v.columns, `${p.id} sorts by a hidden column`).toContain(v.sort.key);
      for (const key of Object.keys(v.filters.ranges)) {
        expect(v.columns, `${p.id} bounds ${key} without showing it`).toContain(key);
      }
    }
  });
  it('keeps a toebox column on Easy and leaves it off the fast stories', () => {
    expect(applyPreset('easy', FLEET, idx).columns).toContain('toebox-width-widest-part');
    expect(applyPreset('tempo', FLEET, idx).columns).not.toContain('toebox-width-widest-part');
    expect(applyPreset('race', FLEET, idx).columns).not.toContain('toebox-width-widest-part');
  });
});

describe('preset stories on the fixture fleet', () => {
  it('easy wants stack and affordability, and excludes carbon without excluding plates', () => {
    const view = applyPreset('easy', FLEET, idx);
    expect(view.filters.plate).toBe('not-carbon');
    expect(view.filters.ranges['heel-stack']).toEqual({ min: 36 });
    // fixture prices 140, 250, 140, 140 -> 80th percentile 140
    expect(view.filters.ranges['msrpGbp']).toEqual({ max: 140 });
    // explosiveness is a bonus, not the point, so sorting by it would contradict the filters
    expect(view.sort).toEqual({ key: 'score', dir: 'desc' });
    expect(applyFilters(FLEET, view.filters, idx).visible.map((s) => s.slug)).toEqual(['cushy']);
  });
  it('easy keeps a non-carbon plated shoe that the none token would drop', () => {
    const fleet = [
      shoe({ slug: 'nylon-daily', plate: 'plated-other', values: { '6': 38 } }),
      shoe({ slug: 'carbon-racer', plate: 'carbon', values: { '6': 38 } }),
    ];
    const view = applyPreset('easy', fleet, idx);
    expect(applyFilters(fleet, view.filters, idx).visible.map((s) => s.slug)).toEqual(['nylon-daily']);
  });
  it('tempo wants energy return, light weight and a price it can repeat', () => {
    const view = applyPreset('tempo', FLEET, idx);
    expect(view.filters.ranges['energy-return-heel']).toEqual({ min: 65 });
    // fixture weights 210, 220, 280, 300 -> 30th percentile 210
    expect(view.filters.ranges['weight']).toEqual({ max: 210 });
    expect(view.filters.ranges['msrpGbp']).toEqual({ max: 140 });
    expect(view.filters.plate).toBeUndefined(); // carbon is deliberately left to the runner
    expect(view.sort).toEqual({ key: 'energy-return-heel', dir: 'desc' });
    expect(applyFilters(FLEET, view.filters, idx).visible.map((s) => s.slug)).toEqual(['cushy']);
  });
  it('race is speed alone: no price cap and no plate requirement', () => {
    const view = applyPreset('race', FLEET, idx);
    expect(view.filters.ranges).toEqual({ weight: { max: 230 }, 'energy-return-heel': { min: 70 } });
    expect(view.filters.plate).toBeUndefined();
    expect(view.sort).toEqual({ key: 'energy-return-heel', dir: 'desc' });
    expect(applyFilters(FLEET, view.filters, idx).visible.map((s) => s.slug)).toEqual(['cushy', 'racer']);
  });
});

describe('preset thresholds track the fleet', () => {
  const priced = (slug: string, price: number) => shoe({ slug, msrpGbp: price, values: { '6': 40, '24': 200, '65': 80 } });

  it('moves the price cap when the fleet\'s price distribution moves', () => {
    const cheap = [100, 110, 120, 130, 140].map((p, i) => priced(`c${i}`, p));
    const dear = [300, 310, 320, 330, 340].map((p, i) => priced(`d${i}`, p));
    const capOf = (fleet: Shoe[]) => applyPreset('easy', fleet, idx).filters.ranges['msrpGbp']?.max;
    expect(capOf(cheap)).toBe(130);
    expect(capOf(dear)).toBe(330);
    expect(capOf(cheap)).not.toBe(capOf(dear));
  });
  it('moves tempo\'s weight ceiling when the fleet gets heavier', () => {
    const light = [180, 190, 200, 210, 220].map((w, i) => shoe({ slug: `l${i}`, values: { '24': w } }));
    const heavy = [280, 290, 300, 310, 320].map((w, i) => shoe({ slug: `h${i}`, values: { '24': w } }));
    const capOf = (fleet: Shoe[]) => applyPreset('tempo', fleet, idx).filters.ranges['weight']?.max;
    expect(capOf(light)).toBe(190);
    expect(capOf(heavy)).toBe(290);
  });
  it('omits a bound it cannot compute rather than throwing on an empty fleet', () => {
    for (const p of PRESETS) {
      expect(() => applyPreset(p.id, [], idx)).not.toThrow();
      expect(applyPreset(p.id, [], idx).filters.ranges['msrpGbp']).toBeUndefined();
    }
    // the absolute bounds are properties of a shoe, not of the market, so they survive
    expect(applyPreset('easy', [], idx).filters.ranges['heel-stack']).toEqual({ min: 36 });
    expect(applyPreset('race', [], idx).filters.ranges).toEqual({ weight: { max: 230 }, 'energy-return-heel': { min: 70 } });
    expect(applyPreset('tempo', [], idx).filters.ranges['weight']).toBeUndefined();
  });
});

describe('preset determinism', () => {
  it('returns an equal but independent view on every call', () => {
    for (const p of PRESETS) {
      const a = applyPreset(p.id, FLEET, idx);
      const b = applyPreset(p.id, FLEET, idx);
      expect(a).toEqual(b);
      a.filters.ranges['weight'] = { min: 999 };
      a.columns.push('bogus');
      expect(applyPreset(p.id, FLEET, idx)).toEqual(b);
    }
  });
  it('survives a URL round trip', () => {
    // the only place asserting that plate=not-carbon survives parseView's allowlist and that each
    // preset's columns survive the column allowlist
    for (const p of PRESETS) {
      const v = applyPreset(p.id, FLEET, idx);
      expect(parseView(serializeView(v), idx)).toEqual(v);
    }
  });
});

describe('no preset bounds a metric its own coverage warning would flag', () => {
  it('holds for every preset over the fixture fleet', () => {
    for (const p of PRESETS) {
      expect(sparseBoundKeys(applyPreset(p.id, FLEET, idx), FLEET, idx)).toEqual([]);
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
