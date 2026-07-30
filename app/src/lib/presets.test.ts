import { describe, expect, it } from 'vitest';
import { coverageOf, isSparse } from './coverage';
import { indexTests, type TestIndex } from './dataset';
import { SIDE_PAIRS, sideKey, type Side } from './lineage';
import { applyPreset, PRESETS } from './presets';
import { defForPreset, EASY, RACE, TEMPO } from './score-defs';
import { sideOf } from './side';
import { applyFilters } from './filters';
import { FLEET, TESTS, shoe } from './test-fixtures';
import { defaultColumns, defaultView, parseView, serializeView, type ViewState } from './urlstate';
import type { Shoe } from '../../../shared/types.js';

const idx = indexTests(TESTS);
const STRIKES: Side[] = ['heel', 'forefoot'];
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
  });
  it('returns a complete ViewState for every id, under either strike', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        const v = applyPreset(p.id, strike, false);
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
    expect(() => applyPreset('nope', 'heel', false)).toThrow();
  });
  // Recency is a strategy, not a story: buying last season's model cheap and buying the newest
  // thing are both valid, and neither is implied by the session (docs/shoe-stories.md).
  it('never sets releasedAfter', () => {
    for (const p of PRESETS) expect(applyPreset(p.id, 'heel', false).filters.releasedAfter).toBeUndefined();
  });
  // None of the metrics the stories bound is half of a superseded pair, so there is no generation
  // to choose — spec §4 requires a preset to populate it only for a pair it bounds.
  it('never populates generations', () => {
    for (const p of PRESETS) expect(applyPreset(p.id, 'heel', false).generations).toEqual({});
  });
  it('sets its own columns rather than the global defaults', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        expect(applyPreset(p.id, strike, false).columns).not.toEqual(defaultColumns(strike));
      }
    }
  });
  // Without this, dropping a key from a column set leaves a story sorted or filtered by a
  // number the table never shows, and every other assertion here still passes.
  it('shows every column it sorts or filters by, under either strike', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        const v = applyPreset(p.id, strike, false);
        expect(v.columns, `${p.id}/${strike} sorts by a hidden column`).toContain(v.sort.key);
        for (const key of Object.keys(v.filters.ranges)) {
          expect(v.columns, `${p.id}/${strike} bounds ${key} without showing it`).toContain(key);
        }
      }
    }
  });
  // Six numeric columns is the phone bound (docs/app.md §Columns and sorting), and every story now
  // spends all six on its score and the terms behind it, so a seventh must fail here rather than
  // clip on a phone. `releasedAt` and `plate` carry words and dates rather than figures and sit
  // outside it. Pinned per story rather than as a range, so a story that quietly loses a column
  // still fails.
  const NUMERIC_COLUMN_BOUND = 6;
  const NUMERIC_COLUMNS: Record<string, number> = { easy: 6, tempo: 6, race: 6 };
  it('holds every story inside the six-numeric-column phone bound, under either strike', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        const v = applyPreset(p.id, strike, false);
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
      expect(applyPreset(p.id, 'heel', false).columns).not.toContain('toebox-width-widest-part');
    }
  });
});

describe('easy', () => {
  it('bounds nothing but the plate, and ranks by the score instead', () => {
    // The score rewards cushioning directly, so a stack floor would restate it; and the runner
    // judges value themselves, so there is no price cap.
    for (const strike of STRIKES) {
      const v = applyPreset('easy', strike, false);
      expect(Object.keys(v.filters.ranges)).toEqual([]);
      expect(v.filters.plate).toEqual(['none', 'plated-other']);
      expect(v.sort).toEqual({ key: EASY.keys[strike], dir: 'desc' });
      expect(v.columns).toContain(EASY.keys[strike]);
      // The column names its own side, so nothing downstream has to derive one.
      expect(v.columns).not.toContain(EASY.keys[strike === 'heel' ? 'forefoot' : 'heel']);
    }
  });

  it('round-trips through the URL, so the story mark survives a link', () => {
    for (const strike of STRIKES) {
      const v = applyPreset('easy', strike, false);
      expect(parseView(serializeView(v), idx)).toEqual(v);
    }
  });

  it('shows the terms it scores on rather than a metric it does not read', () => {
    // Energy return is a scoring term and was hidden; stack is not one and was shown. The sixth
    // numeric slot belongs to the term (docs/app.md §Columns and sorting).
    for (const strike of STRIKES) {
      const v = applyPreset('easy', strike, false);
      expect(v.columns, strike).toContain(sideKey('Energy return', strike));
      expect(v.columns, strike).toContain(sideKey('Shock absorption', strike));
      expect(v.columns, strike).not.toContain(sideKey('Stack', strike));
    }
  });

  it('names a side through its columns, so the side mark still derives', () => {
    for (const strike of STRIKES) {
      expect(sideOf(applyPreset('easy', strike, false))).toBe(strike);
    }
  });
});

