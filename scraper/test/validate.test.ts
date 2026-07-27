import { describe, expect, it } from 'vitest';
import { ValidationError, validateDetailsRecord, validateMetrics, validatePlateOverrides, validateShoesFile } from '../src/validate.js';
import type { MetricsFile, Plate, ShoesFile, TestsFile } from '../../shared/types.js';
import { PLATE_OVERRIDES } from '../src/plate-overrides.js';

function makeMetrics(shoeCount: number, testIds: number[] = [5, 6]): MetricsFile {
  const shoes: MetricsFile['shoes'] = {};
  for (let i = 0; i < shoeCount; i++) {
    shoes[`shoe-${i}`] = {
      name: `Shoe ${i}`, url: `https://runrepeat.com/shoe-${i}`,
      values: Object.fromEntries(testIds.map((id) => [String(id), 30 + i])),
    };
  }
  return { scrapedAt: '2026-07-26T00:00:00Z', shoes };
}
const tests: TestsFile = {
  scrapedAt: '2026-07-26T00:00:00Z', seedSlug: 's', groups: {},
  tests: Array.from({ length: 55 }, (_, i) => ({ id: i + 1, slug: `t${i + 1}`, name: `T${i + 1}`, type: 'float' as const, units: 'mm', groupId: null })),
};

describe('validateMetrics', () => {
  it('passes a healthy first run', () => {
    expect(() => validateMetrics(makeMetrics(400), null, tests)).not.toThrow();
  });
  it('rejects shoe count below absolute floor', () => {
    expect(() => validateMetrics(makeMetrics(299), null, tests)).toThrow(ValidationError);
  });
  it('rejects too few tests', () => {
    const few = { ...tests, tests: tests.tests.slice(0, 49) };
    expect(() => validateMetrics(makeMetrics(400), null, few)).toThrow(ValidationError);
  });
  it('rejects wrong value type for declared test type', () => {
    const m = makeMetrics(400);
    m.shoes['shoe-0']!.values['5'] = 'not-a-number';
    expect(() => validateMetrics(m, null, tests)).toThrow(ValidationError);
  });
  it('rejects >10% shrink vs previous run', () => {
    expect(() => validateMetrics(makeMetrics(350), makeMetrics(400), tests)).toThrow(ValidationError);
    expect(() => validateMetrics(makeMetrics(370), makeMetrics(400), tests)).not.toThrow();
  });
  it('rejects >20% vanished (slug,test) pairs even at stable count', () => {
    const prev = makeMetrics(400, [5, 6, 8, 9]);
    const next = makeMetrics(400, [5]); // 75% of pairs vanished
    expect(() => validateMetrics(next, prev, tests)).toThrow(ValidationError);
  });
});

describe('validateMetrics boundaries', () => {
  it('accepts exactly the absolute floors (300 shoes, 50 tests)', () => {
    const fifty = { ...tests, tests: tests.tests.slice(0, 50) };
    expect(() => validateMetrics(makeMetrics(300, [5, 6]), null, fifty)).not.toThrow();
  });
  it('accepts exactly 90% of the previous count and rejects one below', () => {
    expect(() => validateMetrics(makeMetrics(360), makeMetrics(400), tests)).not.toThrow();
    expect(() => validateMetrics(makeMetrics(359), makeMetrics(400), tests)).toThrow(ValidationError);
  });
  it('accepts exactly 20% vanished pairs and rejects a hair more', () => {
    const prev = makeMetrics(400, [5, 6, 7, 8, 9]);
    const exact = makeMetrics(400, [5, 6, 7, 8]); // 400/2000 pairs gone
    expect(() => validateMetrics(exact, prev, tests)).not.toThrow();
    const over = structuredClone(exact);
    delete over.shoes['shoe-0']!.values['8']; // 401/2000 pairs gone
    expect(() => validateMetrics(over, prev, tests)).toThrow(ValidationError);
  });
  it('ignores the shrink check when the previous file was empty', () => {
    const empty: MetricsFile = { scrapedAt: '2026-07-25T00:00:00Z', shoes: {} };
    expect(() => validateMetrics(makeMetrics(400), empty, tests)).not.toThrow();
  });
  it('enforces bool, option and text value types', () => {
    const typed: TestsFile = {
      ...tests,
      tests: tests.tests.map((t) =>
        t.id === 1 ? { ...t, type: 'bool' as const }
        : t.id === 2 ? { ...t, type: 'option' as const }
        : t.id === 3 ? { ...t, type: 'text' as const }
        : t),
    };
    const ok = makeMetrics(400, []);
    for (const shoe of Object.values(ok.shoes)) {
      shoe.values = { '1': true, '2': 'both-sides-semi', '3': '270', '5': 32.7 };
    }
    expect(() => validateMetrics(ok, null, typed)).not.toThrow();
    for (const [testId, bad] of [['1', 'yes'], ['2', 3], ['3', 270], ['5', '32.7']] as const) {
      const m = structuredClone(ok);
      m.shoes['shoe-0']!.values[testId] = bad;
      expect(() => validateMetrics(m, null, typed)).toThrow(ValidationError);
    }
  });
  it('rejects a value for a test missing from the catalogue', () => {
    const m = makeMetrics(400);
    m.shoes['shoe-0']!.values['999'] = 1;
    expect(() => validateMetrics(m, null, tests)).toThrow(ValidationError);
  });
});