it('carries the runner stability preference through every story', () => {
  // Otherwise the derived story mark vanishes the moment the preference is set, and clicking the
  // story again silently turns it back off.
  for (const p of PRESETS) {
    expect(applyPreset(p.id, 'heel', true).stability).toBe(true);
    expect(applyPreset(p.id, 'heel', false).stability).toBe(false);
  }
});

describe('the runner layer', () => {
  it('sorts by and shows the half the strike names', () => {
    // No story bounds anything now, so a story names its side through its score key and its
    // columns alone (docs/shoe-stories.md §Which half a story uses).
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        const v = applyPreset(p.id, strike, false);
        expect(v.sort.key, `${p.id}/${strike}`).toBe(defForPreset(p.id)!.keys[strike]);
        expect(v.columns, `${p.id}/${strike}`).toContain(sideKey('Energy return', strike));
      }
    }
  });
  it('names no slug from the other side, anywhere in the view', () => {
    for (const strike of STRIKES) {
      const other = strike === 'heel' ? 'forefoot' : 'heel';
      const wrongSide = new Set(SIDE_PAIRS.map((p) => p[other] as string));
      for (const p of PRESETS) {
        const v = applyPreset(p.id, strike, false);
        expect([...Object.keys(v.filters.ranges), ...v.columns, v.sort.key].filter((k) => wrongSide.has(k)),
          `${p.id}/${strike}`).toEqual([]);
      }
    }
  });
  // Easy's only filter is the sideless plate gate, so its pool is now identical on both sides —
  // the strike moves the ranking rather than the shortlist.
  it('returns the same Easy pool under either strike', () => {
    const count = (strike: Side) => applyFilters(FLEET, applyPreset('easy', strike, false).filters, idx).visible.length;
    expect(count('heel')).toBe(4);      // everything but the carbon racer
    expect(count('forefoot')).toBe(count('heel'));
  });
});

describe('preset stories on the fixture fleet', () => {
  it('easy excludes carbon without excluding plates, and asks for nothing else', () => {
    const view = applyPreset('easy', 'heel', false);
    expect(view.filters.plate).toEqual(['none', 'plated-other']);
    // No stack floor and no price cap: the score rewards cushioning directly, and value is the
    // runner's own call (docs/shoe-stories.md §Easy).
    expect(view.filters.ranges).toEqual({});
    expect(view.sort).toEqual({ key: EASY.keys.heel, dir: 'desc' });
    expect(applyFilters(FLEET, view.filters, idx).visible.map((s) => s.slug))
      .toEqual(['cushy', 'trainer', 'oldie', 'mystery']);
  });
  it('easy keeps a non-carbon plated shoe that a carbon-only fleet would drop', () => {
    const fleet = [
      shoe({ slug: 'nylon-daily', plate: 'plated-other', values: { '6': 38 } }),
      shoe({ slug: 'carbon-racer', plate: 'carbon', values: { '6': 38 } }),
    ];
    const view = applyPreset('easy', 'heel', false);
    expect(applyFilters(fleet, view.filters, idx).visible.map((s) => s.slug)).toEqual(['nylon-daily']);
  });
  it('tempo gates carbon out and asks for nothing else', () => {
    // The plate gate is the whole of Tempo's pool, and it is the spec's central decision: with
    // carbon in, Tempo collapses into Race (docs/shoe-stories.md §Tempo). The three bounds it used
    // to carry are gone — the score reads weight, energy return and price's absence directly.
    const view = applyPreset('tempo', 'heel', false);
    expect(view.filters.plate).toEqual(['none', 'plated-other']);
    expect(view.filters.ranges).toEqual({});
    expect(view.sort).toEqual({ key: TEMPO.keys.heel, dir: 'desc' });
    expect(applyFilters(FLEET, view.filters, idx).visible.map((s) => s.slug))
      .toEqual(['cushy', 'trainer', 'oldie', 'mystery']);
  });
  it('race is speed alone: no filter of any kind', () => {
    // The one story with no pool gate at all. Carbon is admitted rather than required, and the
    // absolute 230 g ceiling is gone because the score reads weight directly.
    const view = applyPreset('race', 'heel', false);
    expect(view.filters.ranges).toEqual({});
    expect(view.filters.plate).toBeUndefined();
    expect(view.sort).toEqual({ key: RACE.keys.heel, dir: 'desc' });
    expect(applyFilters(FLEET, view.filters, idx).visible.map((s) => s.slug))
      .toEqual(FLEET.map((s) => s.slug));
  });
});

describe('a story is a pool and a ranking', () => {
  it('reads nothing from the fleet, so an empty catalogue builds the same view', () => {
    // What the old percentile bounds needed the fleet for. A story that started reading it again
    // would be a threshold in disguise (docs/app.md §Presets).
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        expect(() => applyPreset(p.id, strike, false)).not.toThrow();
        expect(applyPreset(p.id, strike, false).filters.ranges).toEqual({});
      }
    }
  });
});

describe('preset determinism', () => {
  it('returns an equal but independent view on every call', () => {
    for (const p of PRESETS) {
      const a = applyPreset(p.id, 'heel', false);
      const b = applyPreset(p.id, 'heel', false);
      expect(a).toEqual(b);
      a.filters.ranges['weight'] = { min: 999 };
      a.columns.push('bogus');
      expect(applyPreset(p.id, 'heel', false)).toEqual(b);
    }
  });
  it('survives a URL round trip under either strike', () => {
    // the only place asserting that Easy's plate set survives parseView's allowlist, that each
    // preset's columns survive the column allowlist, and that a forefoot story reloads forefoot
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        const v = applyPreset(p.id, strike, false);
        expect(parseView(serializeView(v), idx)).toEqual(v);
      }
    }
  });
});

describe('no preset bounds a metric its own coverage warning would flag', () => {
  it('holds for every preset over the fixture fleet, under either strike', () => {
    for (const strike of STRIKES) {
      for (const p of PRESETS) {
        expect(sparseBoundKeys(applyPreset(p.id, strike, false), FLEET, idx), `${p.id}/${strike}`).toEqual([]);
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

describe('every story ranks by its own score rather than by bounds', () => {
  it('keeps carbon out of Tempo, or Tempo collapses into Race', () => {
    // The Tempo spec's central decision: a carbon-inclusive Tempo shares 11 of its top 20 with a
    // pure speed ranking against 2 without (docs/shoe-stories.md §Tempo).
    for (const strike of STRIKES) {
      expect(applyPreset('tempo', strike, false).filters.plate).toEqual(['none', 'plated-other']);
    }
  });

  it('race admits carbon and never requires it', () => {
    for (const strike of STRIKES) {
      expect(applyPreset('race', strike, false).filters.plate).toBeUndefined();
    }
  });

  it('no story carries a range bound any more', () => {
    for (const p of PRESETS) for (const strike of STRIKES) {
      expect(Object.keys(applyPreset(p.id, strike, false).filters.ranges), `${p.id}/${strike}`).toEqual([]);
    }
  });

  it('each story sorts by its own score and shows it', () => {
    for (const p of PRESETS) for (const strike of STRIKES) {
      const v = applyPreset(p.id, strike, false);
      const def = defForPreset(p.id)!;
      expect(v.sort, `${p.id}/${strike}`).toEqual({ key: def.keys[strike], dir: 'desc' });
      expect(v.columns, `${p.id}/${strike}`).toContain(def.keys[strike]);
    }
  });

  it('every story still round-trips and still names a side', () => {
    for (const p of PRESETS) for (const strike of STRIKES) {
      const v = applyPreset(p.id, strike, false);
      expect(parseView(serializeView(v), idx)).toEqual(v);
      expect(sideOf(v), `${p.id}/${strike}`).toBe(strike);
    }
  });
});