describe('validateDetailsRecord', () => {
  it('passes tombstones and complete records, rejects broken ones', () => {
    expect(() => validateDetailsRecord({ gone: true, scrapedAt: 't' }, 's')).not.toThrow();
    expect(() => validateDetailsRecord({ scrapedAt: 't', productId: 0, name: 'X' } as any, 's')).toThrow(ValidationError);
    expect(() => validateDetailsRecord({ scrapedAt: 't', productId: 5, name: '' } as any, 's')).toThrow(ValidationError);
  });
  it('accepts a real record and rejects non-integer or negative productIds', () => {
    expect(() => validateDetailsRecord({ scrapedAt: 't', productId: 1, name: 'X' } as any, 's')).not.toThrow();
    expect(() => validateDetailsRecord({ scrapedAt: 't', productId: 1.5, name: 'X' } as any, 's')).toThrow(ValidationError);
    expect(() => validateDetailsRecord({ scrapedAt: 't', productId: -3, name: 'X' } as any, 's')).toThrow(ValidationError);
    expect(() => validateDetailsRecord({ scrapedAt: 't', name: 'X' } as any, 's')).toThrow(ValidationError);
  });
});

describe('validateShoesFile', () => {
  const good: ShoesFile = {
    builtAt: '2026-07-26T00:00:00Z', source: 'RunRepeat', groups: {}, tests: tests.tests,
    shoes: [{ slug: 'a', name: 'A', brand: null, url: 'https://runrepeat.com/a', releasedAt: null, preciseReleaseDate: false, score: null, msrpGbp: null, discontinued: false, plate: 'none', imageUrl: null, values: { '5': 1 }, details: null }],
  };
  it('passes a valid file and rejects bad plate', () => {
    expect(() => validateShoesFile(good)).not.toThrow();
    const bad = structuredClone(good);
    (bad.shoes[0] as any).plate = 'titanium';
    expect(() => validateShoesFile(bad)).toThrow(ValidationError);
  });
  it('rejects missing name/slug/values', () => {
    const bad = structuredClone(good);
    (bad.shoes[0] as any).values = null;
    expect(() => validateShoesFile(bad)).toThrow(ValidationError);
  });
  it('rejects an empty builtAt and non-array tests/shoes', () => {
    expect(() => validateShoesFile({ ...good, builtAt: '' })).toThrow(ValidationError);
    expect(() => validateShoesFile({ ...good, tests: null as any })).toThrow(ValidationError);
    expect(() => validateShoesFile({ ...good, shoes: null as any })).toThrow(ValidationError);
  });
  it('rejects blank slug or name and accepts the other plate values', () => {
    for (const field of ['slug', 'name'] as const) {
      const bad = structuredClone(good);
      (bad.shoes[0] as any)[field] = '';
      expect(() => validateShoesFile(bad)).toThrow(ValidationError);
    }
    for (const plate of ['carbon', 'plated-other'] as const) {
      const f = structuredClone(good);
      f.shoes[0]!.plate = plate;
      expect(() => validateShoesFile(f)).not.toThrow();
    }
  });
  it('accepts a file with no shoes yet still checks structure', () => {
    expect(() => validateShoesFile({ ...good, shoes: [] })).not.toThrow();
  });
});

describe('validatePlateOverrides', () => {
  // every override slug present, and none agreeing with the rules
  const healthy = (): Map<string, Plate> => {
    const m = new Map<string, Plate>();
    for (const [slug, o] of Object.entries(PLATE_OVERRIDES)) {
      m.set(slug, o.plate === 'none' ? 'plated-other' : 'none');
    }
    return m;
  };

  it('passes when every override is present and still needed', () => {
    expect(() => validatePlateOverrides(healthy())).not.toThrow();
  });
  it('rejects an override whose shoe is no longer in the dataset', () => {
    const m = healthy();
    m.delete(Object.keys(PLATE_OVERRIDES)[0]!);
    expect(() => validatePlateOverrides(m)).toThrow(/no longer in the dataset|stale/i);
  });
  it('rejects an override the rules now derive on their own', () => {
    const m = healthy();
    const [slug, o] = Object.entries(PLATE_OVERRIDES)[0]!;
    m.set(slug, o.plate);
    expect(() => validatePlateOverrides(m)).toThrow(/redundant/i);
  });
});
